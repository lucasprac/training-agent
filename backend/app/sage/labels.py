"""Labels: the typed form of Sage answers that the prompt model reads.

The prompt assembler never reads raw Sage JSON; it reads a LabelSet.
Stability rules (hysteresis) are applied here so labels do not flicker.
"""

from typing import Any, Literal

from pydantic import BaseModel, Field

Certainty = Literal["high", "low", "carried"]
Source = Literal["sage", "keyword", "fallback", "user", "extract", "default"]

ABSENT_TURNS_TO_LEAVE = 2


class Label(BaseModel):
    key: str
    value: Any = None
    probability: float | None = None
    certainty: Certainty = "high"
    source: Source = "sage"
    turn: int = 0
    locked: bool = False


class LabelSet(BaseModel):
    labels: dict[str, Label] = Field(default_factory=dict)
    # Bookkeeping that is not shown to the narrator, e.g. {"absent_streak": {"3": 1}}.
    meta: dict[str, Any] = Field(default_factory=dict)

    def get(self, key: str) -> Label | None:
        return self.labels.get(key)

    def value(self, key: str, default: Any = None) -> Any:
        label = self.labels.get(key)
        return default if label is None or label.value is None else label.value

    def put(self, label: Label) -> None:
        self.labels[label.key] = label

    def locked_keys(self) -> set[str]:
        return {k for k, v in self.labels.items() if v.locked}

    def copy_deep(self) -> "LabelSet":
        return LabelSet.model_validate(self.model_dump())

    @classmethod
    def from_json(cls, data: dict[str, Any] | None) -> "LabelSet":
        return cls.model_validate(data or {})


# ----------------------------------------------------------------- Sage result parsing


class Answer(BaseModel):
    """One parsed Sage answer (any kind)."""

    kind: str
    value: Any = None  # yesno: True/False/None; choice: str/None; scale: float; tags: dict
    probability: float | None = None
    probabilities: list[dict[str, Any]] | None = None  # choice options / scale levels


def parse_answer(result: dict[str, Any]) -> Answer:
    """Parse one `{id, kind, result}` object from /decide or /decide/batch."""
    kind = result.get("kind", "")
    body = result.get("result") or {}
    if kind == "yesno":
        answer = body.get("answer")
        value = None if answer is None else answer == "yes"
        return Answer(kind=kind, value=value, probability=body.get("probability"))
    if kind == "choice":
        return Answer(kind=kind, value=body.get("chosen"), probability=body.get("probability"),
                      probabilities=body.get("probabilities"))
    if kind == "scale":
        return Answer(kind=kind, value=body.get("expectation"), probability=body.get("confidence"),
                      probabilities=body.get("probabilities"))
    if kind == "tags":
        tags = {
            str(t.get("id")): {"applies": t.get("applies"), "probability": t.get("probability")}
            for t in body.get("tags") or []
        }
        return Answer(kind=kind, value=tags)
    if kind == "sort":
        return Answer(kind=kind, value=body.get("sorted"), probability=body.get("confidence"))
    return Answer(kind=kind)


def parse_batch(response: dict[str, Any]) -> tuple[dict[str, Answer], dict[str, str]]:
    """Return ({question_id: Answer}, {question_id: error}) from a /decide/batch response."""
    answers: dict[str, Answer] = {}
    errors: dict[str, str] = {}
    for group in response.get("results") or []:
        for item in group.get("answers") or []:
            if item.get("ok"):
                result = item.get("result") or {}
                answers[str(result.get("id"))] = parse_answer(result)
            else:
                error = item.get("error")
                qid = str((error or {}).get("id", f"error_{len(errors)}")) if isinstance(error, dict) else f"error_{len(errors)}"
                errors[qid] = str(error)
    return answers, errors


# ----------------------------------------------------------------- stability rules


def apply_choice(
    labels: LabelSet,
    key: str,
    answer: Answer | None,
    threshold: float,
    turn: int,
    unchanged_option: str = "unchanged",
) -> Label:
    """Scene choices change only on a confident, non-null answer; otherwise carry."""
    previous = labels.get(key)
    if previous and previous.locked:
        return previous
    confident = (
        answer is not None
        and answer.value is not None
        and (answer.probability or 0.0) >= threshold
    )
    if not confident:
        label = Label(
            key=key,
            value=previous.value if previous else None,
            probability=answer.probability if answer else None,
            certainty="carried" if previous and previous.value is not None else "low",
            source=previous.source if previous else "sage",
            turn=turn,
        )
    elif answer.value == unchanged_option:
        label = Label(
            key=key,
            value=previous.value if previous else None,
            probability=answer.probability,
            certainty="high" if previous and previous.value is not None else "low",
            source="sage",
            turn=turn,
        )
    else:
        label = Label(
            key=key, value=answer.value, probability=answer.probability,
            certainty="high", source="sage", turn=turn,
        )
    labels.put(label)
    return label


def apply_yesno(labels: LabelSet, key: str, answer: Answer | None, turn: int) -> Label:
    previous = labels.get(key)
    if previous and previous.locked:
        return previous
    if answer is None or answer.value is None:
        label = Label(key=key, value=None, probability=answer.probability if answer else None,
                      certainty="low", source="sage", turn=turn)
    else:
        label = Label(key=key, value=answer.value, probability=answer.probability,
                      certainty="high", source="sage", turn=turn)
    labels.put(label)
    return label


def apply_present(
    labels: LabelSet,
    answer: Answer | None,
    character_ids: list[int],
    turn: int,
    location_changed: bool,
    key: str = "scene.present",
) -> Label:
    """A character enters on applies=true; leaves after applies=false on
    ABSENT_TURNS_TO_LEAVE consecutive turns, or at once when the location changes."""
    previous = labels.get(key)
    if previous and previous.locked:
        return previous
    current = set(previous.value or []) if previous else set(character_ids)
    streak: dict[str, int] = dict(labels.meta.get("absent_streak", {}))
    tags: dict[str, dict] = (answer.value or {}) if answer else {}
    undecided = answer is None
    for cid in character_ids:
        tag = tags.get(f"c{cid}")
        applies = tag.get("applies") if tag else None
        if applies is True:
            current.add(cid)
            streak[str(cid)] = 0
        elif applies is False:
            streak[str(cid)] = streak.get(str(cid), 0) + 1
            if location_changed or streak[str(cid)] >= ABSENT_TURNS_TO_LEAVE:
                current.discard(cid)
        else:
            undecided = True
    current &= set(character_ids)
    labels.meta["absent_streak"] = streak
    label = Label(
        key=key,
        value=sorted(current),
        certainty="low" if undecided else "high",
        source="sage" if answer else (previous.source if previous else "default"),
        turn=turn,
    )
    labels.put(label)
    return label


SCALE_MIN_CONFIDENCE = 0.5
EXTRACT_MIN_PROBABILITY = 0.6


def _carry(key: str, previous: Label | None, probability: float | None, turn: int) -> Label:
    return Label(
        key=key,
        value=previous.value if previous else None,
        probability=probability,
        certainty="carried" if previous and previous.value is not None else "low",
        source=previous.source if previous else "sage",
        turn=turn,
    )


def apply_state(
    labels: LabelSet,
    key: str,
    kind: str,
    answer: Answer | None,
    threshold: float,
    turn: int,
    objective: bool = False,
) -> Label:
    """A state variable. A `null` answer keeps the previous value. A reached objective stays reached."""
    previous = labels.get(key)
    if previous and (previous.locked or (objective and previous.value is True)):
        return previous
    if kind == "choice":
        return apply_choice(labels, key, answer, threshold, turn, unchanged_option="")
    if answer is None or answer.value is None:
        label = _carry(key, previous, answer.probability if answer else None, turn)
    elif kind == "scale":
        confident = (answer.probability or 0.0) >= SCALE_MIN_CONFIDENCE
        label = Label(key=key, value=round(float(answer.value), 2), probability=answer.probability,
                      certainty="high" if confident else "low", source="sage", turn=turn)
    else:
        label = Label(key=key, value=answer.value, probability=answer.probability, certainty="high", source="sage", turn=turn)
    labels.put(label)
    return label


def apply_extracted(labels: LabelSet, key: str, value: Any, probability: float | None, turn: int) -> Label:
    """An Extract value replaces the previous one only when it is present and probable enough."""
    previous = labels.get(key)
    if previous and previous.locked:
        return previous
    if value is None or (probability is not None and probability < EXTRACT_MIN_PROBABILITY):
        label = _carry(key, previous, probability, turn)
    else:
        label = Label(key=key, value=value, probability=probability, certainty="high", source="extract", turn=turn)
    labels.put(label)
    return label


def tag_applies(answer: Answer | None, prefix: str) -> dict[int, bool | None] | None:
    """Map tags like "l12" -> {12: applies}. None when there is no answer."""
    if answer is None or not isinstance(answer.value, dict):
        return None
    out: dict[int, bool | None] = {}
    for tag_id, tag in answer.value.items():
        if tag_id.startswith(prefix) and tag_id[len(prefix):].isdigit():
            out[int(tag_id[len(prefix):])] = tag.get("applies")
    return out


def mark_fallback(labels: LabelSet, turn: int) -> None:
    """Degraded mode: keep the last values, mark them as carried fallback labels."""
    for key, label in list(labels.labels.items()):
        if label.locked:
            continue
        labels.labels[key] = label.model_copy(
            update={"source": "fallback", "certainty": "carried", "turn": turn}
        )
