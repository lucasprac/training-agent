"""Simulation state variables: Sage questions, stability rules, Extract values, <sim_state>."""

import json

import httpx
import respx
from sqlmodel import Session

from app.models import StateVariable, TrainingSession
from app.prompt.assembler import assemble
from app.sage import labels as L
from app.sage.extract import map_state, state_schema
from app.sage.registry import SageContext, state_specs
from app.sage.request import build_pre_turn
from app.training.state import display_value, state_key
from tests.test_assembler import base_input
from tests.test_turn import FakeSage, mock_openrouter, start_session
from tests.conftest import sse_events

TRUST_LEVELS = [{"level": 0, "description": "hostile"}, {"level": 1, "description": "wary"}, {"level": 2, "description": "trusting"}]


def var(id_, kind, **kw):
    return StateVariable(id=id_, scenario_id=1, name=kw.pop("name", f"v{id_}"), kind=kind, **kw)


def test_state_specs_build_questions_and_skip_invalid():
    variables = [
        var(1, "scale", options=TRUST_LEVELS, instructions="How much does {user} earn trust?"),
        var(2, "yesno", is_objective=True, instructions="Did {user} ask for the order number?"),
        var(3, "choice", options=[{"option": "only one"}]),  # fewer than 2 options: not asked
        var(4, "extract", extract_type="decimal"),  # goes to Extract
        var(5, "yesno", enabled=False),
    ]
    specs = state_specs(variables)
    assert [s.key for s in specs] == ["state.1", "state.2", "state.3"]
    ctx = SageContext(characters=[], persona_name="Ana")
    built = build_pre_turn("VIEW", ctx, locked={"state.2"}, extra_specs=specs)
    questions = {q["id"]: q for q in built.requests[0]["questions"]}
    assert "state_1" in questions and "state_2" not in questions and "state_3" not in questions
    assert questions["state_1"]["kind"] == "scale" and len(questions["state_1"]["levels"]) == 3
    assert questions["state_1"]["instructions"] == "How much does Ana earn trust?"


def test_apply_state_carry_objective_and_scale():
    labels = L.LabelSet()
    L.apply_state(labels, "state.2", "yesno", L.Answer(kind="yesno", value=False, probability=0.1), 0.7, 1, objective=True)
    assert labels.value("state.2") is False
    L.apply_state(labels, "state.2", "yesno", L.Answer(kind="yesno", value=None, probability=0.5), 0.7, 2, objective=True)
    assert labels.value("state.2") is False and labels.get("state.2").certainty == "carried"  # null keeps the value
    L.apply_state(labels, "state.2", "yesno", L.Answer(kind="yesno", value=True, probability=0.9), 0.7, 3, objective=True)
    L.apply_state(labels, "state.2", "yesno", L.Answer(kind="yesno", value=False, probability=0.1), 0.7, 4, objective=True)
    assert labels.value("state.2") is True  # a reached objective stays reached

    L.apply_state(labels, "state.1", "scale", L.Answer(kind="scale", value=1.62, probability=0.3), 0.7, 1)
    assert labels.value("state.1") == 1.62 and labels.get("state.1").certainty == "low"
    L.apply_state(labels, "state.3", "choice", L.Answer(kind="choice", value="calm", probability=0.4), 0.7, 1)
    assert labels.value("state.3") is None  # low-confidence choice is not taken


def test_extract_schema_mapping_and_threshold():
    variables = [var(4, "extract", extract_type="money", instructions="the discount\noffered")]
    assert state_schema(variables) == {"s4": {"type": "money", "definition": "the discount offered"}}
    response = {"values": {"s4": {"amount": 20, "currency": "BRL"}}, "results": {"s4": {"probability": 0.9}}}
    assert map_state(response, variables) == {4: ({"amount": 20, "currency": "BRL"}, 0.9)}
    labels = L.LabelSet()
    L.apply_extracted(labels, "state.4", {"amount": 20, "currency": "BRL"}, 0.9, 1)
    L.apply_extracted(labels, "state.4", {"amount": 99, "currency": "BRL"}, 0.3, 2)  # improbable: carried
    L.apply_extracted(labels, "state.4", None, 1.0, 3)  # absent: carried
    assert labels.value("state.4") == {"amount": 20, "currency": "BRL"}
    assert display_value(variables[0], labels.value("state.4")) == "20 BRL"


def test_display_value_and_sim_state_block():
    trust = var(1, "scale", name="Trust", options=TRUST_LEVELS)
    hidden = var(2, "yesno", name="Asked order number", is_objective=True, tell_narrator=False)
    assert display_value(trust, 1.62) == "trusting"
    assert display_value(hidden, True) == "yes"
    inp = base_input()
    inp.state_variables = [trust, hidden]
    inp.labels.put(L.Label(key=state_key(1), value=1.62, probability=0.81))
    inp.labels.put(L.Label(key=state_key(2), value=True))
    scene = next(m["content"] for m in assemble(inp).messages if m["content"].startswith("<scene "))
    assert "<sim_state>\n- Trust: trusting\n</sim_state>" in scene
    assert "Asked order number" not in scene and "0.81" not in scene and "1.62" not in scene


class StateSage(FakeSage):
    """FakeSage plus answers for the scenario's state questions and the state Extract."""

    def __init__(self, world, ids):
        super().__init__(world)
        self.ids = ids

    def answer(self, question, content=""):
        qid = question["id"]
        if qid == f"state_{self.ids['trust']}":
            return {"ok": True, "result": {"id": qid, "kind": "scale", "result": {"expectation": 2.2, "confidence": 0.8}}}
        if qid == f"state_{self.ids['goal']}":
            return {"ok": True, "result": {"id": qid, "kind": "yesno", "result": {"answer": "yes", "probability": 0.96}}}
        return super().answer(question, content)

    def handler(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        if request.url.path == "/v1/extract" and f"s{self.ids['discount']}" in body["extract"]:
            self.extracts.append(body)
            field = f"s{self.ids['discount']}"
            return httpx.Response(200, json={"values": {field: 15}, "results": {field: {"probability": 0.95}}})
        return super().handler(request)


@respx.mock
def test_turn_tracks_state_and_tells_the_narrator(client, world, engine):
    sid = world["scenario_id"]
    post = lambda body: client.post("/api/state-variables", json={"scenario_id": sid, **body}).json()["id"]  # noqa: E731
    ids = {
        "trust": post({"name": "Trust", "kind": "scale", "options": TRUST_LEVELS, "initial_value": 1}),
        "goal": post({"name": "Asked order number", "kind": "yesno", "is_objective": True, "tell_narrator": False}),
        "discount": post({"name": "Discount (%)", "kind": "extract", "extract_type": "decimal"}),
    }
    fake = StateSage(world, ids)
    respx.route(host="sage.test").mock(side_effect=fake.handler)
    narrator = mock_openrouter()
    session_id = start_session(client, world)
    with Session(engine) as db:
        initial = db.get(TrainingSession, session_id).labels["labels"]
    assert initial[f"state.{ids['trust']}"]["value"] == 1 and initial[f"state.{ids['goal']}"]["value"] is False

    events = sse_events(client.post(f"/api/sessions/{session_id}/turn", json={"text": "What is your order number? I can give 15% off."}).text)
    labels = events[0][1]["state"]["labels"]["labels"]
    assert labels[f"state.{ids['trust']}"]["value"] == 2.2
    assert labels[f"state.{ids['goal']}"]["value"] is True
    assert labels[f"state.{ids['discount']}"]["value"] == 15 and labels[f"state.{ids['discount']}"]["source"] == "extract"
    assert any(f"s{ids['discount']}" in e["extract"] for e in fake.extracts)

    scene = next(m["content"] for m in json.loads(narrator.calls.last.request.content)["messages"] if m["content"].startswith("<scene "))
    assert "- Trust: trusting" in scene and "- Discount (%): 15" in scene
    assert "Asked order number" not in scene

    # The reached objective is not asked again.
    batches_before = len(fake.batches)
    client.post(f"/api/sessions/{session_id}/turn", json={"text": "Thanks."})
    questions = [q["id"] for b in fake.batches[batches_before:] for g in b["requests"] for q in g["questions"]]
    assert f"state_{ids['trust']}" in questions and f"state_{ids['goal']}" not in questions

    # A manager can lock a state variable; another scenario's key is refused.
    assert client.patch(f"/api/sessions/{session_id}/labels", json={"key": f"state.{ids['trust']}", "value": 0, "locked": True}).status_code == 200
    assert client.patch(f"/api/sessions/{session_id}/labels", json={"key": "state.999", "value": 0}).status_code == 400
    response = client.get(f"/api/sessions/{session_id}/labels").json()
    assert [v["key"] for v in response["state_variables"]] == [f"state.{ids[k]}" for k in ("trust", "goal", "discount")]
