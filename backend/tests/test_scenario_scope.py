"""Scenario themes and scenario-scoped personas."""

from sqlmodel import Session, select

from app.models import Persona
from app.prompt.assembler import assemble

from tests.test_assembler import base_input


def test_themes_render_inside_scenario_block():
    inp = base_input()
    inp.scenario.themes = ["noir", " ", "political intrigue"]
    system = assemble(inp).messages[0]["content"]
    scenario_block = system[system.index("<scenario ") : system.index("</scenario>")]
    assert "<themes>\nnoir, political intrigue\n</themes>" in scenario_block


def test_no_themes_tag_when_empty():
    system = assemble(base_input()).messages[0]["content"]
    scenario_block = system[system.index("<scenario ") : system.index("</scenario>")]
    assert "<themes>" not in scenario_block


def test_personas_are_listed_per_scenario(client, world):
    other = client.post("/api/scenarios", json={"title": "Other"}).json()
    client.post("/api/personas", json={"scenario_id": other["id"], "name": "Bo"})
    names = [p["name"] for p in client.get(f"/api/personas?scenario_id={world['scenario_id']}").json()]
    assert names == ["Ash"]


def test_session_rejects_persona_from_another_scenario(client, world):
    other = client.post("/api/scenarios", json={"title": "Other"}).json()
    response = client.post("/api/sessions", json={"scenario_id": other["id"], "persona_id": world["persona_id"]})
    assert response.status_code == 400


def test_deleting_scenario_deletes_its_personas(client, world, engine):
    client.delete(f"/api/scenarios/{world['scenario_id']}")
    with Session(engine) as db:
        assert db.exec(select(Persona)).all() == []

