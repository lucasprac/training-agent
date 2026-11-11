"""Session report: competency scores, objectives, final state and written feedback.

The numbers come only from the stored evaluations (Sage, or a manager correction).
The summary model writes the feedback text from those numbers; it never changes them.
"""

import json
from datetime import datetime, timezone
from typing import Any

from sqlmodel import Session, select

from app.clients.openrouter import OpenRouterClient, OpenRouterError
from app.models import Competency, Evaluation, Message, Persona, Profile, Scenario, StateVariable, TrainingSession
from app.sage.evaluation import ScenarioCompetencyItem
from app.sage.labels import LabelSet
from app.training import state as sim_state
from app.training.competencies import scenario_competencies

SAGE_MIN_WEIGHT = 0.1  # a Sage row counts at least this much in the average
MAX_REPORT_EVIDENCE = 3

FEEDBACK_SYSTEM = (
    "You write the feedback for a trainee after a workplace training simulation. Use the language of the "
    "scenario and of the trainee's messages. Speak to the trainee directly, with respect. Base every point on "
    "the scores, behaviours and quotes you are given. Never invent a score, a quote or an event, and never "
    "change a score. Write three short sections with these headings, translated into that language: "
    "Strengths, What to improve, Next practice. Write plain text, not Markdown: put each heading alone on "
    "its own line and start each point with \"- \". Use at most 180 words."
)


def _weight(row: Evaluation) -> float:
    return 1.0 if row.source == "manager" else max(row.confidence or 0.0, SAGE_MIN_WEIGHT)


def _nearest_level(levels: list[dict[str, Any]], score: float) -> dict[str, Any]:
    return min(levels, key=lambda lv: abs(float(lv["level"]) - score))


def competency_result(item: ScenarioCompetencyItem, rows: list[Evaluation], messages: dict[int, Message]) -> dict[str, Any]:
    c = item.competency
    levels = [lv["level"] for lv in c.levels] or [0, 1]
    low, high = min(levels), max(levels)
    scored = [r for r in rows if r.score is not None and not r.needs_review]
    result: dict[str, Any] = {
        "competency_id": item.id,
        "name": c.name,
        "description": c.description,
        "weight": item.link.weight,
        "min_level": low,
        "max_level": high,
        "observed": len(scored),
        "needs_review": sum(1 for r in rows if r.needs_review),
        "score": None,
        "percent": None,
        "level_description": None,
        "status": "scored" if scored else "review_only" if rows else "not_observed",
    }
    if scored:
        total = sum(_weight(r) for r in scored)
        score = sum(_weight(r) * float(r.score) for r in scored) / total
        result["score"] = round(score, 2)
        result["percent"] = round((score - low) / (high - low) * 100) if high > low else None
        result["level_description"] = _nearest_level(c.levels, score).get("description")
    counts: dict[str, int] = {}
    for row in scored:
        for indicator in row.indicators:
            if indicator.get("applies") is True:
                counts[str(indicator["id"])] = counts.get(str(indicator["id"]), 0) + 1
    result["indicators"] = [
        {"id": i["id"], "text": i.get("text", ""), "polarity": i.get("polarity", "positive"), "count": counts.get(str(i["id"]), 0)}
        for i in c.indicators
    ]
    # One item per message, with every evidence span of that message, best-scored messages first.
    result["evidence"] = [
        {
            "turn_index": row.turn_index,
            "message_id": row.message_id,
            "message": messages[row.message_id].content,
            "spans": sorted(({"start": s["start"], "end": s["end"], "text": s["text"]} for s in row.evidence), key=lambda s: s["start"]),
        }
        for row in sorted(scored, key=lambda r: (-(r.score or 0), r.turn_index))
        if row.evidence and row.message_id in messages
    ][:MAX_REPORT_EVIDENCE]
    return result


def build_report(
    session: TrainingSession,
    items: list[ScenarioCompetencyItem],
    variables: list[StateVariable],
    evaluations: list[Evaluation],
    messages: list[Message],
) -> dict[str, Any]:
    by_id = {m.id: m for m in messages if m.id is not None}
    competencies = [competency_result(i, [e for e in evaluations if e.competency_id == i.id], by_id) for i in items]
    weighted = [(c["percent"], c["weight"]) for c in competencies if c["percent"] is not None]
    labels = LabelSet.from_json(session.labels)
    objectives = [
        {"id": v.id, "name": v.name, "reached": labels.value(sim_state.state_key(v.id)) is True}
        for v in variables if v.is_objective
    ]
    final_state = [
        {"id": v.id, "name": v.name, "value": sim_state.display_value(v, labels.value(sim_state.state_key(v.id)))}
        for v in variables if not v.is_objective
    ]
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "turns": session.turn_count,
        "overall_percent": round(sum(p * w for p, w in weighted) / sum(w for _, w in weighted)) if weighted else None,
        "competencies": competencies,
        "objectives": objectives,
        "objectives_reached": sum(o["reached"] for o in objectives),
        "final_state": final_state,
        "pending_review": sum(c["needs_review"] for c in competencies),
        "feedback": (session.report or {}).get("feedback", ""),
    }


def _load(db: Session, session: TrainingSession) -> tuple[list[ScenarioCompetencyItem], list[StateVariable], list[Evaluation], list[Message]]:
    items = scenario_competencies(db, session.scenario_id)
    variables = sim_state.active(list(db.exec(select(StateVariable).where(StateVariable.scenario_id == session.scenario_id))))
    evaluations = list(db.exec(select(Evaluation).where(Evaluation.session_id == session.id)))
    messages = list(db.exec(select(Message).where(Message.session_id == session.id).order_by(Message.turn_index, Message.id)))
    return items, variables, evaluations, messages


def refresh_report(db: Session, session: TrainingSession) -> dict[str, Any]:
    """Recompute the numbers of a completed session (after a manager correction). Keeps the feedback text."""
    report = build_report(session, *_load(db, session))
    session.report = report
    db.add(session)
    db.commit()
    return report


def feedback_prompt(report: dict[str, Any], scenario: Scenario, persona_name: str) -> str:
    facts = {
        "scenario": scenario.title,
        "trainee_role": persona_name,
        "objectives": [{"name": o["name"], "reached": o["reached"]} for o in report["objectives"]],
        "competencies": [
            {
                "name": c["name"],
                "score_percent": c["percent"],
                "level": c["level_description"],
                "status": c["status"],
                "behaviours_shown": [i["text"] for i in c["indicators"] if i["count"] and i["polarity"] == "positive"],
                "behaviours_to_avoid_shown": [i["text"] for i in c["indicators"] if i["count"] and i["polarity"] == "negative"],
                "behaviours_not_shown": [i["text"] for i in c["indicators"] if not i["count"] and i["polarity"] == "positive"],
                "quotes": [s["text"] for e in c["evidence"] for s in e["spans"]],
            }
            for c in report["competencies"]
        ],
    }
    return "Results of the simulation (JSON):\n" + json.dumps(facts, ensure_ascii=False, indent=1) + "\n\nWrite the feedback."


async def complete_session(db: Session, session: TrainingSession, openrouter: OpenRouterClient, model: str) -> dict[str, Any]:
    """End the session, build the report and ask the summary model for the feedback text."""
    items, variables, evaluations, messages = _load(db, session)
    report = build_report(session, items, variables, evaluations, messages)
    scenario = db.get(Scenario, session.scenario_id)
    persona = db.get(Persona, session.persona_id) if session.persona_id else None
    trainee_turns = sum(1 for m in messages if m.role == "user" and not m.blocked)
    if openrouter.configured and scenario is not None and trainee_turns:
        try:
            text = await openrouter.complete(
                model,
                [
                    {"role": "system", "content": FEEDBACK_SYSTEM},
                    {"role": "user", "content": feedback_prompt(report, scenario, persona.name if persona else "trainee")},
                ],
                temperature=0.3,
                max_tokens=600,
            )
            report["feedback"] = text.strip()
        except OpenRouterError as exc:
            report["feedback_error"] = str(exc)
    session.status = "completed"
    session.completed_at = datetime.now(timezone.utc)
    session.report = report
    db.add(session)
    db.commit()
    return report


def results_table(db: Session, scenario_id: int | None = None) -> dict[str, Any]:
    """Average of the completed session reports, per trainee profile and competency."""
    query = select(TrainingSession).where(TrainingSession.status == "completed")
    if scenario_id is not None:
        query = query.where(TrainingSession.scenario_id == scenario_id)
    sessions = list(db.exec(query.order_by(TrainingSession.completed_at)))
    profiles = {p.id: p for p in db.exec(select(Profile))}
    rows: dict[int | None, dict[str, Any]] = {}
    seen_competencies: dict[int, str] = {}
    for s in sessions:
        row = rows.setdefault(s.profile_id, {"profile_id": s.profile_id, "name": profiles[s.profile_id].name if s.profile_id in profiles else None,
                                             "sessions": 0, "_scores": {}, "_overall": [], "last_completed_at": None})
        row["sessions"] += 1
        row["last_completed_at"] = s.completed_at
        report = s.report or {}
        if report.get("overall_percent") is not None:
            row["_overall"].append(report["overall_percent"])
        for c in report.get("competencies", []):
            seen_competencies[c["competency_id"]] = c["name"]
            if c.get("percent") is not None:
                row["_scores"].setdefault(c["competency_id"], []).append(c["percent"])
    names = {c.id: c.name for c in db.exec(select(Competency))}
    out_rows = []
    for row in rows.values():
        scores = row.pop("_scores")
        overall = row.pop("_overall")
        row["competencies"] = {str(cid): round(sum(v) / len(v)) for cid, v in scores.items()}
        row["overall_percent"] = round(sum(overall) / len(overall)) if overall else None
        out_rows.append(row)
    return {
        "competencies": [{"id": cid, "name": names.get(cid, name)} for cid, name in seen_competencies.items()],
        "rows": sorted(out_rows, key=lambda r: (r["name"] or "")),
    }
