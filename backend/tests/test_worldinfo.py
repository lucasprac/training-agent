import random

from app.models import LoreEntry
from app.worldinfo.activation import (
    activate,
    apply_budget,
    entry_matches,
    finalize,
    key_matches,
    update_timers,
)


def entry(i, **kw):
    defaults = {"id": i, "scenario_id": 1, "title": f"E{i}", "content": f"content {i}", "keys": []}
    defaults.update(kw)
    return LoreEntry(**defaults)


def test_key_matching_plain_whole_word_and_regex():
    assert key_matches("dock", "the dock is wet")
    assert not key_matches("dock", "the docks are wet")
    assert key_matches("dock", "the docks are wet", whole_words=False)
    assert key_matches("/dock(s)?/i", "The DOCKS")
    assert not key_matches("Mira", "mira", case_sensitive=True)


def test_secondary_logic():
    e = entry(1, keys=["sword"], secondary_keys=["fire", "ice"])
    for logic, text, expected in [
        ("and_any", "a sword of fire", True),
        ("and_any", "a sword", False),
        ("and_all", "a sword of fire", False),
        ("and_all", "a sword of fire and ice", True),
        ("not_any", "a sword", True),
        ("not_any", "a sword of ice", False),
        ("not_all", "a sword of ice", True),
        ("not_all", "a sword of fire and ice", False),
    ]:
        e.selective_logic = logic
        assert entry_matches(e, text) is expected, (logic, text)


def test_activation_constant_hits_recursion_and_candidates():
    entries = [
        entry(1, constant=True, content="The city has a lighthouse."),
        entry(2, keys=["lighthouse"], content="The keeper is blind."),  # recursion from 1
        entry(3, keys=["keeper"], content="..."),  # recursion only one pass deep from 2 -> not hit
        entry(4, keys=["market"]),
        entry(5, kind="location", title="Harbor", order=1),
        entry(6, enabled=False, keys=["market"]),
    ]
    result = activate(entries, ["we go to the market"], turn=1, location="harbor")
    assert [e.id for e in result.constant] == [1]
    assert sorted(e.id for e in result.keyword_hits) == [2, 4]
    assert result.candidates[0].id == 5  # current location first
    assert 6 not in [e.id for e in result.candidates + result.keyword_hits]


def test_scan_depth_and_delay():
    e = entry(1, keys=["ghost"], scan_depth=1)
    assert not activate([e], ["a ghost", "nothing"], turn=2).keyword_hits
    assert activate([entry(2, keys=["ghost"])], ["a ghost", "nothing"], turn=2).keyword_hits
    delayed = entry(3, keys=["ghost"], delay=5)
    result = activate([delayed], ["a ghost"], turn=1)
    assert not result.keyword_hits and not result.candidates


def test_probability_uses_rng():
    e = entry(1, keys=["coin"], probability=0)
    assert not activate([e], ["coin"], turn=1, rng=random.Random(0)).keyword_hits
    e.probability = 100
    assert activate([e], ["coin"], turn=1).keyword_hits


def test_sticky_and_cooldown_timers():
    e = entry(1, keys=["storm"], sticky=2, cooldown=1)
    first = activate([e], ["storm"], turn=1)
    selected = finalize(first, None)
    timers = update_timers({}, selected, turn=1)
    assert timers["1"] == {"sticky_until": 3, "cooldown_until": 4}
    assert activate([e], ["calm"], turn=2, timers=timers).sticky  # still sticky
    assert activate([e], ["calm"], turn=3, timers=timers).sticky
    cooling = activate([e], ["storm"], turn=4, timers=timers)
    assert not cooling.sticky and not cooling.keyword_hits  # cooldown blocks
    assert activate([e], ["storm"], turn=5, timers=update_timers(timers, [], 5)).keyword_hits


def test_finalize_with_sage_answers():
    result = activate([entry(1, keys=["a"]), entry(2, keys=["b"]), entry(3), entry(4)], ["a b"], turn=1)
    selected = finalize(result, {1: False, 2: None, 3: True, 4: None})
    assert {(s.entry.id, s.source) for s in selected} == {(2, "keyword"), (3, "sage")}
    degraded = finalize(result, None)
    assert {s.entry.id for s in degraded} == {1, 2}


def test_budget_keeps_priority_order():
    big = "x" * 400  # ~100 tokens
    selected = finalize(
        activate([entry(1, constant=True, content=big), entry(2, keys=["k"], content=big), entry(3, content=big)], ["k"], turn=1),
        {2: True, 3: True},
    )
    kept, dropped = apply_budget(selected, budget_tokens=220)
    assert [s.entry.id for s in kept] == [1, 2]
    assert [s.entry.id for s in dropped] == [3]
