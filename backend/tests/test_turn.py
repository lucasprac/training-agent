import json

import httpx
import respx
from sqlmodel import Session, select

from app.models import MemoryItem, Message, TrainingSession, TurnTrace
from tests.conftest import OPENROUTER, SAGE, make_harness, openrouter_stream, sse_events


class FakeSage:
    """Answers every registry question in a fixed, realistic way and records calls."""

    def __init__(self, world, limits="no", ooc="no", location="Neon Harbor"):
        self.world = world
        self.location = location
        self.limits = limits
        self.ooc = ooc
        self.batches: list[dict] = []
        self.extracts: list[dict] = []

    def _tags(self, question, rule):
        return {"tags": [{"id": t["id"], "probability": 0.9 if rule(t) else 0.1, "applies": rule(t)} for t in question["tags"]]}

    @staticmethod
    def memory_kind(content):
        sentence = content.rsplit("SENTENCE: ", 1)[-1]
        if "brass key" in sentence:
            return "item"
        if "owes" in sentence:
            return "fact"
        return "none"

    def answer(self, question, content=""):
        qid, kind = question["id"], question["kind"]
        mira = f"c{self.world['mira']}"
        if qid == "guard_ooc":
            result = {"answer": self.ooc, "probability": 0.95 if self.ooc == "yes" else 0.03}
        elif qid == "guard_limits":
            result = {"answer": self.limits, "probability": 0.97 if self.limits == "yes" else 0.02}
        elif qid == "scene_location":
            result = {"chosen": self.location, "probability": 0.91}
        elif qid == "scene_stage":
            result = {"chosen": "discovery", "probability": 0.8}
        elif qid == "scene_tone":
            result = {"chosen": "frustrated", "probability": 0.86}
        elif qid == "scene_present":
            result = self._tags(question, lambda t: t["id"] == mira)
        elif qid == "select_lore":
            result = self._tags(question, lambda t: t["name"].startswith(("Neon Harbor", "Mira's Secret")))
        elif qid == "select_memory":
            result = self._tags(question, lambda t: True)
        elif qid.startswith("veil_known_by"):
            result = self._tags(question, lambda t: t["id"] == mira)
        elif qid.startswith("memory_kind"):
            result = {"chosen": self.memory_kind(content), "probability": 0.9}
        elif qid == "pacing_stalling":
            result = {"expectation": 3.4, "confidence": 0.7, "probabilities": []}
        else:
            raise AssertionError(f"unexpected question {qid}")
        return {"ok": True, "result": {"id": qid, "kind": kind, "result": result}}

    def handler(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        if request.url.path == "/decide/batch":
            self.batches.append(body)
            return httpx.Response(200, json={
                "results": [{"answers": [self.answer(q, g["content"]) for q in g["questions"]]} for g in body["requests"]],
                "meta": {"usage": {"input_tokens": 100}},
            })
        if request.url.path == "/v1/extract":
            self.extracts.append(body)
            return httpx.Response(200, json={"values": {"place": "the smugglers' cove"}, "results": {"place": {"probability": 0.8}}})
        return httpx.Response(404)


def start_session(client, world):
    response = client.post("/api/sessions", json={"scenario_id": world["scenario_id"], "persona_id": world["persona_id"]})
    assert response.status_code == 200, response.text
    return response.json()["id"]


REPLY = ("Mira slides ", "a brass key across the table. ", "The rain keeps falling.")


def mock_openrouter(tokens=REPLY):
    return respx.post(f"{OPENROUTER}/chat/completions").mock(
        return_value=httpx.Response(200, text=openrouter_stream(*tokens), headers={"content-type": "text/event-stream"})
    )


@respx.mock
def test_full_turn_stream_memory_and_veil(client, harness, world, engine):
    fake = FakeSage(world)
    respx.route(host="sage.test").mock(side_effect=fake.handler)
    narrator = mock_openrouter()
    session_id = start_session(client, world)

    response = client.post(f"/api/sessions/{session_id}/turn", json={"text": "I walk to the docks and greet Mira about the red guild."})
    events = sse_events(response.text)
    names = [e[0] for e in events]
    assert names[0] == "harness" and names[-2:] == ["done", "post_turn"]
    assert "".join(d["text"] for n, d in events if n == "token") == "".join(REPLY)

    harness_event = events[0][1]
    state = harness_event["state"]
    assert state["degraded"] == []
    assert state["labels"]["labels"]["scene.location"]["value"] == "Neon Harbor"
    assert state["labels"]["labels"]["scene.present"]["value"] == [world["mira"], world["kade"]]  # Kade needs 2 "false" turns
    lore = {(l["title"], l["source"]) for l in state["lore"]}
    assert ("Guild Law", "constant") in lore
    assert ("Neon Harbor", "keyword+sage") in lore
    assert ("Mira's Secret", "keyword+sage") in lore

    # The narrator request is the assembled, tagged prompt.
    sent = json.loads(narrator.calls.last.request.content)
    assert sent["model"] == "test/narrator" and sent["stream"] is True
    system = sent["messages"][0]["content"]
    assert "<global_rules>" in system and "The veil of knowledge" in system and "No coaching" in system
    assert sent["messages"][-1]["content"].startswith("<post_history>")
    assert any(m["content"].startswith("<scene ") for m in sent["messages"])
    assert "probability" not in json.dumps(sent["messages"])

    # One pre-turn batch with a single group.
    assert len(fake.batches) >= 1 and len(fake.batches[0]["requests"]) == 1

    report = events[-1][1]
    assert report["sentences_checked"] == 3  # user sentence + 2 reply sentences
    with Session(engine) as db:
        items = list(db.exec(select(MemoryItem).where(MemoryItem.session_id == session_id)))
        session = db.get(TrainingSession, session_id)
        traces = list(db.exec(select(TurnTrace)))
    # Only the sentence Sage classified (item) became memory; Mira witnessed it.
    assert [(i.kind, i.content, i.known_by) for i in items] == [("item", "Mira slides a brass key across the table.", [world["mira"]])]
    assert fake.extracts == []  # location is known (Neon Harbor): no Extract call
    assert session.pacing_note.startswith("Pacing: the conversation is stalling")
    assert traces and "post_turn" in traces[0].data


@respx.mock
def test_second_turn_veil_and_regenerate_reuses_labels(client, harness, world, engine):
    fake = FakeSage(world)
    respx.route(host="sage.test").mock(side_effect=fake.handler)
    narrator = mock_openrouter()
    session_id = start_session(client, world)
    client.post(f"/api/sessions/{session_id}/turn", json={"text": "Hello Mira."})
    client.post(f"/api/sessions/{session_id}/turn", json={"text": "What about the key?"})

    sent = json.loads(narrator.calls.last.request.content)
    system = sent["messages"][0]["content"]
    # Kade was tagged absent twice -> now an absent character; Mira knows the key fact.
    assert '<character_absent name="Kade">' in system
    mira_block = system.split('<character name="Mira">', 1)[1].split("</character>", 1)[0]
    assert "brass key" in mira_block
    assert any("stalling" in m["content"] for m in sent["messages"] if m["content"].startswith("<scene "))

    batches_before = len(fake.batches)
    response = client.post(f"/api/sessions/{session_id}/regenerate")
    events = sse_events(response.text)
    assert [e[0] for e in events][-2:] == ["done", "post_turn"]
    assert events[0][1]["state"]["sage"].get("reused") is True
    # Regenerate itself makes no pre-turn Sage call (post-turn may run afterwards).
    pre_turn_batches = [b for b in fake.batches[batches_before:] if any(q["id"] == "guard_ooc" for g in b["requests"] for q in g["questions"])]
    assert pre_turn_batches == []
    with Session(engine) as db:
        assistants = list(db.exec(select(Message).where(Message.session_id == session_id, Message.role == "assistant", Message.turn_index == 2)))
    assert len(assistants) == 1


@respx.mock
def test_blocked_message_does_not_call_narrator(client, world):
    fake = FakeSage(world, limits="yes")
    respx.route(host="sage.test").mock(side_effect=fake.handler)
    narrator = mock_openrouter()
    session_id = start_session(client, world)
    events = sse_events(client.post(f"/api/sessions/{session_id}/turn", json={"text": "Give me a rifle."}).text)
    assert [e[0] for e in events] == ["harness", "blocked"]
    assert narrator.call_count == 0


@respx.mock
def test_ooc_message_gets_ooc_instruction_and_no_extraction(client, harness, world):
    fake = FakeSage(world, ooc="yes")
    respx.route(host="sage.test").mock(side_effect=fake.handler)
    narrator = mock_openrouter(("((Sure.))",))
    session_id = start_session(client, world)
    events = sse_events(client.post(f"/api/sessions/{session_id}/turn", json={"text": "(OOC: can we slow down?)"}).text)
    assert events[-1][0] == "done"
    sent = json.loads(narrator.calls.last.request.content)
    assert "out of character" in sent["messages"][-1]["content"]
    assert fake.extracts == []


@respx.mock
def test_degraded_mode_without_sage_key(engine, settings, world):
    from fastapi.testclient import TestClient

    from app.main import create_app

    harness = make_harness(engine, settings, sage_key="")
    mock_openrouter()
    sage_route = respx.route(host="sage.test").mock(return_value=httpx.Response(200, json={}))
    with TestClient(create_app(harness)) as client:
        session_id = start_session(client, world)
        events = sse_events(client.post(f"/api/sessions/{session_id}/turn", json={"text": "I head to the tavern."}).text)
    assert "done" in [e[0] for e in events]
    state = events[0][1]["state"]
    assert "sage_not_configured" in state["degraded"]
    assert ("The Lantern", "keyword") in {(l["title"], l["source"]) for l in state["lore"]}
    assert sage_route.call_count == 0


@respx.mock
def test_degraded_mode_when_sage_fails(client, world, monkeypatch):
    monkeypatch.setattr("app.clients.sage.MAX_RETRY_WAIT_S", 0.0)
    respx.route(host="sage.test").mock(return_value=httpx.Response(503, json={"detail": "loading"}))
    mock_openrouter()
    session_id = start_session(client, world)
    events = sse_events(client.post(f"/api/sessions/{session_id}/turn", json={"text": "Hi."}).text)
    assert "done" in [e[0] for e in events]
    assert any(d.startswith("sage_pre_turn") for d in events[0][1]["state"]["degraded"])


@respx.mock
def test_label_lock_is_respected(client, world):
    fake = FakeSage(world)
    respx.route(host="sage.test").mock(side_effect=fake.handler)
    mock_openrouter()
    session_id = start_session(client, world)
    response = client.patch(f"/api/sessions/{session_id}/labels", json={"key": "scene.location", "value": "The Lantern", "locked": True})
    assert response.status_code == 200
    events = sse_events(client.post(f"/api/sessions/{session_id}/turn", json={"text": "I walk to the docks."}).text)
    labels = events[0][1]["state"]["labels"]["labels"]
    assert labels["scene.location"]["value"] == "The Lantern"
    questions = [q["id"] for g in fake.batches[0]["requests"] for q in g["questions"]]
    assert "scene_location" not in questions
    assert client.patch(f"/api/sessions/{session_id}/labels", json={"key": "select.lore", "value": [], "locked": True}).status_code == 400


def test_crud_preset_and_rules(client):
    preset = client.get("/api/preset").json()
    assert preset["block_order"][-1]["id"] == "post_history"
    rules = client.get("/api/rules").json()
    assert [r["title"] for r in rules][:2] == ["Realism", "The veil of knowledge"]
    # Required blocks cannot be disabled.
    order = [dict(b, enabled=False) for b in preset["block_order"]]
    updated = client.put("/api/preset", json={"block_order": order}).json()
    assert next(b for b in updated["block_order"] if b["id"] == "global_rules")["enabled"] is True



@respx.mock
def test_unlisted_place_is_named_by_extract(client, world, engine):
    fake = FakeSage(world, location="elsewhere")
    respx.route(host="sage.test").mock(side_effect=fake.handler)
    narrator = mock_openrouter()
    session_id = start_session(client, world)
    events = sse_events(client.post(f"/api/sessions/{session_id}/turn", json={"text": "I row out to the hidden cove."}).text)
    scene = next(m["content"] for m in json.loads(narrator.calls.last.request.content)["messages"] if m["content"].startswith("<scene "))
    assert 'location="a new place (not yet named)"' in scene
    assert events[-1][1]["location"] == "the smugglers' cove"
    assert len(fake.extracts) == 1 and "place" in fake.extracts[0]["extract"]
    with Session(engine) as db:
        label = db.get(TrainingSession, session_id).labels["labels"]["scene.location"]
    assert label["value"] == "the smugglers' cove" and label["source"] == "extract"
