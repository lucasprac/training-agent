"""Loading a scenario's competencies (the link row plus the library entry)."""

from sqlmodel import Session, select

from app.models import Competency, ScenarioCompetency
from app.sage.evaluation import ScenarioCompetencyItem


def scenario_competencies(db: Session, scenario_id: int | None) -> list[ScenarioCompetencyItem]:
    """Enabled competencies of the scenario, in the scenario's order."""
    links = list(
        db.exec(
            select(ScenarioCompetency)
            .where(ScenarioCompetency.scenario_id == scenario_id)
            .order_by(ScenarioCompetency.order, ScenarioCompetency.id)
        )
    )
    ids = [link.competency_id for link in links]
    library = {c.id: c for c in db.exec(select(Competency).where(Competency.id.in_(ids)))} if ids else {}  # type: ignore[union-attr]
    return [
        ScenarioCompetencyItem(link=link, competency=library[link.competency_id])
        for link in links
        if link.competency_id in library and library[link.competency_id].enabled
    ]
