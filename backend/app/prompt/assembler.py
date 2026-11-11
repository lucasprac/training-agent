"""Builds the narrator message list (SillyTavern Prompt Manager model).

Pure functions: the input is entities + a LabelSet; the output is the message list.
The assembler never reads raw Sage JSON and never shows probabilities to the narrator.
"""

import random
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from app.models import (
    Character,
    GlobalRule,
    LoreEntry,
    MemoryItem,
    Message,
    Persona,
    PromptPreset,
    Scenario,
    StateVariable,
)
from app.prompt.blocks import BLOCK_IDS, normalize_block_order
from app.prompt.budget import MESSAGE_OVERHEAD_TOKENS, estimate_messages, estimate_tokens
from app.prompt.macros import expand
from app.sage.labels import LabelSet
from app.sage.registry import ELSEWHERE
from app.training.state import state_lines

ROLE_RANK = {"user": 0, "assistant": 1, "system": 2}

OOC_INSTRUCTION = (
    "The last message from {{user}} is out of character. Answer it briefly, out of "
    "character, inside (( )). Do not continue the story in this reply."
)


@dataclass
class AuthorsNote:
    text: str = ""
    position: str = "in_chat"  # "after_scenario" | "in_chat"
    depth: int = 4
    frequency: int = 1

    def active(self, turn: int) -> bool:
        return bool(self.text.strip()) and self.frequency > 0 and turn % self.frequency == 0


@dataclass
class AssemblyInput:
    preset: PromptPreset
    rules: list[GlobalRule]
    scenario: Scenario
    characters: list[Character]
    persona: Persona | None
    labels: LabelSet
    lore: list[LoreEntry]  # selected and budgeted, highest priority first
    memory: list[MemoryItem]  # selected, best first
    summary: str
    history: list[Message]  # chronological, ends with the new user message
    guidance: list[str] = field(default_factory=list)
    authors_note: AuthorsNote = field(default_factory=AuthorsNote)
    turn: int = 1
    ooc: bool = False
    rng: random.Random | None = None
    now: datetime | None = None
    state_variables: list[StateVariable] = field(default_factory=list)


@dataclass
class AssemblyOutput:
    messages: list[dict[str, str]]
    sections: list[dict[str, Any]]
    trimmed: dict[str, int]
    tokens: int
    budget: int
    history_kept: int
    lore_ids: list[int]
    memory_ids: list[int]


@dataclass
class _Trim:
    examples: bool = True
    absent: bool = True
    lore_count: int = 0
    memory_count: int = 0
    history_start: int = 0


# ----------------------------------------------------------------- helpers


def _attr(value: Any) -> str:
    return str(value).replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;")


def _tag(tag_name: str, body: str, /, **attrs: Any) -> str:
    attr_text = "".join(f' {k}="{_attr(v)}"' for k, v in attrs.items() if v not in (None, ""))
    body = body.strip()
    if not body:
        return f"<{tag_name}{attr_text}/>"
    return f"<{tag_name}{attr_text}>\n{body}\n</{tag_name}>"


def _first_sentence(text: str, limit: int = 160) -> str:
    text = " ".join((text or "").split())
    for stop in (". ", "! ", "? "):
        if stop in text:
            text = text.split(stop, 1)[0] + stop.strip()
            break
    return text if len(text) <= limit else text[: limit - 1] + "…"


def present_ids(labels: LabelSet, characters: list[Character]) -> list[int]:
    label = labels.get("scene.present")
    all_ids = [c.id for c in characters]
    if label is None or label.value is None:
        return all_ids
    return [i for i in label.value if i in all_ids]


def macro_values(inp: AssemblyInput) -> dict[str, str]:
    present = present_ids(inp.labels, inp.characters)
    names = [c.name for c in inp.characters if c.id in present]
    char = names[0] if len(names) == 1 else (
        inp.characters[0].name if len(inp.characters) == 1 else "the narrator"
    )
    location = inp.labels.value("scene.location", "")
    return {
        "user": inp.persona.name if inp.persona else "User",
        "persona": inp.persona.description if inp.persona else "",
        "char": char,
        "scenario": inp.scenario.world,
        "location": "" if location == ELSEWHERE else str(location),
        "stage": str(inp.labels.value("scene.stage", "")),
        "tone": str(inp.labels.value("scene.tone", "")),
        "present": ", ".join(names),
    }


# ----------------------------------------------------------------- block renderers


class _Renderer:
    def __init__(self, inp: AssemblyInput):
        self.inp = inp
        self.values = macro_values(inp)
        self.rng = inp.rng or random.Random()
        self.now = inp.now or datetime.now()
        self.present = set(present_ids(inp.labels, inp.characters))
        self.names = {c.id: c.name for c in inp.characters}

    def x(self, text: str, **extra: str) -> str:
        return expand(text, {**self.values, **extra}, self.rng, self.now)

    # --- relative blocks
    def main_prompt(self) -> str:
        original = self.x(self.inp.preset.main_prompt)
        override = self.inp.scenario.main_prompt_override.strip()
        text = self.x(override, original=original) if override else original
        return _tag("main_prompt", text)

    def harness_legend(self) -> str:
        return _tag("harness_legend", self.x(self.inp.preset.harness_legend))

    def global_rules(self) -> str:
        rules = sorted((r for r in self.inp.rules if r.enabled), key=lambda r: r.order)
        body = "\n".join(f"- **{self.x(r.title)}:** {self.x(r.text)}" for r in rules)
        text = _tag("global_rules", body)
        if self.inp.scenario.scenario_rules.strip():
            text += "\n" + _tag("scenario_rules", self.x(self.inp.scenario.scenario_rules))
        return text

    def _lore_entry(self, entry: LoreEntry) -> str:
        secret_from = ""
        if entry.known_by:
            outsiders = [c.name for c in self.inp.characters if c.id not in entry.known_by]
            secret_from = ", ".join(outsiders)
        return _tag("entry", self.x(entry.content), title=entry.title, secret_from=secret_from)

    def lore_block(self, entries: list[LoreEntry], position: str) -> str:
        if not entries:
            return ""
        body = "\n".join(self._lore_entry(e) for e in sorted(entries, key=lambda e: e.order))
        return _tag("lore", body, position=position)

    def persona(self) -> str:
        p = self.inp.persona
        if not p:
            return ""
        return _tag("persona", self.x(p.description), name=p.name)

    def characters(self, knows: dict[int, list[MemoryItem]], include_absent: bool) -> str:
        parts: list[str] = []
        for c in self.inp.characters:
            if c.id in self.present:
                inner = [
                    _tag("description", self.x(c.description)) if c.description.strip() else "",
                    _tag("personality", self.x(c.personality)) if c.personality.strip() else "",
                    _tag("speech_style", self.x(c.speech_style)) if c.speech_style.strip() else "",
                ]
                if knows.get(c.id):
                    inner.append(_tag("knows", "\n".join(f"- {m.content}" for m in knows[c.id])))
                parts.append(_tag("character", "\n".join(i for i in inner if i), name=c.name))
            elif include_absent:
                parts.append(_tag("character_absent", _first_sentence(self.x(c.description)), name=c.name))
        return "\n".join(parts)

    def scenario(self) -> str:
        body = self.x(self.inp.scenario.world)
        themes = [t.strip() for t in self.inp.scenario.themes if t.strip()]
        if themes:
            body = body + "\n" + _tag("themes", ", ".join(themes))
        return _tag("scenario", body, title=self.inp.scenario.title)

    def memory(self, shared: list[MemoryItem], private_absent: list[MemoryItem]) -> str:
        lines = [f"- [{m.kind}] {m.content}" for m in shared]
        for m in private_absent:
            knowers = ", ".join(self.names[i] for i in m.known_by if i in self.names)
            lines.append(f'- [{m.kind}] {m.content} (known_by="{_attr(knowers)}")')
        return _tag("memory", "\n".join(lines)) if lines else ""

    def story_so_far(self) -> str:
        return _tag("story_so_far", self.inp.summary) if self.inp.summary.strip() else ""

    def examples(self) -> str:
        parts = [
            _tag("examples", self.x(c.example_dialogues), character=c.name)
            for c in self.inp.characters
            if c.id in self.present and c.example_dialogues.strip()
        ]
        return "\n".join(parts)

    def authors_note(self, top: list[LoreEntry], bottom: list[LoreEntry]) -> str:
        parts = [self._lore_entry(e) for e in sorted(top, key=lambda e: e.order)]
        parts.append(self.x(self.inp.authors_note.text))
        parts += [self._lore_entry(e) for e in sorted(bottom, key=lambda e: e.order)]
        return _tag("authors_note", "\n".join(p for p in parts if p.strip()))

    def scene_note(self) -> str:
        labels = self.inp.labels
        keys = ("scene.location", "scene.stage", "scene.tone", "scene.present")
        # Only labels that are rendered (have a value) can make the scene tentative.
        tentative = any(
            (label := labels.get(k)) is not None and label.value is not None and label.certainty != "high"
            for k in keys
        )
        location = labels.value("scene.location")
        if location == ELSEWHERE:
            location = "a new place (not yet named)"
        present_names = ", ".join(c.name for c in self.inp.characters if c.id in self.present)
        scene = _tag(
            "scene",
            "",
            location=location,
            stage=labels.value("scene.stage"),
            tone=labels.value("scene.tone"),
            present=present_names or None,
            certainty="tentative" if tentative else None,
        )
        sim_state = state_lines(self.inp.state_variables, labels, narrator_only=True)
        if sim_state:
            scene += "\n" + _tag("sim_state", "\n".join(sim_state))
        guidance = [self.x(g) for g in self.inp.guidance if g.strip()]
        if guidance:
            scene += "\n" + _tag("guidance", "\n".join(f"- {g}" for g in guidance))
        return scene

    def post_history(self) -> str:
        original = self.x(self.inp.preset.post_history)
        override = self.inp.scenario.post_history_override.strip()
        text = self.x(override, original=original) if override else original
        additions = [
            self.x(c.post_history_addition)
            for c in self.inp.characters
            if c.id in self.present and c.post_history_addition.strip()
        ]
        if additions:
            text += "\n" + "\n".join(additions)
        if self.inp.ooc:
            text += "\n" + self.x(OOC_INSTRUCTION)
        return _tag("post_history", text)


# ----------------------------------------------------------------- assembly


def _split_memory(
    memory: list[MemoryItem], present: set[int]
) -> tuple[list[MemoryItem], dict[int, list[MemoryItem]], list[MemoryItem]]:
    """Veil of knowledge: shared items, per-character <knows>, private items of absent characters."""
    shared: list[MemoryItem] = []
    knows: dict[int, list[MemoryItem]] = {}
    private_absent: list[MemoryItem] = []
    for item in memory:
        if not item.known_by:
            shared.append(item)
            continue
        present_knowers = [i for i in item.known_by if i in present]
        if present_knowers:
            for cid in present_knowers:
                knows.setdefault(cid, []).append(item)
        else:
            private_absent.append(item)
    return shared, knows, private_absent


def _render(inp: AssemblyInput, trim: _Trim) -> tuple[list[dict[str, str]], list[dict[str, Any]]]:
    r = _Renderer(inp)
    lore = inp.lore[: trim.lore_count]
    memory = inp.memory[: trim.memory_count]
    history = inp.history[trim.history_start :]

    by_position: dict[str, list[LoreEntry]] = {}
    for entry in lore:
        by_position.setdefault(entry.position, []).append(entry)

    shared, knows, private_absent = _split_memory(memory, r.present)
    an = inp.authors_note
    an_active = an.active(inp.turn)
    an_text = (
        r.authors_note(by_position.get("an_top", []), by_position.get("an_bottom", []))
        if an_active
        else ""
    )

    def block_text(block_id: str) -> str:
        if block_id == "main_prompt":
            return r.main_prompt()
        if block_id == "harness_legend":
            return r.harness_legend() if inp.preset.harness_legend.strip() else ""
        if block_id == "global_rules":
            return r.global_rules()
        if block_id == "lore_before":
            return r.lore_block(by_position.get("before_char", []), "before_char")
        if block_id == "persona":
            return r.persona()
        if block_id == "characters":
            return r.characters(knows, trim.absent)
        if block_id == "scenario":
            text = r.scenario()
            if an_active and an.position == "after_scenario":
                text += "\n" + an_text
            return text
        if block_id == "lore_after":
            return r.lore_block(by_position.get("after_char", []), "after_char")
        if block_id == "memory":
            return r.memory(shared, private_absent)
        if block_id == "story_so_far":
            return r.story_so_far()
        if block_id == "examples":
            return r.examples() if trim.examples else ""
        return ""

    # In-chat injections: (depth, role, order, content)
    injections: list[tuple[int, str, int, str, str]] = []
    if an_active and an.position == "in_chat":
        injections.append((an.depth, "system", 0, an_text, "authors_note"))
    for entry in by_position.get("at_depth", []):
        injections.append((entry.depth, entry.role, entry.order, r._lore_entry(entry), "lore_at_depth"))
    for c in inp.characters:
        if c.id in r.present and c.depth_note.strip():
            injections.append(
                (c.depth_note_depth, "system", 50, _tag("character_note", r.x(c.depth_note), name=c.name), "character_note")
            )
    injections.append((inp.preset.scene_note_depth, "system", 100, r.scene_note(), "scene_note"))

    order = normalize_block_order(inp.preset.block_order)
    messages: list[dict[str, str]] = []
    sections: list[dict[str, Any]] = []

    def push(role: str, content: str, block: str) -> None:
        if not content.strip():
            return
        sections.append({"block": block, "role": role, "tokens": estimate_tokens(content)})
        if messages and messages[-1]["role"] == role and messages[-1].get("_merge"):
            messages[-1]["content"] += "\n\n" + content
        else:
            messages.append({"role": role, "content": content, "_merge": "1"})

    for item in order:
        block_id = item["id"]
        if block_id not in BLOCK_IDS or not item["enabled"]:
            continue
        if block_id == "post_history":
            continue
        if block_id == "chat_history":
            n = len(history)
            grouped: dict[int, list[tuple[int, str, int, str, str]]] = {}
            for inj in injections:
                index = max(n - max(inj[0], 0), 0)
                grouped.setdefault(index, []).append(inj)
            for i in range(n + 1):
                for depth, role, _order, content, name in sorted(
                    grouped.get(i, []), key=lambda t: (ROLE_RANK.get(t[1], 2), t[2])
                ):
                    if content.strip():
                        messages.append({"role": role, "content": content})
                        sections.append({"block": name, "role": role, "tokens": estimate_tokens(content), "depth": depth})
                if i < n:
                    message = history[i]
                    messages.append({"role": message.role, "content": message.content})
            sections.append({"block": "chat_history", "role": "mixed", "tokens": sum(estimate_tokens(m.content) for m in history), "messages": n})
            continue
        push(item.get("role", "system"), block_text(block_id), block_id)

    phi = r.post_history()
    messages.append({"role": "system", "content": phi})
    sections.append({"block": "post_history", "role": "system", "tokens": estimate_tokens(phi)})
    clean = [{"role": m["role"], "content": m["content"]} for m in messages]
    return clean, sections


def assemble(inp: AssemblyInput) -> AssemblyOutput:
    budget = max(inp.preset.context_size - inp.preset.max_tokens, 1000)
    trim = _Trim(lore_count=len(inp.lore), memory_count=len(inp.memory))
    trimmed = {"examples": 0, "absent": 0, "lore": 0, "memory": 0, "history": 0}

    while True:
        messages, sections = _render(inp, trim)
        tokens = estimate_messages(messages)
        if tokens <= budget:
            break
        if trim.examples:
            trim.examples = False
            trimmed["examples"] = 1
        elif trim.absent:
            trim.absent = False
            trimmed["absent"] = 1
        elif trim.lore_count > 0:
            trim.lore_count -= 1
            trimmed["lore"] += 1
        elif trim.memory_count > 0:
            trim.memory_count -= 1
            trimmed["memory"] += 1
        elif trim.history_start < len(inp.history) - 1:
            # Drop as many old messages as needed in one step.
            over = tokens - budget
            while over > 0 and trim.history_start < len(inp.history) - 1:
                over -= estimate_tokens(inp.history[trim.history_start].content) + MESSAGE_OVERHEAD_TOKENS
                trim.history_start += 1
                trimmed["history"] += 1
        else:
            break  # nothing more to trim; send as is

    return AssemblyOutput(
        messages=messages,
        sections=sections,
        trimmed=trimmed,
        tokens=tokens,
        budget=budget,
        history_kept=len(inp.history) - trim.history_start,
        lore_ids=[e.id for e in inp.lore[: trim.lore_count]],
        memory_ids=[m.id for m in inp.memory[: trim.memory_count]],
    )
