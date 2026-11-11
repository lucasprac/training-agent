"""Checks that training records fit the Sage limits before they are saved.

Each function raises ValueError with a message for the manager; the API returns it as 400.
Records may be incomplete while the manager drafts them (for example a choice variable
with no options yet). The harness skips a record that it cannot ask Sage about.
"""

from typing import Any

from sqlmodel import Session, select

from app.models import (
    EXTRACT_TYPES,
    INDICATOR_POLARITIES,
    PROFILE_ROLES,
    STATE_KINDS,
    CompetencyBase,
    ProfileBase,
    ScenarioCompetency,
    ScenarioCompetencyBase,
    StateVariableBase,
)

MAX_LEVELS = 26  # Sage scale
MIN_LEVELS = 2
MAX_OPTIONS = 120  # Sage choice
MAX_TAGS = 120  # Sage tags


def check_levels(levels: list[dict[str, Any]], field: str = "levels") -> None:
    if not MIN_LEVELS <= len(levels) <= MAX_LEVELS:
        raise ValueError(f"{field}: use {MIN_LEVELS} to {MAX_LEVELS} levels")
    seen: set[int] = set()
    for item in levels:
        level = item.get("level")
        if not isinstance(level, int) or isinstance(level, bool):
            raise ValueError(f"{field}: every level must be a whole number")
        if level in seen:
            raise ValueError(f"{field}: level {level} is used twice")
        seen.add(level)


def check_profile(_: Session, data: ProfileBase, __: int | None) -> None:
    if data.role not in PROFILE_ROLES:
        raise ValueError("role must be manager or user")


def check_competency(_: Session, data: CompetencyBase, __: int | None) -> None:
    check_levels(data.levels)
    if len(data.indicators) > MAX_TAGS:
        raise ValueError(f"indicators: use at most {MAX_TAGS}")
    ids: set[str] = set()
    for indicator in data.indicators:
        indicator_id = str(indicator.get("id") or "").strip()
        if not indicator_id or indicator_id in ids:
            raise ValueError("indicators: every indicator needs a unique id")
        ids.add(indicator_id)
        if indicator.get("polarity", "positive") not in INDICATOR_POLARITIES:
            raise ValueError("indicators: polarity must be positive or negative")


def check_scenario_competency(db: Session, data: ScenarioCompetencyBase, item_id: int | None) -> None:
    if data.weight <= 0:
        raise ValueError("weight must be greater than 0")
    duplicate = db.exec(
        select(ScenarioCompetency).where(
            ScenarioCompetency.scenario_id == data.scenario_id,
            ScenarioCompetency.competency_id == data.competency_id,
        )
    ).first()
    if duplicate is not None and duplicate.id != item_id:
        raise ValueError("this competency is already in the scenario")


def check_state_variable(_: Session, data: StateVariableBase, __: int | None) -> None:
    if data.kind not in STATE_KINDS:
        raise ValueError(f"kind must be one of {', '.join(STATE_KINDS)}")
    if data.extract_type not in EXTRACT_TYPES:
        raise ValueError(f"extract_type must be one of {', '.join(EXTRACT_TYPES)}")
    if data.is_objective and data.kind != "yesno":
        raise ValueError("only a yes/no variable can be an objective")
    if data.kind == "scale" and data.options:
        check_levels(data.options, "options")
    if data.kind == "choice":
        if len(data.options) > MAX_OPTIONS:
            raise ValueError(f"options: use at most {MAX_OPTIONS}")
        names = [str(o.get("option") or "").strip().lower() for o in data.options]
        if any(not n for n in names) or len(set(names)) != len(names):
            raise ValueError("options: every option needs a unique name")
