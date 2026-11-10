"""SillyTavern-style macros: {{user}}, {{char}}, {{location}}, {{roll::2d6}}, ...

Names are case-insensitive. Unknown macros are left unchanged.
"""

import random
import re
from datetime import datetime

MACRO_RE = re.compile(r"\{\{\s*([A-Za-z_]+)\s*(?:::\s*(.*?))?\s*\}\}")
DICE_RE = re.compile(r"^(\d*)d(\d+)([+-]\d+)?$", re.IGNORECASE)


def roll(spec: str, rng: random.Random) -> str:
    match = DICE_RE.match(spec.replace(" ", ""))
    if not match:
        return spec
    count = min(int(match.group(1) or 1), 100)
    sides = max(int(match.group(2)), 1)
    bonus = int(match.group(3) or 0)
    return str(sum(rng.randint(1, sides) for _ in range(count)) + bonus)


def expand(
    text: str,
    values: dict[str, str],
    rng: random.Random | None = None,
    now: datetime | None = None,
) -> str:
    if not text or "{{" not in text:
        return text
    rng = rng or random.Random()
    now = now or datetime.now()
    lowered = {k.lower(): v for k, v in values.items()}

    def replace(match: re.Match[str]) -> str:
        name = match.group(1).lower()
        arg = match.group(2)
        if name == "roll" and arg:
            return roll(arg, rng)
        if name == "time":
            return now.strftime("%H:%M")
        if name == "date":
            return now.strftime("%B %d, %Y")
        if name in lowered:
            return lowered[name]
        return match.group(0)

    return MACRO_RE.sub(replace, text)
