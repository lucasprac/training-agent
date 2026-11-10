"""Builds Sage requests from the registry and the turn context.

Sage gets its own compact "Sage view" of the conversation, separate from the narrator
prompt: rules, current labels, recent messages with speaker names, and the new message.
"""

from dataclasses import dataclass
from typing import Any

from app.models import Character, GlobalRule, Message
from app.prompt.budget import estimate_tokens
from app.sage.labels import LabelSet
from app.sage.registry import (
    BY_KEY,
    SageContext,
    build_question,
    question_id,
    specs_for,
)

SAGE_VIEW_TOKENS = 6000
POST_TURN_VIEW_TOKENS = 3000


@dataclass
class BuiltRequest:
    requests: list[dict[str, Any]]
    qid_to_key: dict[str, str]

    @property
    def question_count(self) -> int:
        return sum(len(group["questions"]) for group in self.requests)


def speaker(message: Message, persona_name: str) -> str:
    return persona_name if message.role == "user" else "Narrator"


def format_chat(messages: list[Message], persona_name: str, budget_tokens: int) -> str:
    """Newest messages first into the budget, then print in chronological order."""
    lines: list[str] = []
    used = 0
    for message in reversed(messages):
        line = f"{speaker(message, persona_name)}: {message.content.strip()}"
        cost = estimate_tokens(line)
        if lines and used + cost > budget_tokens:
            break
        if not lines and cost > budget_tokens:
            line = line[: budget_tokens * 4]
            cost = budget_tokens
        lines.append(line)
        used += cost
    return "\n\n".join(reversed(lines))


def rules_text(rules: list[GlobalRule], scenario_rules: str) -> str:
    parts = ["GLOBAL RULES:"]
    parts += [f"- {r.title}: {r.text}" for r in rules if r.enabled]
    if scenario_rules.strip():
        parts += ["SCENARIO RULES:", scenario_rules.strip()]
    return "\n".join(parts)


def scene_text(labels: LabelSet, characters: list[Character]) -> str:
    names = {c.id: c.name for c in characters}
    present = ", ".join(names[i] for i in labels.value("scene.present", []) if i in names)
    return (
        f"location: {labels.value('scene.location', 'unknown')}; "
        f"type: {labels.value('scene.type', 'unknown')}; "
        f"mood: {labels.value('scene.mood', 'unknown')}; "
        f"present: {present or 'unknown'}"
    )


def build_sage_view(
    rules: list[GlobalRule],
    scenario_rules: str,
    labels: LabelSet,
    characters: list[Character],
    persona_name: str,
    history: list[Message],
    budget_tokens: int = SAGE_VIEW_TOKENS,
) -> str:
    """`history` is oldest -> newest and ends with the new user message."""
    header = "\n".join(
        [
            "<rules>",
            rules_text(rules, scenario_rules),
            "</rules>",
            f"<scene_state>{scene_text(labels, characters)}</scene_state>",
            f"<cast>{persona_name} is the player. Characters: "
            + (", ".join(c.name for c in characters) or "none")
            + "</cast>",
        ]
    )
    remaining = max(budget_tokens - estimate_tokens(header) - 50, 500)
    earlier, last = history[:-1], history[-1:]
    last_text = format_chat(last, persona_name, remaining // 2) if last else ""
    earlier_text = format_chat(earlier, persona_name, remaining - estimate_tokens(last_text))
    return (
        f"{header}\n<chat>\n{earlier_text}\n</chat>\n"
        f"<last_message>\n{last_text}\n</last_message>"
    )


def build_pre_turn(view: str, ctx: SageContext, locked: set[str]) -> BuiltRequest:
    questions: list[dict[str, Any]] = []
    qid_to_key: dict[str, str] = {}
    for spec in specs_for("pre_turn"):
        if spec.key in locked and spec.lockable:
            continue
        question = build_question(spec, ctx)
        if question is None:
            continue
        questions.append(question)
        qid_to_key[question["id"]] = spec.key
    requests = [{"content": view, "questions": questions}] if questions else []
    return BuiltRequest(requests=requests, qid_to_key=qid_to_key)


def build_post_turn(
    turn_text: str,
    recent_view: str,
    sentences: list[str],
    ctx: SageContext,
) -> BuiltRequest:
    """One group per candidate sentence (memory.kind + veil.known_by), plus pacing."""
    requests: list[dict[str, Any]] = []
    qid_to_key: dict[str, str] = {}
    for index, sentence in enumerate(sentences):
        questions: list[dict[str, Any]] = []
        for key in ("memory.kind", "veil.known_by"):
            spec = BY_KEY[key]
            qid = f"{question_id(key)}_{index}"
            question = build_question(spec, ctx, qid=qid)
            if question is not None:  # known_by is skipped when nobody is present
                questions.append(question)
                qid_to_key[qid] = f"{key}:{index}"
        requests.append({"content": f"{turn_text}\n\nSENTENCE: {sentence}", "questions": questions})
    stalling = BY_KEY["pacing.stalling"]
    question = build_question(stalling, ctx)
    if question is not None:
        requests.append({"content": recent_view, "questions": [question]})
        qid_to_key[question["id"]] = stalling.key
    return BuiltRequest(requests=requests, qid_to_key=qid_to_key)
