"""Scenario themes, scenario-scoped personas and the migration of old global personas."""

from sqlalchemy.pool import StaticPool
from sqlmodel import Session, create_engine, select

from app import db as app_db
from app.models import Persona, RoleplaySession, Scenario
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


def test_global_personas_are_copied_into_each_scenario():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    app_db.init_db(engine)
    with Session(engine) as db:
        a, b = Scenario(title="A"), Scenario(title="B")
        db.add_all([a, b])
        db.commit()
        old = Persona(name="Ash", description="A courier.")  # pre-migration row: no scenario
        db.add(old)
        db.commit()
        db.add(RoleplaySession(scenario_id=b.id, persona_id=old.id))
        db.commit()
        a_id, b_id = a.id, b.id

    app_db.init_db(engine)  # a restart runs the migration

    with Session(engine) as db:
        personas = db.exec(select(Persona)).all()
        assert sorted((p.scenario_id, p.name) for p in personas) == [(a_id, "Ash"), (b_id, "Ash")]
        session = db.exec(select(RoleplaySession)).one()
        b_copy = next(p for p in personas if p.scenario_id == b_id)
        assert session.persona_id == b_copy.id
