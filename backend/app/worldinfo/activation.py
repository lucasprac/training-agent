"""World Info activation: SillyTavern keyword rules + Sage semantic selection.

Pipeline:
1. `activate()`  -> constant, sticky, keyword hits (incl. one recursion pass), Sage candidates
2. Sage tags each keyword hit + candidate (see app/sage/registry.py, `select.lore`)
3. `finalize()`  -> selected entries with their source
4. `apply_budget()` -> entries that fit the lore token budget

Timed effects count in turns (one user message + one reply).
"""

import random
import re
from dataclasses import dataclass, field

from app.models import LoreEntry
from app.prompt.budget import estimate_tokens

DEFAULT_SCAN_DEPTH = 4
MAX_SAGE_TAGS = 120

SOURCE_PRIORITY = {"constant": 0, "sticky": 1, "keyword+sage": 2, "keyword": 3, "sage": 4}


@dataclass
class ActivationResult:
    constant: list[LoreEntry] = field(default_factory=list)
    sticky: list[LoreEntry] = field(default_factory=list)
    keyword_hits: list[LoreEntry] = field(default_factory=list)
    candidates: list[LoreEntry] = field(default_factory=list)

    @property
    def sage_pool(self) -> list[LoreEntry]:
        """Entries Sage should judge (keyword hits first)."""
        return self.keyword_hits + self.candidates


@dataclass
class SelectedLore:
    entry: LoreEntry
    source: str


def _compile_key(key: str, case_sensitive: bool, whole_words: bool) -> re.Pattern[str] | None:
    key = key.strip()
    if not key:
        return None
    regex = re.fullmatch(r"/(.+)/([imsx]*)", key)
    if regex:
        flags = 0
        for flag in regex.group(2):
            flags |= {"i": re.I, "m": re.M, "s": re.S, "x": re.X}[flag]
        try:
            return re.compile(regex.group(1), flags)
        except re.error:
            return None
    pattern = re.escape(key)
    if whole_words:
        start = r"\b" if re.match(r"\w", key) else ""
        end = r"\b" if re.search(r"\w$", key) else ""
        pattern = f"{start}{pattern}{end}"
    return re.compile(pattern, 0 if case_sensitive else re.I)


def key_matches(key: str, text: str, case_sensitive: bool = False, whole_words: bool = True) -> bool:
    compiled = _compile_key(key, case_sensitive, whole_words)
    return bool(compiled and compiled.search(text))


def entry_matches(entry: LoreEntry, text: str) -> bool:
    def hit(key: str) -> bool:
        return key_matches(key, text, entry.case_sensitive, entry.whole_words)

    if not any(hit(k) for k in entry.keys):
        return False
    secondary = [k for k in entry.secondary_keys if k.strip()]
    if not secondary:
        return True
    hits = [hit(k) for k in secondary]
    logic = entry.selective_logic
    if logic == "and_all":
        return all(hits)
    if logic == "not_any":
        return not any(hits)
    if logic == "not_all":
        return not all(hits)
    return any(hits)  # and_any


def _timer(timers: dict, entry: LoreEntry) -> dict:
    return timers.get(str(entry.id), {})


def is_sticky(entry: LoreEntry, timers: dict, turn: int) -> bool:
    return turn <= _timer(timers, entry).get("sticky_until", -1)


def is_cooling_down(entry: LoreEntry, timers: dict, turn: int) -> bool:
    return turn <= _timer(timers, entry).get("cooldown_until", -1)


def activate(
    entries: list[LoreEntry],
    history_texts: list[str],
    turn: int,
    timers: dict | None = None,
    location: str | None = None,
    rng: random.Random | None = None,
    default_scan_depth: int = DEFAULT_SCAN_DEPTH,
    max_sage_tags: int = MAX_SAGE_TAGS,
) -> ActivationResult:
    """`history_texts` is oldest -> newest and includes the new user message last."""
    timers = timers or {}
    rng = rng or random.Random()
    message_count = len(history_texts)
    result = ActivationResult()
    pending: list[LoreEntry] = []

    for entry in entries:
        if not entry.enabled:
            continue
        if is_sticky(entry, timers, turn):
            result.sticky.append(entry)
            continue
        if message_count < entry.delay or is_cooling_down(entry, timers, turn):
            continue
        if entry.constant:
            result.constant.append(entry)
            continue
        pending.append(entry)

    def scan_text(entry: LoreEntry) -> str:
        depth = entry.scan_depth if entry.scan_depth is not None else default_scan_depth
        return "\n".join(history_texts[-depth:]) if depth > 0 else ""

    def roll_ok(entry: LoreEntry) -> bool:
        return entry.probability >= 100 or rng.randint(1, 100) <= entry.probability

    hits: list[LoreEntry] = []
    rest: list[LoreEntry] = []
    for entry in pending:
        if entry_matches(entry, scan_text(entry)) and roll_ok(entry):
            hits.append(entry)
        else:
            rest.append(entry)

    # One recursion pass: content of activated entries can activate other entries.
    recursion_text = "\n".join(
        e.content for e in result.constant + result.sticky + hits if not e.prevent_recursion
    )
    if recursion_text:
        still_rest: list[LoreEntry] = []
        for entry in rest:
            if entry_matches(entry, recursion_text) and roll_ok(entry):
                hits.append(entry)
            else:
                still_rest.append(entry)
        rest = still_rest

    hits.sort(key=lambda e: -e.order)
    result.keyword_hits = hits[:max_sage_tags]

    location_lower = (location or "").strip().lower()

    def is_current_location(entry: LoreEntry) -> bool:
        if entry.kind != "location" or not location_lower:
            return False
        names = [entry.title, *entry.keys]
        return any(n.strip().lower() == location_lower for n in names if n.strip())

    rest.sort(key=lambda e: (not is_current_location(e), -e.order))
    room = max(max_sage_tags - len(result.keyword_hits), 0)
    result.candidates = rest[:room]
    return result


def finalize(
    result: ActivationResult, sage_applies: dict[int, bool | None] | None
) -> list[SelectedLore]:
    """Combine activation with Sage answers. `sage_applies=None` means Sage was not
    available (degraded): keyword hits are kept and candidates are dropped."""
    selected = [SelectedLore(e, "constant") for e in result.constant]
    selected += [SelectedLore(e, "sticky") for e in result.sticky]
    for entry in result.keyword_hits:
        if sage_applies is None:
            selected.append(SelectedLore(entry, "keyword"))
            continue
        applies = sage_applies.get(entry.id)
        if applies is False:
            continue
        selected.append(SelectedLore(entry, "keyword+sage" if applies else "keyword"))
    if sage_applies is not None:
        for entry in result.candidates:
            if sage_applies.get(entry.id) is True:
                selected.append(SelectedLore(entry, "sage"))
    return selected


def apply_budget(
    selected: list[SelectedLore], budget_tokens: int
) -> tuple[list[SelectedLore], list[SelectedLore]]:
    """Keep entries by priority (constant, sticky, keyword+sage, keyword, sage; then
    higher order) until the budget is used. Returns (kept, dropped)."""
    ranked = sorted(
        selected, key=lambda s: (SOURCE_PRIORITY.get(s.source, 9), -s.entry.order)
    )
    kept: list[SelectedLore] = []
    dropped: list[SelectedLore] = []
    used = 0
    for item in ranked:
        cost = estimate_tokens(item.entry.content) + 8
        if used + cost <= budget_tokens:
            kept.append(item)
            used += cost
        else:
            dropped.append(item)
    return kept, dropped


def update_timers(
    timers: dict, activated: list[SelectedLore], turn: int
) -> dict:
    """Return new timers after this turn's activation."""
    new_timers = {k: dict(v) for k, v in timers.items()}
    for item in activated:
        entry = item.entry
        if item.source == "sticky":
            continue
        state = new_timers.setdefault(str(entry.id), {})
        if entry.sticky > 0:
            state["sticky_until"] = turn + entry.sticky
            if entry.cooldown > 0:
                state["cooldown_until"] = turn + entry.sticky + entry.cooldown
        elif entry.cooldown > 0:
            state["cooldown_until"] = turn + entry.cooldown
    # Drop expired timers.
    return {
        k: v
        for k, v in new_timers.items()
        if v.get("sticky_until", -1) >= turn or v.get("cooldown_until", -1) >= turn
    }
