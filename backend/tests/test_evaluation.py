"""Competency evaluation: Sage questions, evidence sentences, review rules, the full turn."""

import json

import httpx
import respx
from sqlmodel import Session, select

from app.models import Competency, Evaluation, Message, ScenarioCompetency
from app.sage.evaluation import (
    ScenarioCompetencyItem,
    build_evaluation,
    evaluation_view,
    evidence_for,
    sentence_spans,
    to_evaluations,
)
from app.sage.labels import Answer
from tests.conftest import sse_events
from tests.test_turn import FakeSage, mock_openrouter, start_session

LEVELS = [{"level": n, "description": f"level {n}"} for n in range(5)]


def item(cid, name="Empathy", focus="", indicators=None):
    competency = Competency(id=cid, name=name, description="Validates feelings.", levels=LEVELS,
                            indicators=indicators if indicators is not None else [{"id": "i1", "text": "Names the emotion"}])
    return ScenarioCompetencyItem(link=ScenarioCompetency(scenario_id=1, competency_id=cid, focus=focus), competency=competency)


def message(text="I understand your frustration. Send me the order number."):
    return Message(id=7, session_id=3, turn_index=2, role="user", content=text)


def test_build_evaluation_questions():
    sentences = sentence_spans("I understand. Send me the order number.")
    built = build_evaluation("VIEW", [item(1, focus="Mention the second failure."), item(2, "Clarity", indicators=[])], "Ana", sentences)
    questions = built.requests[0]["questions"]
    assert [q["id"] for q in questions] == [
        "competency_exercised", "competency_score_1", "competency_indicators_1", "competency_evidence_1",
        "competency_score_2", "competency_evidence_2",
    ]
    assert [t["id"] for t in questions[0]["tags"]] == ["k1", "k2"]
    assert "Ana" in questions[0]["instructions"] and "handles it badly" in questions[0]["instructions"]
    assert questions[1]["kind"] == "scale" and len(questions[1]["levels"]) == 5
    assert questions[1]["instructions"].endswith("In this scenario: Mention the second failure.")
    assert [t["name"] for t in questions[3]["tags"]] == ["I understand.", "Send me the order number."]
    assert built.qid_to_key["competency_score_1"] == "competency.score:1"
    assert build_evaluation("VIEW", [], "Ana", sentences).requests == []
    no_sentences = build_evaluation("VIEW", [item(1)], "Ana", [])
    assert all(not q["id"].startswith("competency_evidence") for q in no_sentences.requests[0]["questions"])


def test_view_sentences_and_evidence():
    msg = message("*smiles* I understand your frustration!  Send me the order number. ok")
    earlier = [Message(session_id=3, turn_index=1, role="assistant", content="My order arrived broken.")]
    assert evaluation_view(earlier, msg, "Ana").endswith("TRAINEE MESSAGE (Ana):\n" + msg.content)
    spans = sentence_spans(msg.content)
    assert [s["text"] for s in spans] == ["smiles", "I understand your frustration!", "Send me the order number.", "ok"]
    assert all(msg.content[s["start"]:s["end"]] == s["text"] for s in spans)
    assert sentence_spans("no break at all") == [{"text": "no break at all", "start": 0, "end": 15}]
    answer = Answer(kind="tags", value={"s1": {"applies": True, "probability": 0.9}, "s2": {"applies": None}, "s3": {"applies": False}})
    assert evidence_for(answer, spans) == [{**spans[1], "probability": 0.9}]
    assert evidence_for(None, spans) == []


def test_to_evaluations_review_rules():
    items = [item(1), item(2, "Clarity"), item(3, "Negotiation"), item(4, "Listening")]
    tags = {"k1": {"applies": True, "probability": 0.9}, "k2": {"applies": None, "probability": 0.5},
            "k3": {"applies": False, "probability": 0.1}, "k4": {"applies": True, "probability": 0.8}}
    answers = {
        "competency.exercised": Answer(kind="tags", value=tags),
        "competency.score:1": Answer(kind="scale", value=3.4, probability=0.7, probabilities=[{"level": 3, "probability": 0.6}]),
        "competency.score:2": Answer(kind="scale", value=2.0, probability=0.6),
        "competency.score:4": Answer(kind="scale", value=1.0, probability=0.1),
        "competency.indicators:1": Answer(kind="tags", value={"i1": {"applies": True, "probability": 0.95}}),
        "competency.evidence:1": Answer(kind="tags", value={"s0": {"applies": True, "probability": 0.8}}),
    }
    sentences = sentence_spans(message().content)
    rows = {r.competency_id: r for r in to_evaluations(answers, sentences, items, message())}
    assert set(rows) == {1, 2, 4}  # applies=False: no row
    assert rows[1].score == 3.4 and not rows[1].needs_review and rows[1].indicators[0]["applies"] is True
    assert [e["text"] for e in rows[1].evidence] == ["I understand your frustration."] and rows[2].evidence == []
    assert rows[2].needs_review and "could not tell" in rows[2].review_reason  # null is not a low score
    assert rows[4].needs_review and "not sure" in rows[4].review_reason
    assert all(r.message_id == 7 and r.turn_index == 2 for r in rows.values())
    failed = to_evaluations({}, [], items[:1], message(), error="503")
    assert failed[0].needs_review and failed[0].score is None


class EvalSage(FakeSage):
    """FakeSage plus the evaluation batch: every competency applies, the sentences that
    contain "sorry" are the evidence."""

    def __init__(self, world, competency_id, score=3.2):
        super().__init__(world)
        self.cid = competency_id
        self.score = score

    def answer(self, question, content=""):
        qid = question["id"]
        if qid == "competency_exercised":
            return {"ok": True, "result": {"id": qid, "kind": "tags", "result": self._tags(question, lambda t: True)}}
        if qid.startswith("competency_score_"):
            return {"ok": True, "result": {"id": qid, "kind": "scale", "result": {"expectation": self.score, "confidence": 0.7, "probabilities": []}}}
        if qid.startswith("competency_indicators_"):
            return {"ok": True, "result": {"id": qid, "kind": "tags", "result": self._tags(question, lambda t: t["id"] == "i1")}}
        if qid.startswith("competency_evidence_"):
            return {"ok": True, "result": {"id": qid, "kind": "tags", "result": self._tags(question, lambda t: "sorry" in t["name"])}}
        return super().answer(question, content)


@respx.mock
def test_turn_evaluates_the_trainee_message(client, world, engine):
    competency = client.get("/api/competencies").json()[1]  # Empatia
    client.post("/api/scenario-competencies", json={"scenario_id": world["scenario_id"], "competency_id": competency["id"], "focus": "Name the frustration."})
    fake = EvalSage(world, competency["id"])
    respx.route(host="sage.test").mock(side_effect=fake.handler)
    narrator = mock_openrouter()
    session_id = start_session(client, world)
    text = "Mira, I am sorry the guild treated you badly. What can I do?"

    events = sse_events(client.post(f"/api/sessions/{session_id}/turn", json={"text": text}).text)
    report = events[-1][1]
    assert report["evaluation"] == {"competencies": 1, "needs_review": 0}
    assert "score" not in json.dumps(report)  # the trainee sees scores only in the final report
    sent = json.dumps(json.loads(narrator.calls.last.request.content)["messages"])
    assert "Empatia" not in sent and "rubric" not in sent

    evaluation_batch = next(b for b in fake.batches if any(q["id"] == "competency_exercised" for g in b["requests"] for q in g["questions"]))
    assert evaluation_batch.get("reasoning") == "auto"  # preset.evaluation_reasoning
    rows = client.get(f"/api/sessions/{session_id}/evaluations").json()
    assert len(rows) == 1 and rows[0]["score"] == 3.2 and rows[0]["competency_id"] == competency["id"]
    span = rows[0]["evidence"][0]
    assert text[span["start"]:span["end"]] == "Mira, I am sorry the guild treated you badly." and len(rows[0]["evidence"]) == 1
    assert [i["id"] for i in rows[0]["indicators"] if i["applies"]] == ["i1"]

    # The manager corrects the score; a regenerate keeps the correction and adds no duplicate.
    assert client.patch(f"/api/evaluations/{rows[0]['id']}", json={"score": 9}).status_code == 400
    corrected = client.patch(f"/api/evaluations/{rows[0]['id']}", json={"score": 2, "note": "Too generic."}).json()
    assert corrected["source"] == "manager" and corrected["needs_review"] is False
    client.post(f"/api/sessions/{session_id}/regenerate")
    with Session(engine) as db:
        stored = list(db.exec(select(Evaluation).where(Evaluation.session_id == session_id)))
    assert [(e.score, e.source) for e in stored] == [(2, "manager")]


@respx.mock
def test_evaluation_failure_marks_rows_for_review(client, world, monkeypatch):
    monkeypatch.setattr("app.clients.sage.MAX_RETRY_WAIT_S", 0.0)
    competency = client.get("/api/competencies").json()[0]
    client.post("/api/scenario-competencies", json={"scenario_id": world["scenario_id"], "competency_id": competency["id"]})
    fake = FakeSage(world)

    def handler(request):
        body = json.loads(request.content)
        if request.url.path == "/decide/batch" and any(q["id"] == "competency_exercised" for g in body["requests"] for q in g["questions"]):
            return httpx.Response(503, json={"detail": "loading"})
        return fake.handler(request)

    respx.route(host="sage.test").mock(side_effect=handler)
    mock_openrouter()
    session_id = start_session(client, world)
    events = sse_events(client.post(f"/api/sessions/{session_id}/turn", json={"text": "Hello Mira."}).text)
    report = events[-1][1]
    assert report["evaluation"] == {"competencies": 1, "needs_review": 1}
    assert any(e.startswith("evaluation:") for e in report["errors"])
    assert report["memory_added"]  # memory does not depend on the evaluation
    row = client.get(f"/api/sessions/{session_id}/evaluations").json()[0]
    assert row["needs_review"] and row["score"] is None
