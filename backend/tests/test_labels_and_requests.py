from app.models import Character, GlobalRule, LoreEntry, MemoryItem, Message
from app.prompt.budget import estimate_tokens
from app.sage import labels as L
from app.sage.registry import SageContext, specs_for
from app.sage.request import SAGE_VIEW_TOKENS, build_post_turn, build_pre_turn, build_sage_view


def answer(kind, value, probability=None):
    return L.Answer(kind=kind, value=value, probability=probability)


def test_parse_batch_maps_kinds():
    response = {
        "results": [
            {"answers": [
                {"ok": True, "result": {"id": "guard_ooc", "kind": "yesno", "result": {"answer": None, "probability": 0.5}}},
                {"ok": True, "result": {"id": "scene_location", "kind": "choice", "result": {"chosen": "Docks", "probability": 0.9}}},
                {"ok": True, "result": {"id": "pacing_stalling", "kind": "scale", "result": {"expectation": 3.2, "confidence": 0.7}}},
                {"ok": True, "result": {"id": "scene_present", "kind": "tags", "result": {"tags": [{"id": "c1", "probability": 0.9, "applies": True}]}}},
                {"ok": False, "error": "bad"},
            ]}
        ]
    }
    answers, errors = L.parse_batch(response)
    assert answers["guard_ooc"].value is None
    assert answers["scene_location"].value == "Docks"
    assert answers["pacing_stalling"].value == 3.2
    assert answers["scene_present"].value == {"c1": {"applies": True, "probability": 0.9}}
    assert len(errors) == 1


def test_choice_threshold_carry_unchanged_and_lock():
    labels = L.LabelSet()
    L.apply_choice(labels, "scene.location", answer("choice", "Docks", 0.95), 0.7, 1)
    assert labels.get("scene.location").value == "Docks"
    # Low confidence: keep previous value, marked carried (no flicker)
    L.apply_choice(labels, "scene.location", answer("choice", "Tavern", 0.55), 0.7, 2)
    assert labels.get("scene.location").value == "Docks"
    assert labels.get("scene.location").certainty == "carried"
    # Null answer also carries
    L.apply_choice(labels, "scene.location", answer("choice", None, None), 0.7, 3)
    assert labels.get("scene.location").value == "Docks"
    # Confident "unchanged" confirms
    L.apply_choice(labels, "scene.location", answer("choice", "unchanged", 0.9), 0.7, 4)
    assert labels.get("scene.location").certainty == "high"
    # Locked labels never change
    labels.put(L.Label(key="scene.location", value="Lighthouse", source="user", locked=True))
    L.apply_choice(labels, "scene.location", answer("choice", "Docks", 0.99), 0.7, 5)
    assert labels.get("scene.location").value == "Lighthouse"


def test_present_hysteresis():
    labels = L.LabelSet()
    tags = lambda applies: answer("tags", {"c1": {"applies": True}, "c2": {"applies": applies}})  # noqa: E731
    L.apply_present(labels, tags(True), [1, 2], 1, False)
    assert labels.value("scene.present") == [1, 2]
    L.apply_present(labels, tags(False), [1, 2], 2, False)
    assert labels.value("scene.present") == [1, 2]  # one "false" is not enough
    L.apply_present(labels, tags(False), [1, 2], 3, False)
    assert labels.value("scene.present") == [1]  # second consecutive "false" -> leaves
    L.apply_present(labels, tags(True), [1, 2], 4, False)
    assert labels.value("scene.present") == [1, 2]
    L.apply_present(labels, tags(False), [1, 2], 5, location_changed=True)
    assert labels.value("scene.present") == [1]  # location change -> leaves at once
    L.apply_present(labels, tags(None), [1, 2], 6, False)
    assert labels.get("scene.present").certainty == "low"


def _ctx(n_lore=0, n_memory=0):
    chars = [Character(id=1, scenario_id=1, name="Mira", description="Smuggler."), Character(id=2, scenario_id=1, name="Kade")]
    return SageContext(
        characters=chars,
        persona_name="Ash",
        location_entries=[LoreEntry(id=1, title="Docks", kind="location", content="Wet planks.")],
        lore_pool=[LoreEntry(id=100 + i, title=f"L{i}", content="x") for i in range(n_lore)],
        memory_pool=[MemoryItem(id=i + 1, session_id=1, content=f"m{i}") for i in range(n_memory)],
        present_ids=[1],
    )


def test_pre_turn_request_from_registry_and_limits():
    built = build_pre_turn("VIEW", _ctx(n_lore=300, n_memory=500), locked=set())
    questions = built.requests[0]["questions"]
    keys = [built.qid_to_key[q["id"]] for q in questions]
    assert keys == [s.key for s in specs_for("pre_turn")]
    for q in questions:
        assert len(q.get("tags", [])) <= 120
        assert len(q.get("options", [])) <= 120
        assert "." not in q["id"]
    location = next(q for q in questions if q["id"] == "scene_location")
    assert [o["option"] for o in location["options"]][:3] == ["unchanged", "elsewhere", "Docks"]
    assert "Ash" in next(q for q in questions if q["id"] == "guard_ooc")["instructions"]


def test_locked_labels_are_not_asked_and_empty_pools_skip():
    built = build_pre_turn("VIEW", _ctx(), locked={"scene.mood", "select.lore"})
    keys = set(built.qid_to_key.values())
    assert "scene.mood" not in keys
    assert "select.lore" not in keys  # empty pool (and not lockable anyway)
    assert "select.memory" not in keys


def test_sage_view_respects_budget():
    history = [Message(session_id=1, turn_index=i, role="user" if i % 2 else "assistant", content="word " * 400) for i in range(60)]
    view = build_sage_view([GlobalRule(title="Canon", text="Lore is fact.")], "No guns.", L.LabelSet(), _ctx().characters, "Ash", history)
    assert estimate_tokens(view) <= SAGE_VIEW_TOKENS
    assert "<last_message>" in view and "Ash:" in view and "No guns." in view


def test_post_turn_request_one_group_per_sentence_plus_pacing():
    built = build_post_turn("TURN", "RECENT", ["sentence a", "sentence b"], _ctx())
    assert len(built.requests) == 3
    assert built.requests[0]["content"] == "TURN\n\nSENTENCE: sentence a"
    assert set(built.qid_to_key.values()) == {
        "memory.kind:0", "veil.known_by:0", "memory.kind:1", "veil.known_by:1", "pacing.stalling",
    }
    kind_q, known_q = built.requests[0]["questions"]
    assert [o["option"] for o in kind_q["options"]][-1] == "none"
    assert [t["id"] for t in known_q["tags"]] == ["c1"]  # only present characters


def test_post_turn_without_present_characters_skips_known_by():
    ctx = _ctx()
    ctx.present_ids = []
    built = build_post_turn("TURN", "RECENT", ["sentence a"], ctx)
    assert [q["kind"] for q in built.requests[0]["questions"]] == ["choice"]


def test_candidate_sentences_split_dedup_and_prefix():
    from app.sage.extract import candidate_sentences

    out = candidate_sentences(
        "I take the key. Thanks!",
        "Mira slides a brass key across the table. \"They want this back,\" she says.\nKade waits outside the gate.",
        "Ash",
        existing=["Kade waits outside the gate."],
    )
    assert out == [
        "Ash: I take the key.",
        "Mira slides a brass key across the table.",
        "They want this back,\" she says.",
    ] or out[:2] == ["Ash: I take the key.", "Mira slides a brass key across the table."]
    assert all("Kade waits" not in s for s in out)
    assert "Thanks!" not in " ".join(out)  # fewer than 3 words


def test_map_location_uses_probability():
    from app.sage.extract import map_location

    assert map_location({"values": {"place": "the old mill"}, "results": {"place": {"probability": 0.8}}}) == "the old mill"
    assert map_location({"values": {"place": "Mira"}, "results": {"place": {"probability": 0.3}}}) is None
    assert map_location({"values": {"place": None}}) is None
