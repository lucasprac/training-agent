"""Competency evaluation of one trainee message.

One /decide/batch group asks, over the evaluation view:
- `competency.exercised` (tags): which scenario competencies this moment calls for;
- `competency.score:<id>` (scale): the rubric level for each competency;
- `competency.indicators:<id>` (tags): which observable behaviours the message shows;
- `competency.evidence:<id>` (tags): which sentences of the message the level rests on.
Evidence uses sentence tags, not /v1/extract: Extract finds passages that show a
competency, but it cannot quote a weak answer, and a weak answer needs evidence too.
The sentence offsets are exact. A `null` answer never becomes a low score: the row is
marked for review.
"""

import re
from dataclasses import dataclass
from typing import Any

from app.models import Competency, Evaluation, Message, ScenarioCompetency
from app.prompt.budget import estimate_tokens
from app.sage.labels import Answer
from app.sage.request import BuiltRequest, format_chat

EVALUATION_VIEW_TOKENS = 3000
REVIEW_CONFIDENCE = 0.3  # a scale confidence below this sends the row to the manager
MAX_SENTENCES = 24
TRAINEE_MARKER = "TRAINEE MESSAGE"

EXERCISED_INSTRUCTIONS = (
    "For each competency, decide whether this moment of the conversation calls for it, so that the "
    "TRAINEE MESSAGE from {user} can be judged on it. Tag it also when the message handles it badly or "
    "ignores it. A competency that this moment does not call for does not apply."
)
SCORE_INSTRUCTIONS = "Which rubric level of the competency '{name}' ({description}) does the TRAINEE MESSAGE from {user} show?"
INDICATOR_INSTRUCTIONS = "Tag each behaviour that the TRAINEE MESSAGE from {user} shows. A behaviour that is only implied does not apply."
EVIDENCE_INSTRUCTIONS = (
    "Tag each sentence of the TRAINEE MESSAGE that a coach would quote as evidence for how well or badly "
    "{user} shows {name} ({description})."
)

# A sentence ends at . ! ? … or a line break; an *action* in asterisks is its own sentence.
_SENTENCE = re.compile(r"[^.!?…\n*]+(?:[.!?…]+[\"'”’)\]]*)?")


@dataclass
class ScenarioCompetencyItem:
    link: ScenarioCompetency
    competency: Competency

    @property
    def id(self) -> int:
        return int(self.competency.id or 0)


def _one_line(text: str) -> str:
    return " ".join((text or "").split())


def evaluation_view(earlier: list[Message], message: Message, persona_name: str) -> str:
    message_text = message.content.strip()
    budget = max(EVALUATION_VIEW_TOKENS - estimate_tokens(message_text) - 50, 300)
    context = format_chat(earlier, persona_name, budget) if earlier else "(start of the conversation)"
    return f"<conversation>\n{context}\n</conversation>\n\n{TRAINEE_MARKER} ({persona_name}):\n{message_text}"


def sentence_spans(text: str) -> list[dict[str, Any]]:
    """Sentences of the message with exact offsets: [{"text", "start", "end"}]. A message with
    no sentence break is one sentence."""
    spans: list[dict[str, Any]] = []
    for match in _SENTENCE.finditer(text):
        raw = match.group(0)
        stripped = raw.strip(" \t*_")
        if not stripped or not re.search(r"\w", stripped):
            continue
        start = match.start() + raw.index(stripped)
        spans.append({"text": stripped, "start": start, "end": start + len(stripped)})
    return spans[:MAX_SENTENCES]


def build_evaluation(
    view: str, items: list[ScenarioCompetencyItem], persona_name: str, sentences: list[dict[str, Any]]
) -> BuiltRequest:
    if not items:
        return BuiltRequest(requests=[], qid_to_key={})
    questions: list[dict[str, Any]] = [
        {
            "id": "competency_exercised",
            "kind": "tags",
            "instructions": EXERCISED_INSTRUCTIONS.replace("{user}", persona_name),
            "tags": [{"id": f"k{i.id}", "name": f"{i.competency.name}: {_one_line(i.competency.description)}"} for i in items[:120]],
        }
    ]
    qid_to_key = {"competency_exercised": "competency.exercised"}
    for item in items:
        c = item.competency
        instructions = SCORE_INSTRUCTIONS.format(name=c.name, description=_one_line(c.description), user=persona_name)
        if item.link.focus.strip():
            instructions += f" In this scenario: {_one_line(item.link.focus)}"
        questions.append({
            "id": f"competency_score_{item.id}",
            "kind": "scale",
            "instructions": instructions,
            "levels": [{"level": lv["level"], "description": str(lv.get("description", ""))} for lv in c.levels],
        })
        qid_to_key[f"competency_score_{item.id}"] = f"competency.score:{item.id}"
        indicators = [i for i in c.indicators if str(i.get("text", "")).strip()][:120]
        if indicators:
            questions.append({
                "id": f"competency_indicators_{item.id}",
                "kind": "tags",
                "instructions": INDICATOR_INSTRUCTIONS.replace("{user}", persona_name),
                "tags": [{"id": str(i["id"]), "name": _one_line(i["text"])} for i in indicators],
            })
            qid_to_key[f"competency_indicators_{item.id}"] = f"competency.indicators:{item.id}"
        if sentences:
            questions.append({
                "id": f"competency_evidence_{item.id}",
                "kind": "tags",
                "instructions": EVIDENCE_INSTRUCTIONS.format(name=c.name, description=_one_line(c.description), user=persona_name),
                "tags": [{"id": f"s{n}", "name": s["text"]} for n, s in enumerate(sentences)],
            })
            qid_to_key[f"competency_evidence_{item.id}"] = f"competency.evidence:{item.id}"
    return BuiltRequest(requests=[{"content": view, "questions": questions}], qid_to_key=qid_to_key)


def evidence_for(answer: Answer | None, sentences: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """The tagged sentences, in message order, with their offsets and probability."""
    if answer is None or not isinstance(answer.value, dict):
        return []
    out: list[dict[str, Any]] = []
    for n, sentence in enumerate(sentences):
        tag = answer.value.get(f"s{n}")
        if tag and tag.get("applies") is True:
            out.append({**sentence, "probability": tag.get("probability")})
    return out


def to_evaluations(
    answers: dict[str, Answer],
    sentences: list[dict[str, Any]],
    items: list[ScenarioCompetencyItem],
    message: Message,
    error: str | None = None,
) -> list[Evaluation]:
    """One Evaluation per competency the message shows (or might show)."""
    exercised = answers.get("competency.exercised")
    tags: dict[str, dict] = (exercised.value or {}) if exercised and isinstance(exercised.value, dict) else {}
    rows: list[Evaluation] = []
    for item in items:
        tag = tags.get(f"k{item.id}")
        applies = tag.get("applies") if tag else None
        if applies is False:
            continue
        score = answers.get(f"competency.score:{item.id}")
        indicator_answer = answers.get(f"competency.indicators:{item.id}")
        indicators = [
            {"id": tag_id, "applies": t.get("applies"), "probability": t.get("probability")}
            for tag_id, t in ((indicator_answer.value or {}) if indicator_answer else {}).items()
        ]
        reason = ""
        if error:
            reason = f"Sage error: {error}"
        elif applies is None:
            reason = "Sage could not tell whether the message shows this competency."
        elif score is None or score.value is None:
            reason = "Sage gave no rubric level."
        elif (score.probability or 0) < REVIEW_CONFIDENCE:
            reason = "Sage is not sure of the rubric level."
        rows.append(
            Evaluation(
                session_id=message.session_id,
                turn_index=message.turn_index,
                message_id=message.id or 0,
                competency_id=item.id,
                exercised_probability=tag.get("probability") if tag else None,
                score=round(float(score.value), 3) if score and score.value is not None else None,
                confidence=score.probability if score else None,
                probabilities=(score.probabilities or []) if score else [],
                indicators=indicators,
                evidence=evidence_for(answers.get(f"competency.evidence:{item.id}"), sentences),
                needs_review=bool(reason),
                review_reason=reason,
            )
        )
    return rows
