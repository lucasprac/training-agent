"""Post-turn memory helpers.

Sage Extract is extractive: values are spans of the text. It finds names and short
phrases well, but it cannot write a whole fact. So memory is built from the turn's own
sentences: each sentence is a candidate, and Sage classifies it (registry key
`memory.kind`) and tags who witnessed it (`veil.known_by`). Extract is used only for the
place name when the scene moved to a place that is not in the lorebook.
"""

import re
from typing import Any

from app.models import Character

MAX_SENTENCES = 24
MIN_WORDS = 3
LOCATION_MIN_PROBABILITY = 0.6

# memory kind: importance 1-5
KIND_IMPORTANCE: dict[str, int] = {"fact": 2, "relationship": 3, "item": 2, "goal": 3, "event": 3}


def location_schema(persona_name: str) -> dict[str, Any]:
    return {
        "place": {
            "type": "text",
            "definition": f"the name of the place where {persona_name} is at the end of this text (a proper name or a short phrase such as 'the old mill')",
        }
    }


def normalize(text: str) -> str:
    return " ".join(re.sub(r"[^\w\s]", " ", text.lower()).split())


def subjects_in(text: str, characters: list[Character]) -> list[int]:
    lowered = text.lower()
    return [c.id for c in characters if c.name and c.name.lower() in lowered]


_SENTENCE_END = re.compile(r"(?<=[.!?…])[\"'”’)\]]*\s+|\n+")


def split_sentences(text: str) -> list[str]:
    parts = [p.strip(" \t\"'“”‘’*_-") for p in _SENTENCE_END.split(text or "")]
    return [p for p in parts if len(p.split()) >= MIN_WORDS]


def candidate_sentences(
    user_text: str, reply: str, persona_name: str, existing: list[str]
) -> list[str]:
    """Sentences of the turn that are not already in memory, user sentences prefixed
    with the persona name, capped at MAX_SENTENCES."""
    seen = {normalize(e) for e in existing}
    out: list[str] = []
    for prefix, text in ((f"{persona_name}: ", user_text), ("", reply)):
        for sentence in split_sentences(text):
            candidate = f"{prefix}{sentence}"
            key = normalize(candidate)
            if key and key not in seen:
                seen.add(key)
                out.append(candidate)
    return out[:MAX_SENTENCES]


def map_location(response: dict[str, Any]) -> str | None:
    result = (response.get("results") or {}).get("place") or {}
    value = (response.get("values") or {}).get("place")
    probability = result.get("probability") if isinstance(result, dict) else None
    if not isinstance(value, str) or not value.strip():
        return None
    if probability is not None and probability < LOCATION_MIN_PROBABILITY:
        return None
    return value.strip()
