"""Simulation state variables: label keys, initial values and how a value reads in text."""

from typing import Any

from app.models import StateVariable
from app.sage.labels import Label, LabelSet

STATE_PREFIX = "state."


def state_key(variable_id: int | None) -> str:
    return f"{STATE_PREFIX}{variable_id}"


def variable_id(key: str) -> int | None:
    rest = key[len(STATE_PREFIX):] if key.startswith(STATE_PREFIX) else ""
    return int(rest) if rest.isdigit() else None


def active(variables: list[StateVariable]) -> list[StateVariable]:
    return sorted((v for v in variables if v.enabled), key=lambda v: (v.order, v.id or 0))


def put_initial(labels: LabelSet, variables: list[StateVariable]) -> None:
    """Initial values. An objective starts as "not reached"."""
    for var in active(variables):
        value = var.initial_value
        if value is None and var.is_objective:
            value = False
        if value is not None:
            labels.put(Label(key=state_key(var.id), value=value, certainty="low", source="default"))


def display_value(var: StateVariable, value: Any) -> str | None:
    """Plain text for the narrator, the Sage view and the report. None when there is no value."""
    if value is None:
        return None
    if var.kind == "yesno":
        return "yes" if value is True else "no" if value is False else str(value)
    if var.kind == "scale" and var.options and isinstance(value, (int, float)):
        nearest = min(var.options, key=lambda o: abs(float(o.get("level", 0)) - float(value)))
        return str(nearest.get("description") or nearest.get("level"))
    if isinstance(value, dict) and "amount" in value:
        return f"{value.get('amount')} {value.get('currency') or ''}".strip()
    return str(value)


def state_lines(variables: list[StateVariable], labels: LabelSet, narrator_only: bool) -> list[str]:
    lines: list[str] = []
    for var in active(variables):
        if narrator_only and not var.tell_narrator:
            continue
        text = display_value(var, labels.value(state_key(var.id)))
        if text is not None:
            lines.append(f"- {var.name}: {text}")
    return lines
