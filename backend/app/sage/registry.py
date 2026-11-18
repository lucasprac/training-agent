"""Declarative registry of every Sage question the harness asks.

Adding or changing a question is a change in this file only. Each spec says how to
build the question from the turn context, which label it fills, and how the prompt
renders it (`renders_to`, documentation for the inspector).
"""

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, Literal

from app.models import Character, LoreEntry, MemoryItem, StateVariable

Kind = Literal["yesno", "choice", "scale", "tags"]
Phase = Literal["pre_turn", "post_turn"]
NullPolicy = Literal["carry", "include", "exclude", "caution", "include_keyword_hits"]

UNCHANGED = "unchanged"
ELSEWHERE = "elsewhere"

STAGES = [
    ("opening", "greetings, introductions or setting the context"),
    ("discovery", "questions to understand the situation, the problem or the needs"),
    ("proposal", "a solution, an option or a plan is presented"),
    ("objection", "a concern, pushback or disagreement is raised or handled"),
    ("negotiation", "terms, concessions or trade-offs are discussed"),
    ("closing", "an agreement, a decision or the next steps are confirmed"),
    ("other", "none of the above"),
]

TONES = [
    ("cooperative", "the counterparts are open, friendly and willing to work together"),
    ("neutral", "the counterparts are polite but reserved"),
    ("skeptical", "the counterparts doubt what they hear and want proof"),
    ("frustrated", "the counterparts are unhappy or impatient but still talk"),
    ("angry", "the counterparts are hostile, raise their voice or threaten"),
    ("anxious", "the counterparts are worried, insecure or afraid"),
    ("satisfied", "the counterparts are pleased or relieved"),
]


@dataclass
class SageContext:
    """Everything the registry needs to build questions for one turn."""

    characters: list[Character]
    persona_name: str
    location_entries: list[LoreEntry] = field(default_factory=list)
    lore_pool: list[LoreEntry] = field(default_factory=list)
    memory_pool: list[MemoryItem] = field(default_factory=list)
    present_ids: list[int] = field(default_factory=list)


@dataclass(frozen=True)
class QuestionSpec:
    key: str
    kind: Kind
    phase: Phase
    instructions: str
    null_policy: NullPolicy
    renders_to: str
    threshold: float = 0.7
    build: Callable[[SageContext], dict[str, Any] | None] | None = None
    lockable: bool = True


def _one_line(text: str, limit: int = 140) -> str:
    line = " ".join((text or "").split())
    return line if len(line) <= limit else line[: limit - 1] + "…"


def _location_options(ctx: SageContext) -> dict[str, Any]:
    options = [
        {"option": UNCHANGED, "description": "the scene is still in the same place"},
        {"option": ELSEWHERE, "description": "the scene moved to a place not listed here"},
    ]
    seen: set[str] = set()
    for entry in ctx.location_entries[:110]:
        name = entry.title.strip()
        if name and name.lower() not in seen and name.lower() not in (UNCHANGED, ELSEWHERE):
            seen.add(name.lower())
            options.append({"option": name, "description": _one_line(entry.content, 100)})
    return {"options": options}


def _stage_options(_: SageContext) -> dict[str, Any]:
    return {"options": [{"option": o, "description": d} for o, d in STAGES]}


def _tone_options(_: SageContext) -> dict[str, Any]:
    return {"options": [{"option": o, "description": d} for o, d in TONES]}


def _present_tags(ctx: SageContext) -> dict[str, Any] | None:
    if not ctx.characters:
        return None
    return {
        "tags": [
            {"id": f"c{c.id}", "name": f"{c.name}: {_one_line(c.description, 90)}"}
            for c in ctx.characters[:120]
        ]
    }


def _lore_tags(ctx: SageContext) -> dict[str, Any] | None:
    if not ctx.lore_pool:
        return None
    return {
        "tags": [
            {"id": f"l{e.id}", "name": f"{e.title}: {_one_line(e.content)}"}
            for e in ctx.lore_pool[:120]
        ]
    }


def _memory_tags(ctx: SageContext) -> dict[str, Any] | None:
    if not ctx.memory_pool:
        return None
    return {
        "tags": [
            {"id": f"m{m.id}", "name": f"{m.kind}: {_one_line(m.content)}"}
            for m in ctx.memory_pool[:120]
        ]
    }


def _known_by_tags(ctx: SageContext) -> dict[str, Any] | None:
    present = [c for c in ctx.characters if c.id in ctx.present_ids]
    if not present:
        return None
    return {"tags": [{"id": f"c{c.id}", "name": c.name} for c in present]}


MEMORY_KINDS_OPTIONS = [
    ("fact", "reveals or establishes a lasting fact about the situation, the company, a product or a person"),
    ("relationship", "shows a change in how two people feel about or treat each other"),
    ("item", "a document, product, object or value is given, sent, promised, found or lost"),
    ("goal", "someone states a goal, plan, deal, commitment or promise"),
    ("event", "a significant event happens that later messages may refer to"),
    ("none", "description, small talk or anything not worth remembering"),
]


def _memory_kind_options(_: SageContext) -> dict[str, Any]:
    return {"options": [{"option": o, "description": d} for o, d in MEMORY_KINDS_OPTIONS]}


def _stalling_levels(_: SageContext) -> dict[str, Any]:
    return {
        "levels": [
            {"level": 0, "description": "the conversation moves well"},
            {"level": 1, "description": "a little slow"},
            {"level": 2, "description": "repetitive, little progress"},
            {"level": 3, "description": "stalling, nothing new happens"},
            {"level": 4, "description": "stuck in a loop"},
        ]
    }


REGISTRY: list[QuestionSpec] = [
    QuestionSpec(
        key="guard.ooc",
        kind="yesno",
        phase="pre_turn",
        instructions=(
            "Is the LAST message from {user} out of character, i.e. {user} speaks to the "
            "narrator or the system (for example inside double parentheses (( )) or with OOC), not as "
            "their character? Text inside single parentheses ( ) is the character's thought and is in "
            "character. Text inside single asterisks * * is in-character narration or action."
        ),
        null_policy="caution",
        renders_to="turn mode: OOC reply",
    ),
    QuestionSpec(
        key="guard.limits",
        kind="yesno",
        phase="pre_turn",
        instructions=(
            "Does the LAST message from {user} ask for content that breaks the global rules "
            "or scenario rules listed above?"
        ),
        null_policy="caution",
        renders_to="blocks narrator call / <guidance>",
    ),
    QuestionSpec(
        key="scene.location",
        kind="choice",
        phase="pre_turn",
        instructions="Where does the scene take place after the LAST message?",
        null_policy="carry",
        renders_to='<scene location="…">, {{location}}, location lore',
        build=_location_options,
    ),
    QuestionSpec(
        key="scene.stage",
        kind="choice",
        phase="pre_turn",
        instructions="Which stage of the conversation is it now, after the LAST message?",
        null_policy="carry",
        renders_to='<scene stage="…">, {{stage}}',
        build=_stage_options,
    ),
    QuestionSpec(
        key="scene.tone",
        kind="choice",
        phase="pre_turn",
        instructions="What is the tone of the counterparts (everyone except {user}) now, after the LAST message?",
        null_policy="carry",
        renders_to='<scene tone="…">, {{tone}}',
        build=_tone_options,
    ),
    QuestionSpec(
        key="scene.present",
        kind="tags",
        phase="pre_turn",
        instructions=(
            "Tag each character who is physically present in the scene now and can see or "
            "hear {user}. A character who is only mentioned is not present."
        ),
        null_policy="carry",
        renders_to="full <character> blocks, {{present}}",
        build=_present_tags,
    ),
    QuestionSpec(
        key="select.lore",
        kind="tags",
        phase="pre_turn",
        instructions=(
            "Tag each world entry that the narrator needs to write the next reply well: it is "
            "about a place, person, object or idea that is in the scene, mentioned, or about "
            "to matter. An entry that is only loosely related does not apply."
        ),
        null_policy="include_keyword_hits",
        renders_to="<lore> blocks",
        build=_lore_tags,
        lockable=False,
    ),
    QuestionSpec(
        key="select.memory",
        kind="tags",
        phase="pre_turn",
        instructions=(
            "Tag each memory of earlier events that the narrator should keep in mind for the "
            "next reply: it is about a character, place, object or promise that is in the "
            "scene or mentioned now."
        ),
        null_policy="include",
        renders_to="<memory> and <knows>",
        build=_memory_tags,
        lockable=False,
    ),
    QuestionSpec(
        key="memory.kind",
        kind="choice",
        phase="post_turn",
        instructions=(
            "The SENTENCE below comes from the exchange above. Should the simulation remember it "
            "later, and as what kind of memory?"
        ),
        null_policy="exclude",
        renders_to="MemoryItem (content = the sentence, kind = the answer)",
        threshold=0.6,
        build=_memory_kind_options,
        lockable=False,
    ),
    QuestionSpec(
        key="veil.known_by",
        kind="tags",
        phase="post_turn",
        instructions=(
            "The SENTENCE below comes from the exchange above. Tag each character who saw, heard "
            "or was told what it says, so they now know it. A character who was not there does not know it."
        ),
        null_policy="exclude",
        renders_to="MemoryItem.known_by",
        build=_known_by_tags,
        lockable=False,
    ),
    QuestionSpec(
        key="pacing.stalling",
        kind="scale",
        phase="post_turn",
        instructions="How much is the conversation stalling in these recent messages?",
        null_policy="carry",
        renders_to="next turn <guidance>",
        build=_stalling_levels,
        lockable=False,
    ),
]

BY_KEY: dict[str, QuestionSpec] = {spec.key: spec for spec in REGISTRY}


# ----------------------------------------------------------------- scenario state variables

STATE_CHOICE_THRESHOLD = 0.7
MIN_OPTIONS = 2


def _state_build(variable: StateVariable) -> Callable[[SageContext], dict[str, Any] | None]:
    def build(_: SageContext) -> dict[str, Any] | None:
        if variable.kind == "choice":
            options = [
                {"option": str(o.get("option", "")).strip(), "description": str(o.get("description", ""))}
                for o in variable.options[:120]
                if str(o.get("option", "")).strip()
            ]
            return {"options": options} if len(options) >= MIN_OPTIONS else None
        if variable.kind == "scale":
            levels = [
                {"level": o["level"], "description": str(o.get("description", ""))}
                for o in variable.options[:26]
                if isinstance(o.get("level"), int)
            ]
            return {"levels": levels} if len(levels) >= MIN_OPTIONS else None
        return {}

    return build


def state_specs(variables: list[StateVariable]) -> list[QuestionSpec]:
    """One pre-turn question per enabled Decide variable (choice, scale, yesno).

    Extract variables go to /v1/extract instead (see `app.sage.extract.state_schema`).
    """
    specs: list[QuestionSpec] = []
    for variable in sorted(variables, key=lambda v: (v.order, v.id or 0)):
        if not variable.enabled or variable.kind not in ("choice", "scale", "yesno"):
            continue
        instructions = variable.instructions.strip() or f"What is the current value of '{variable.name}', after the LAST message?"
        specs.append(
            QuestionSpec(
                key=f"state.{variable.id}",
                kind=variable.kind,  # type: ignore[arg-type]
                phase="pre_turn",
                instructions=instructions,
                null_policy="carry",
                renders_to="<sim_state>" if variable.tell_narrator else "report only",
                threshold=STATE_CHOICE_THRESHOLD,
                build=_state_build(variable),
            )
        )
    return specs


def question_id(label_key: str) -> str:
    """Sage question id for a label key ("scene.location" -> "scene_location")."""
    return label_key.replace(".", "_").replace(":", "_")


def specs_for(phase: Phase) -> list[QuestionSpec]:
    return [spec for spec in REGISTRY if spec.phase == phase]


def build_question(spec: QuestionSpec, ctx: SageContext, qid: str | None = None) -> dict[str, Any] | None:
    """Return the Sage question object, or None when it cannot be asked this turn."""
    question: dict[str, Any] = {
        "id": qid or question_id(spec.key),
        "kind": spec.kind,
        "instructions": spec.instructions.replace("{user}", ctx.persona_name),
    }
    if spec.build is not None:
        extra = spec.build(ctx)
        if extra is None:
            return None
        question.update(extra)
    return question
