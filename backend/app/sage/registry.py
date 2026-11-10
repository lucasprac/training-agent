"""Declarative registry of every Sage question the harness asks.

Adding or changing a question is a change in this file only. Each spec says how to
build the question from the turn context, which label it fills, and how the prompt
renders it (`renders_to`, documentation for the inspector).
"""

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, Literal

from app.models import Character, LoreEntry, MemoryItem

Kind = Literal["yesno", "choice", "scale", "tags"]
Phase = Literal["pre_turn", "post_turn"]
NullPolicy = Literal["carry", "include", "exclude", "caution", "include_keyword_hits"]

UNCHANGED = "unchanged"
ELSEWHERE = "elsewhere"

SCENE_TYPES = [
    ("dialogue", "characters mainly talk"),
    ("combat", "a fight or physical struggle"),
    ("exploration", "searching, investigating or discovering a place"),
    ("travel", "moving from one place to another"),
    ("rest", "a quiet pause, recovery or downtime"),
    ("romance", "affection, flirting or intimacy"),
    ("intrigue", "deception, negotiation, secrets or scheming"),
    ("other", "none of the above"),
]

MOODS = [
    ("calm", "peaceful, relaxed"),
    ("tense", "danger or conflict is close"),
    ("playful", "light, humorous"),
    ("romantic", "warm, intimate"),
    ("somber", "sad, grieving, heavy"),
    ("eerie", "uncanny, unsettling, mysterious"),
    ("chaotic", "loud, frantic, out of control"),
    ("triumphant", "victory, relief, celebration"),
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


def _scene_type_options(_: SageContext) -> dict[str, Any]:
    return {"options": [{"option": o, "description": d} for o, d in SCENE_TYPES]}


def _mood_options(_: SageContext) -> dict[str, Any]:
    return {"options": [{"option": o, "description": d} for o, d in MOODS]}


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
    ("fact", "reveals or establishes a lasting fact about the world, a place or a character"),
    ("relationship", "shows a change in how two characters feel about or treat each other"),
    ("item", "an object is given, taken, found, used up or lost"),
    ("goal", "a character states a goal, plan, deal or promise"),
    ("event", "a significant event happens that later scenes may refer to"),
    ("none", "description, atmosphere, small talk or anything not worth remembering"),
]


def _memory_kind_options(_: SageContext) -> dict[str, Any]:
    return {"options": [{"option": o, "description": d} for o, d in MEMORY_KINDS_OPTIONS]}


def _stalling_levels(_: SageContext) -> dict[str, Any]:
    return {
        "levels": [
            {"level": 0, "description": "the story moves well"},
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
        key="scene.type",
        kind="choice",
        phase="pre_turn",
        instructions="What kind of scene is it now, after the LAST message?",
        null_policy="carry",
        renders_to='<scene type="…">, {{scene_type}}',
        build=_scene_type_options,
    ),
    QuestionSpec(
        key="scene.mood",
        kind="choice",
        phase="pre_turn",
        instructions="What is the mood of the scene now, after the LAST message?",
        null_policy="carry",
        renders_to='<scene mood="…">, {{mood}}',
        build=_mood_options,
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
            "The SENTENCE below comes from the exchange above. Should the story remember it "
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
        instructions="How much is the story stalling in these recent messages?",
        null_policy="carry",
        renders_to="next turn <guidance>",
        build=_stalling_levels,
        lockable=False,
    ),
]

BY_KEY: dict[str, QuestionSpec] = {spec.key: spec for spec in REGISTRY}


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
