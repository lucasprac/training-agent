"""Database tables.

Each table has a `<Name>Base` model with defaults for every field. The API uses the
base model for create requests and `model_dump(exclude_unset=True)` for partial updates.
JSON columns use `sa_type=JSON`; always assign a new list/dict, never mutate in place.
"""

from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import JSON
from sqlmodel import Field, SQLModel


def _now() -> datetime:
    return datetime.now(timezone.utc)


# --------------------------------------------------------------------- global preset


class PromptPresetBase(SQLModel):
    name: str = "Default"
    main_prompt: str = ""
    harness_legend: str = ""
    post_history: str = ""
    authors_note: str = ""
    authors_note_position: str = "in_chat"  # "after_scenario" | "in_chat"
    authors_note_depth: int = 4
    authors_note_frequency: int = 1  # 0 = never, 1 = every user input, N = every Nth
    block_order: list[dict[str, Any]] = Field(default_factory=list, sa_type=JSON)
    lore_budget_pct: int = 25
    scene_note_depth: int = 1
    model: str = ""
    temperature: float = 0.9
    max_tokens: int = 800
    context_size: int = 32000
    sage_reasoning: str = "off"  # "off" | "auto"


class PromptPreset(PromptPresetBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)


class GlobalRuleBase(SQLModel):
    preset_id: int = 1
    title: str = ""
    text: str = ""
    order: int = 0
    enabled: bool = True


class GlobalRule(GlobalRuleBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)


# --------------------------------------------------------------------- world building


class ScenarioBase(SQLModel):
    title: str = "Untitled scenario"
    summary: str = ""
    world: str = ""
    themes: list[str] = Field(default_factory=list, sa_type=JSON)
    scenario_rules: str = ""
    opening_message: str = ""
    main_prompt_override: str = ""
    post_history_override: str = ""
    authors_note: str = ""
    authors_note_depth: Optional[int] = None
    authors_note_frequency: Optional[int] = None
    model: str = ""


class Scenario(ScenarioBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=_now)


class CharacterBase(SQLModel):
    scenario_id: int = 0
    name: str = ""
    description: str = ""
    personality: str = ""
    speech_style: str = ""
    first_message: str = ""
    example_dialogues: str = ""
    depth_note: str = ""
    depth_note_depth: int = 4
    post_history_addition: str = ""


class Character(CharacterBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)


class PersonaBase(SQLModel):
    scenario_id: Optional[int] = None  # the roleplay this persona belongs to (None only for pre-migration rows)
    name: str = "Traveler"
    description: str = ""


class Persona(PersonaBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)


LORE_POSITIONS = ("before_char", "after_char", "an_top", "an_bottom", "at_depth")
LORE_LOGIC = ("and_any", "and_all", "not_any", "not_all")
LORE_KINDS = ("location", "faction", "item", "concept", "character", "other")


class LoreEntryBase(SQLModel):
    scenario_id: int = 0
    title: str = ""
    content: str = ""
    kind: str = "other"
    keys: list[str] = Field(default_factory=list, sa_type=JSON)
    secondary_keys: list[str] = Field(default_factory=list, sa_type=JSON)
    selective_logic: str = "and_any"
    constant: bool = False
    position: str = "after_char"
    depth: int = 4
    role: str = "system"
    order: int = 100
    probability: int = 100
    scan_depth: Optional[int] = None
    case_sensitive: bool = False
    whole_words: bool = True
    prevent_recursion: bool = False
    sticky: int = 0
    cooldown: int = 0
    delay: int = 0
    known_by: list[int] = Field(default_factory=list, sa_type=JSON)
    enabled: bool = True


class LoreEntry(LoreEntryBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)


# --------------------------------------------------------------------- play


class SessionBase(SQLModel):
    scenario_id: int = 0
    persona_id: Optional[int] = None
    title: str = ""
    model: str = ""
    authors_note: Optional[str] = None
    authors_note_depth: Optional[int] = None
    authors_note_frequency: Optional[int] = None


class RoleplaySession(SessionBase, table=True):
    __tablename__ = "session"
    id: Optional[int] = Field(default=None, primary_key=True)
    summary: str = ""
    summary_upto_turn: int = 0
    labels: dict[str, Any] = Field(default_factory=dict, sa_type=JSON)
    pacing_note: str = ""
    lore_timers: dict[str, Any] = Field(default_factory=dict, sa_type=JSON)
    turn_count: int = 0
    created_at: datetime = Field(default_factory=_now)


class Message(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: int = Field(index=True)
    turn_index: int = 0
    role: str = "user"  # "user" | "assistant"
    content: str = ""
    ooc: bool = False
    blocked: bool = False
    # Harness snapshot used for this turn (stored on the user message):
    # {"labels": {...}, "lore": [...], "memory": [...], "guard": {...}, "guidance": [...], "degraded": [...]}
    harness: dict[str, Any] = Field(default_factory=dict, sa_type=JSON)
    created_at: datetime = Field(default_factory=_now)


MEMORY_KINDS = ("fact", "relationship", "item", "goal", "event")


class MemoryItemBase(SQLModel):
    kind: str = "fact"
    content: str = ""
    subjects: list[int] = Field(default_factory=list, sa_type=JSON)
    known_by: list[int] = Field(default_factory=list, sa_type=JSON)
    importance: int = 2
    active: bool = True


class MemoryItem(MemoryItemBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: int = Field(index=True)
    source_turn: int = 0
    probability: Optional[float] = None
    created_at: datetime = Field(default_factory=_now)


class TurnTrace(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: int = Field(index=True)
    turn_index: int = 0
    data: dict[str, Any] = Field(default_factory=dict, sa_type=JSON)
    created_at: datetime = Field(default_factory=_now)
