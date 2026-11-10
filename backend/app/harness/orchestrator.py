"""Turn pipeline: World Info -> Sage pre-turn -> assemble -> narrate -> post-turn.

This is the only module that uses both `app.sage` and `app.prompt`.
"""

import logging
import random
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

from sqlalchemy import Engine
from sqlmodel import Session, select

from app.clients.openrouter import OpenRouterClient, OpenRouterError
from app.clients.sage import SageClient, SageError
from app.config import Settings
from app.harness import summarizer
from app.harness.state import HarnessState
from app.models import (
    Character,
    GlobalRule,
    LoreEntry,
    MemoryItem,
    Message,
    Persona,
    PromptPreset,
    RoleplaySession,
    Scenario,
    TurnTrace,
)
from app.prompt.assembler import AssemblyInput, AssemblyOutput, AuthorsNote, assemble
from app.prompt.macros import expand
from app.sage import labels as L
from app.sage.extract import (
    KIND_IMPORTANCE,
    candidate_sentences,
    location_schema,
    map_location,
    subjects_in,
)
from app.sage.registry import BY_KEY, ELSEWHERE, SageContext
from app.sage.request import (
    POST_TURN_VIEW_TOKENS,
    build_post_turn,
    build_pre_turn,
    build_sage_view,
    format_chat,
)
from app.worldinfo.activation import (
    SelectedLore,
    activate,
    apply_budget,
    finalize,
    update_timers,
)

log = logging.getLogger(__name__)

MAX_MEMORY_POOL = 120
DEGRADED_MEMORY_COUNT = 15

GUIDANCE_CAUTION = "Caution: keep this reply within the global and scenario rules."
PACING_NOTES = {
    3: "Pacing: the scene is stalling. Introduce a complication, a new arrival or a consequence.",
    2: "Pacing: keep momentum. Let the characters act on their own goals.",
}


@dataclass
class TurnContext:
    session: RoleplaySession
    scenario: Scenario
    characters: list[Character]
    persona: Persona | None
    preset: PromptPreset
    rules: list[GlobalRule]
    lore: list[LoreEntry]
    memory: list[MemoryItem]
    messages: list[Message]  # all non-blocked messages, chronological

    @property
    def persona_name(self) -> str:
        return self.persona.name if self.persona else "User"

    @property
    def narrator_history(self) -> list[Message]:
        """Messages not yet folded into the summary (the opening message counts as turn 0)."""
        upto = self.session.summary_upto_turn
        return [m for m in self.messages if upto == 0 or m.turn_index > upto]

    @property
    def model(self) -> str:
        return self.session.model or self.scenario.model or self.preset.model


def load_context(db: Session, session_id: int) -> TurnContext:
    session = db.get(RoleplaySession, session_id)
    if session is None:
        raise LookupError(f"session {session_id} not found")
    scenario = db.get(Scenario, session.scenario_id)
    if scenario is None:
        raise LookupError(f"scenario {session.scenario_id} not found")
    preset = db.exec(select(PromptPreset).order_by(PromptPreset.id)).first()
    if preset is None:
        raise LookupError("no prompt preset")
    return TurnContext(
        session=session,
        scenario=scenario,
        characters=list(db.exec(select(Character).where(Character.scenario_id == scenario.id).order_by(Character.id))),
        persona=db.get(Persona, session.persona_id) if session.persona_id else None,
        preset=preset,
        rules=list(db.exec(select(GlobalRule).where(GlobalRule.preset_id == preset.id).order_by(GlobalRule.order))),
        lore=list(db.exec(select(LoreEntry).where(LoreEntry.scenario_id == scenario.id))),
        memory=list(db.exec(select(MemoryItem).where(MemoryItem.session_id == session.id, MemoryItem.active == True))),  # noqa: E712
        messages=list(
            db.exec(
                select(Message)
                .where(Message.session_id == session.id, Message.blocked == False)  # noqa: E712
                .order_by(Message.turn_index, Message.id)
            )
        ),
    )


def rank_memory(
    memory: list[MemoryItem], characters: list[Character], present: list[int], recent_text: str
) -> list[MemoryItem]:
    lowered = recent_text.lower()
    mentioned = {c.id for c in characters if c.name and c.name.lower() in lowered}

    def score(m: MemoryItem) -> tuple:
        boost = sum(1 for s in m.subjects if s in mentioned or s in present)
        return (-(m.importance + boost), -m.source_turn, -(m.id or 0))

    return sorted(memory, key=score)[:MAX_MEMORY_POOL]


def authors_note_for(ctx: TurnContext) -> AuthorsNote:
    s, sc, p = ctx.session, ctx.scenario, ctx.preset
    text = s.authors_note if s.authors_note is not None else (sc.authors_note or p.authors_note)
    depth = next(v for v in (s.authors_note_depth, sc.authors_note_depth, p.authors_note_depth) if v is not None)
    freq = next(v for v in (s.authors_note_frequency, sc.authors_note_frequency, p.authors_note_frequency) if v is not None)
    return AuthorsNote(text=text or "", position=p.authors_note_position, depth=depth, frequency=freq)


def initial_labels(characters: list[Character]) -> L.LabelSet:
    labels = L.LabelSet()
    labels.put(L.Label(key="scene.present", value=[c.id for c in characters], certainty="low", source="default"))
    return labels


class Harness:
    def __init__(
        self,
        engine: Engine,
        sage: SageClient,
        openrouter: OpenRouterClient,
        settings: Settings,
        rng: random.Random | None = None,
    ):
        self.engine = engine
        self.sage = sage
        self.openrouter = openrouter
        self.settings = settings
        self.rng = rng or random.Random()

    # ------------------------------------------------------------- pre-turn

    async def pre_turn(self, ctx: TurnContext, history: list[Message]) -> HarnessState:
        """`history` ends with the new user message."""
        session, preset = ctx.session, ctx.preset
        turn = history[-1].turn_index
        labels = L.LabelSet.from_json(session.labels) if session.labels else initial_labels(ctx.characters)
        state = HarnessState(labels=labels)
        texts = [m.content for m in history]
        previous_location = labels.value("scene.location")

        activation = activate(
            ctx.lore, texts, turn, session.lore_timers, previous_location, self.rng
        )
        present_before = labels.value("scene.present", [c.id for c in ctx.characters])
        memory_pool = rank_memory(ctx.memory, ctx.characters, present_before, "\n".join(texts[-4:]))
        sage_ctx = SageContext(
            characters=ctx.characters,
            persona_name=ctx.persona_name,
            location_entries=[e for e in ctx.lore if e.kind == "location" and e.enabled],
            lore_pool=activation.sage_pool,
            memory_pool=memory_pool,
            present_ids=present_before,
        )
        view = build_sage_view(ctx.rules, ctx.scenario.scenario_rules, labels, ctx.characters, ctx.persona_name, history)
        built = build_pre_turn(view, sage_ctx, labels.locked_keys())
        answers: dict[str, L.Answer] = {}
        state.sage = {"questions": built.question_count}

        if not self.sage.configured:
            state.degraded.append("sage_not_configured")
        elif built.requests:
            started = time.perf_counter()
            try:
                response = await self.sage.decide_batch(built.requests, preset.sage_reasoning)
                raw, errors = L.parse_batch(response)
                answers = {built.qid_to_key.get(qid, qid): a for qid, a in raw.items()}
                state.sage["usage"] = (response.get("meta") or {}).get("usage")
                if errors:
                    state.sage["errors"] = errors
            except SageError as exc:
                state.degraded.append(f"sage_pre_turn: {exc}")
            state.sage["latency_ms"] = round((time.perf_counter() - started) * 1000)

        if state.degraded:
            L.mark_fallback(labels, turn)
            selected_lore = finalize(activation, None)
            state.memory = memory_pool[:DEGRADED_MEMORY_COUNT]
        else:
            ooc = L.apply_yesno(labels, "guard.ooc", answers.get("guard.ooc"), turn)
            limits = L.apply_yesno(labels, "guard.limits", answers.get("guard.limits"), turn)
            state.guard = {"ooc": ooc.value, "limits": limits.value}
            if limits.value is None:
                state.guidance.append(GUIDANCE_CAUTION)
            loc = L.apply_choice(labels, "scene.location", answers.get("scene.location"), BY_KEY["scene.location"].threshold, turn)
            L.apply_choice(labels, "scene.type", answers.get("scene.type"), BY_KEY["scene.type"].threshold, turn)
            L.apply_choice(labels, "scene.mood", answers.get("scene.mood"), BY_KEY["scene.mood"].threshold, turn)
            location_changed = loc.certainty == "high" and loc.value != previous_location and previous_location is not None
            L.apply_present(labels, answers.get("scene.present"), [c.id for c in ctx.characters], turn, location_changed)
            selected_lore = finalize(activation, L.tag_applies(answers.get("select.lore"), "l") or {})
            memory_applies = L.tag_applies(answers.get("select.memory"), "m")
            if memory_applies is None:
                state.memory = memory_pool[:DEGRADED_MEMORY_COUNT] if memory_pool else []
            else:
                state.memory = [m for m in memory_pool if memory_applies.get(m.id) is not False]

        if session.pacing_note:
            state.guidance.append(session.pacing_note)
        lore_budget = int(preset.context_size * preset.lore_budget_pct / 100)
        state.lore, state.lore_dropped = apply_budget(selected_lore, lore_budget)
        state.labels = labels
        return state

    def state_from_snapshot(self, ctx: TurnContext, snapshot: dict[str, Any]) -> HarnessState:
        lore_by_id = {e.id: e for e in ctx.lore}
        memory_by_id = {m.id: m for m in ctx.memory}
        return HarnessState(
            labels=L.LabelSet.from_json(snapshot.get("labels")),
            lore=[SelectedLore(lore_by_id[i["id"]], i["source"]) for i in snapshot.get("lore", []) if i["id"] in lore_by_id],
            memory=[memory_by_id[i] for i in snapshot.get("memory", []) if i in memory_by_id],
            guard=snapshot.get("guard", {"ooc": None, "limits": None}),
            guidance=snapshot.get("guidance", []),
            degraded=snapshot.get("degraded", []),
            sage={**snapshot.get("sage", {}), "reused": True},
        )

    # ------------------------------------------------------------- assembly

    def build_prompt(self, ctx: TurnContext, state: HarnessState, history: list[Message]) -> AssemblyOutput:
        lore_ranked = [s.entry for s in state.lore]
        return assemble(
            AssemblyInput(
                preset=ctx.preset,
                rules=ctx.rules,
                scenario=ctx.scenario,
                characters=ctx.characters,
                persona=ctx.persona,
                labels=state.labels,
                lore=lore_ranked,
                memory=state.memory,
                summary=ctx.session.summary,
                history=history,
                guidance=state.guidance,
                authors_note=authors_note_for(ctx),
                turn=max(history[-1].turn_index, 1) if history else 1,
                ooc=state.ooc,
                rng=self.rng,
            )
        )

    # ------------------------------------------------------------- turn

    async def run_turn(
        self, session_id: int, user_text: str | None, regenerate: bool = False
    ) -> AsyncIterator[dict[str, Any]]:
        """Yield SSE events: harness, token*, done | blocked | error."""
        with Session(self.engine) as db:
            try:
                ctx = load_context(db, session_id)
            except LookupError as exc:
                yield {"event": "error", "data": {"message": str(exc)}}
                return

            if regenerate:
                user_messages = [m for m in ctx.messages if m.role == "user"]
                if not user_messages:
                    yield {"event": "error", "data": {"message": "nothing to regenerate"}}
                    return
                user_msg = user_messages[-1]
                for m in ctx.messages:
                    if m.role == "assistant" and m.turn_index == user_msg.turn_index:
                        db.delete(m)
                db.commit()
                ctx = load_context(db, session_id)
                user_msg = db.get(Message, user_msg.id)
                if user_msg.harness:
                    state = self.state_from_snapshot(ctx, user_msg.harness)
                else:
                    history = [m for m in ctx.narrator_history if m.turn_index <= user_msg.turn_index]
                    state = await self.pre_turn(ctx, history)
            else:
                if not (user_text or "").strip():
                    yield {"event": "error", "data": {"message": "empty message"}}
                    return
                user_msg = Message(
                    session_id=session_id,
                    turn_index=ctx.session.turn_count + 1,
                    role="user",
                    content=user_text.strip(),
                )
                db.add(user_msg)
                db.commit()
                db.refresh(user_msg)
                ctx.messages.append(user_msg)
                history = [m for m in ctx.narrator_history if m.turn_index <= user_msg.turn_index]
                state = await self.pre_turn(ctx, history)

            turn = user_msg.turn_index
            user_msg.harness = state.snapshot()
            user_msg.ooc = state.ooc
            session = ctx.session
            if not regenerate:
                session.turn_count = turn
                session.labels = state.labels.model_dump()
                session.lore_timers = update_timers(session.lore_timers, state.lore, turn)
            db.add(user_msg)
            db.add(session)
            db.commit()

            if state.blocked:
                user_msg.blocked = True
                db.add(user_msg)
                db.commit()
                yield {"event": "harness", "data": {"state": state.public(), "prompt": None}}
                yield {
                    "event": "blocked",
                    "data": {
                        "message_id": user_msg.id,
                        "reason": "This message breaks the global or scenario rules. Edit it and try again.",
                    },
                }
                return

            history = [m for m in ctx.narrator_history if m.turn_index <= turn]
            prompt = self.build_prompt(ctx, state, history)
            yield {
                "event": "harness",
                "data": {"state": state.public(), "prompt": _prompt_public(prompt), "user_message_id": user_msg.id},
            }

            chunks: list[str] = []
            usage: dict[str, Any] = {}
            started = time.perf_counter()
            try:
                async for item in self.openrouter.stream_chat(
                    ctx.model or self.settings.default_model,
                    prompt.messages,
                    temperature=ctx.preset.temperature,
                    max_tokens=ctx.preset.max_tokens,
                ):
                    if item["type"] == "token":
                        chunks.append(item["text"])
                        yield {"event": "token", "data": {"text": item["text"]}}
                    else:
                        usage = {"usage": item.get("usage"), "finish_reason": item.get("finish_reason")}
            except OpenRouterError as exc:
                yield {"event": "error", "data": {"message": str(exc), "user_message_id": user_msg.id}}
                return

            reply = "".join(chunks).strip()
            assistant = Message(session_id=session_id, turn_index=turn, role="assistant", content=reply, ooc=state.ooc)
            db.add(assistant)
            trace = TurnTrace(
                session_id=session_id,
                turn_index=turn,
                data={
                    "regenerate": regenerate,
                    "harness": state.snapshot(),
                    "prompt": _prompt_public(prompt),
                    "narrator": {
                        "model": ctx.model or self.settings.default_model,
                        "latency_ms": round((time.perf_counter() - started) * 1000),
                        **usage,
                    },
                },
            )
            db.add(trace)
            db.commit()
            db.refresh(assistant)
            db.refresh(trace)
            yield {"event": "done", "data": {"message_id": assistant.id, "user_message_id": user_msg.id, **usage}}

            user_msg_id, assistant_id, trace_id = user_msg.id, assistant.id, trace.id

        # Post-turn runs after "done" on the same stream: the reply is already shown,
        # and the browser gets the memory/pacing result as a final "post_turn" event.
        if not state.ooc and reply:
            report = await self.post_turn(session_id, user_msg_id, assistant_id, trace_id)
            yield {"event": "post_turn", "data": report}

    # ------------------------------------------------------------- post-turn

    async def post_turn(self, session_id: int, user_msg_id: int, assistant_msg_id: int, trace_id: int | None = None) -> dict[str, Any]:
        report: dict[str, Any] = {"memory_added": [], "errors": []}
        try:
            with Session(self.engine) as db:
                ctx = load_context(db, session_id)
                user_msg = db.get(Message, user_msg_id)
                reply = db.get(Message, assistant_msg_id)
                if not user_msg or not reply:
                    return report
                labels = L.LabelSet.from_json(ctx.session.labels)
                present = labels.value("scene.present", [c.id for c in ctx.characters])
                turn_text = f"{ctx.persona_name}: {user_msg.content}\n\nNarrator: {reply.content}"
                if self.sage.configured:
                    await self._extract_location(labels, turn_text, ctx.persona_name, user_msg.turn_index, report)
                    sentences = candidate_sentences(user_msg.content, reply.content, ctx.persona_name, [m.content for m in ctx.memory])
                    sage_ctx = SageContext(characters=ctx.characters, persona_name=ctx.persona_name, present_ids=present)
                    recent_view = format_chat(ctx.messages[-8:], ctx.persona_name, POST_TURN_VIEW_TOKENS)
                    built = build_post_turn(turn_text, recent_view, sentences, sage_ctx)
                    answers: dict[str, L.Answer] = {}
                    if built.requests:
                        try:
                            response = await self.sage.decide_batch(built.requests)
                            raw, errors = L.parse_batch(response)
                            answers = {built.qid_to_key.get(q, q): a for q, a in raw.items()}
                            report["usage"] = (response.get("meta") or {}).get("usage")
                            if errors:
                                report["errors"].append(f"post_turn answers: {errors}")
                        except SageError as exc:
                            report["errors"].append(f"post_turn: {exc}")
                    kind_spec = BY_KEY["memory.kind"]
                    all_ids = {c.id for c in ctx.characters}
                    for index, sentence in enumerate(sentences):
                        kind = answers.get(f"memory.kind:{index}")
                        if kind is None or kind.value in (None, "none") or (kind.probability or 0) < kind_spec.threshold:
                            continue
                        applies = L.tag_applies(answers.get(f"veil.known_by:{index}"), "c")
                        # No answer (nobody present): the present characters witnessed it.
                        known_by = list(present) if applies is None else sorted(c for c, ok in applies.items() if ok is True)
                        if set(known_by) >= all_ids:
                            known_by = []  # known by every character -> shared memory
                        item = MemoryItem(
                            session_id=session_id,
                            kind=str(kind.value),
                            content=sentence,
                            subjects=subjects_in(sentence, ctx.characters),
                            known_by=known_by,
                            importance=KIND_IMPORTANCE.get(str(kind.value), 2),
                            source_turn=user_msg.turn_index,
                            probability=kind.probability,
                        )
                        db.add(item)
                        report["memory_added"].append({"kind": item.kind, "content": item.content, "known_by": known_by})
                    report["sentences_checked"] = len(sentences)
                    stalling = answers.get("pacing.stalling")
                    if stalling is not None and stalling.value is not None:
                        level = float(stalling.value)
                        note = PACING_NOTES[3] if level >= 3 else PACING_NOTES[2] if level >= 2 else ""
                        ctx.session.pacing_note = note
                        report["stalling"] = round(level, 2)
                        labels.put(L.Label(key="pacing.stalling", value=round(level, 2), probability=stalling.probability, source="sage", turn=user_msg.turn_index))

                ctx.session.labels = labels.model_dump()
                db.add(ctx.session)
                db.commit()

                await self._maybe_summarize(db, ctx, report)

                if trace_id:
                    trace = db.get(TurnTrace, trace_id)
                    if trace:
                        trace.data = {**trace.data, "post_turn": report}
                        db.add(trace)
                        db.commit()
        except Exception as exc:  # background task: never crash silently
            log.exception("post_turn failed")
            report["errors"].append(f"post_turn crashed: {exc}")
        return report

    async def _extract_location(self, labels: L.LabelSet, turn_text: str, persona_name: str, turn: int, report: dict[str, Any]) -> None:
        """Sage Extract finds the place name when the scene moved somewhere not in the lorebook."""
        label = labels.get("scene.location")
        if label is not None and (label.locked or label.value not in (None, ELSEWHERE)):
            return
        try:
            location = map_location(await self.sage.extract(turn_text[:40000], location_schema(persona_name)))
        except SageError as exc:
            report["errors"].append(f"extract: {exc}")
            return
        if location:
            labels.put(L.Label(key="scene.location", value=location, certainty="low", source="extract", turn=turn))
            report["location"] = location

    async def _maybe_summarize(self, db: Session, ctx: TurnContext, report: dict[str, Any]) -> None:
        history = ctx.narrator_history
        if not summarizer.needs_summary(history, ctx.preset.context_size):
            return
        to_fold = summarizer.messages_to_fold(history)
        if not to_fold or not self.openrouter.configured:
            return
        try:
            ctx.session.summary = await summarizer.update_summary(
                self.openrouter, self.settings.summary_model, ctx.session.summary, to_fold, ctx.persona_name
            )
            ctx.session.summary_upto_turn = to_fold[-1].turn_index
            db.add(ctx.session)
            db.commit()
            report["summarized_upto_turn"] = ctx.session.summary_upto_turn
        except OpenRouterError as exc:
            report["errors"].append(f"summary: {exc}")

    # ------------------------------------------------------------- preview

    async def preview(self, session_id: int, user_text: str, call_sage: bool = False) -> dict[str, Any]:
        """Assembled prompt for a hypothetical next message (no model call, nothing saved)."""
        with Session(self.engine) as db:
            ctx = load_context(db, session_id)
            draft = Message(session_id=session_id, turn_index=ctx.session.turn_count + 1, role="user", content=user_text or "(next message)")
            history = [*ctx.narrator_history, draft]
            if call_sage:
                state = await self.pre_turn(ctx, history)
            else:
                labels = L.LabelSet.from_json(ctx.session.labels) if ctx.session.labels else initial_labels(ctx.characters)
                activation = activate(ctx.lore, [m.content for m in history], draft.turn_index, ctx.session.lore_timers, labels.value("scene.location"), self.rng)
                kept, dropped = apply_budget(finalize(activation, None), int(ctx.preset.context_size * ctx.preset.lore_budget_pct / 100))
                memory = rank_memory(ctx.memory, ctx.characters, labels.value("scene.present", []), user_text)[:DEGRADED_MEMORY_COUNT]
                state = HarnessState(labels=labels, lore=kept, lore_dropped=dropped, memory=memory,
                                     guidance=[ctx.session.pacing_note] if ctx.session.pacing_note else [],
                                     degraded=["preview_without_sage"])
            prompt = self.build_prompt(ctx, state, history)
            return {"state": state.public(), "prompt": _prompt_public(prompt)}


def opening_message(scenario: Scenario, characters: list[Character], persona: Persona | None) -> str:
    text = scenario.opening_message.strip() or next((c.first_message for c in characters if c.first_message.strip()), "")
    values = {
        "user": persona.name if persona else "User",
        "char": characters[0].name if len(characters) == 1 else "the narrator",
        "scenario": scenario.world,
    }
    return expand(text, values)


def _prompt_public(prompt: AssemblyOutput) -> dict[str, Any]:
    return {
        "messages": prompt.messages,
        "sections": prompt.sections,
        "trimmed": prompt.trimmed,
        "tokens": prompt.tokens,
        "budget": prompt.budget,
        "history_kept": prompt.history_kept,
    }
