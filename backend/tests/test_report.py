"""Session completion, the report, manager corrections and the results table."""

import json

import httpx
import respx

from app.models import Competency, Evaluation, Message, ScenarioCompetency, StateVariable, TrainingSession
from app.sage.evaluation import ScenarioCompetencyItem
from app.sage.labels import Label, LabelSet
from app.training.report import build_report
from tests.conftest import OPENROUTER, openrouter_stream, sse_events
from tests.test_evaluation import EvalSage
from tests.test_turn import start_session

LEVELS = [{"level": n, "description": f"level {n}"} for n in range(5)]


def comp(cid, name, weight=1.0):
    competency = Competency(id=cid, name=name, levels=LEVELS, indicators=[
        {"id": "i1", "text": "Names the emotion", "polarity": "positive"},
        {"id": "i2", "text": "Blames the customer", "polarity": "negative"},
    ])
    return ScenarioCompetencyItem(link=ScenarioCompetency(scenario_id=1, competency_id=cid, weight=weight), competency=competency)


def row(cid, score, confidence, message_id=1, **kw):
    return Evaluation(session_id=1, competency_id=cid, message_id=message_id, turn_index=message_id, score=score, confidence=confidence, **kw)


def test_build_report_weights_review_and_objectives():
    labels = LabelSet()
    labels.put(Label(key="state.1", value=True))
    labels.put(Label(key="state.3", value=2.6))
    session = TrainingSession(id=1, scenario_id=1, turn_count=3, labels=labels.model_dump())
    variables = [
        StateVariable(id=1, name="Asked order", kind="yesno", is_objective=True),
        StateVariable(id=2, name="Gave a deadline", kind="yesno", is_objective=True),
        StateVariable(id=3, name="Trust", kind="scale", options=LEVELS),
    ]
    messages = [Message(id=1, session_id=1, role="user", content="I am sorry."), Message(id=2, session_id=1, role="user", content="Ok.")]
    evaluations = [
        row(1, 4.0, 0.9, evidence=[{"text": "I am sorry", "start": 0, "end": 10, "probability": 0.9}],
            indicators=[{"id": "i1", "applies": True}, {"id": "i2", "applies": False}]),
        row(1, 2.0, 0.1, message_id=2, indicators=[{"id": "i2", "applies": True}]),
        row(1, None, None, message_id=2, needs_review=True),  # excluded from the average
        row(2, 3.0, 0.5, needs_review=True),  # review only
        row(3, 1.0, 0.2, source="manager"),  # a manager row counts with weight 1
    ]
    items = [comp(1, "Empathy", weight=2), comp(2, "Clarity"), comp(3, "Negotiation"), comp(4, "Listening")]
    report = build_report(session, items, variables, evaluations, messages)
    by_name = {c["name"]: c for c in report["competencies"]}
    empathy = by_name["Empathy"]
    assert empathy["score"] == round((4.0 * 0.9 + 2.0 * 0.1) / 1.0, 2) and empathy["percent"] == 95
    assert empathy["observed"] == 2 and empathy["needs_review"] == 1 and empathy["level_description"] == "level 4"
    assert [(i["id"], i["count"]) for i in empathy["indicators"]] == [("i1", 1), ("i2", 1)]
    assert empathy["evidence"] == [{"turn_index": 1, "message_id": 1, "message": "I am sorry.", "spans": [{"start": 0, "end": 10, "text": "I am sorry"}]}]
    assert by_name["Clarity"]["status"] == "review_only" and by_name["Clarity"]["score"] is None
    assert by_name["Negotiation"]["percent"] == 25
    assert by_name["Listening"]["status"] == "not_observed"
    assert report["overall_percent"] == round((95 * 2 + 25) / 3)
    assert [(o["name"], o["reached"]) for o in report["objectives"]] == [("Asked order", True), ("Gave a deadline", False)]
    assert report["objectives_reached"] == 1 and report["pending_review"] == 2
    assert report["final_state"] == [{"id": 3, "name": "Trust", "value": "level 3"}]


def openrouter_router(feedback="Strengths: you named the frustration."):
    """Streaming calls get the narrator reply; plain calls (the feedback) get JSON."""
    calls = []

    def handler(request):
        body = json.loads(request.content)
        calls.append(body)
        if body.get("stream"):
            return httpx.Response(200, text=openrouter_stream("Mira nods. ", "I am sorry is a start."), headers={"content-type": "text/event-stream"})
        return httpx.Response(200, json={"choices": [{"message": {"content": feedback}}]})

    respx.post(f"{OPENROUTER}/chat/completions").mock(side_effect=handler)
    return calls


@respx.mock
def test_complete_session_report_corrections_and_results(client, world):
    sid = world["scenario_id"]
    competency = client.get("/api/competencies").json()[1]
    client.post("/api/scenario-competencies", json={"scenario_id": sid, "competency_id": competency["id"]})
    client.patch(f"/api/scenarios/{sid}", json={"max_turns": 2})
    fake = EvalSage(world, competency["id"], score=3.0)
    respx.route(host="sage.test").mock(side_effect=fake.handler)
    calls = openrouter_router()
    ana = client.post("/api/profiles", json={"name": "Ana"}).json()
    session_id = client.post("/api/sessions", json={"scenario_id": sid, "persona_id": world["persona_id"], "profile_id": ana["id"]}).json()["id"]

    first = sse_events(client.post(f"/api/sessions/{session_id}/turn", json={"text": "Mira, I am sorry for the trouble."}).text)
    assert next(d for n, d in first if n == "done")["end_reason"] is None
    second = sse_events(client.post(f"/api/sessions/{session_id}/turn", json={"text": "I am sorry, let me fix it now."}).text)
    assert next(d for n, d in second if n == "done")["end_reason"] == "max_turns"
    third = sse_events(client.post(f"/api/sessions/{session_id}/turn", json={"text": "One more."}).text)
    assert third[0][0] == "error" and "turn limit" in third[0][1]["message"]

    assert client.get(f"/api/sessions/{session_id}/report").json()["report"] is None
    done = client.post(f"/api/sessions/{session_id}/complete").json()
    assert done["status"] == "completed"
    report = done["report"]
    assert report["competencies"][0]["score"] == 3.0 and report["competencies"][0]["observed"] == 2
    assert report["feedback"].startswith("Strengths")
    feedback_call = next(c for c in calls if not c.get("stream"))
    assert feedback_call["model"] == "test/summary" and '"score_percent": 75' in feedback_call["messages"][1]["content"]

    blocked = sse_events(client.post(f"/api/sessions/{session_id}/regenerate").text)
    assert blocked[0][0] == "error" and "completed" in blocked[0][1]["message"]

    # A manager correction updates the stored report and keeps the feedback text.
    evaluation_id = client.get(f"/api/sessions/{session_id}/evaluations").json()[0]["id"]
    client.patch(f"/api/evaluations/{evaluation_id}", json={"score": 1})
    stored = client.get(f"/api/sessions/{session_id}/report").json()["report"]
    # manager row (score 1, weight 1) + Sage row (score 3, weight = confidence 0.7)
    assert stored["competencies"][0]["score"] == round((1 * 1 + 3 * 0.7) / 1.7, 2) and stored["feedback"].startswith("Strengths")

    table = client.get(f"/api/results?scenario_id={sid}").json()
    assert table["competencies"] == [{"id": competency["id"], "name": competency["name"]}]
    assert table["rows"][0]["name"] == "Ana" and table["rows"][0]["sessions"] == 1
    assert table["rows"][0]["competencies"][str(competency["id"])] == stored["competencies"][0]["percent"] == 46
    assert client.get("/api/results?scenario_id=999").json() == {"competencies": [], "rows": []}


@respx.mock
def test_objectives_reached_suggests_the_end(client, world):
    sid = world["scenario_id"]
    goal = client.post("/api/state-variables", json={"scenario_id": sid, "name": "Greeted", "kind": "yesno", "is_objective": True}).json()
    from tests.test_turn import FakeSage

    class GoalSage(FakeSage):
        def answer(self, question, content=""):
            if question["id"] == f"state_{goal['id']}":
                return {"ok": True, "result": {"id": question["id"], "kind": "yesno", "result": {"answer": "yes", "probability": 0.99}}}
            return super().answer(question, content)

    respx.route(host="sage.test").mock(side_effect=GoalSage(world).handler)
    openrouter_router()
    session_id = start_session(client, world)
    events = sse_events(client.post(f"/api/sessions/{session_id}/turn", json={"text": "Hello Mira."}).text)
    assert next(d for n, d in events if n == "done")["end_reason"] == "objectives"
