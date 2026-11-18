"""Profiles, competency library, scenario competencies, state variables, assignments, seeds."""

from sqlalchemy.pool import StaticPool
from sqlmodel import Session, create_engine, select

from app import db as app_db
from app.models import Assignment, Profile, Scenario, ScenarioCompetency, StateVariable


def test_library_is_seeded_and_validated(client):
    library = client.get("/api/competencies").json()
    assert [c["name"] for c in library][:2] == ["Escuta ativa", "Empatia"]
    assert all(len(c["levels"]) == 5 and len(c["indicators"]) == 4 for c in library)

    created = client.post("/api/competencies", json={"name": "Feedback"}).json()
    assert [lv["level"] for lv in created["levels"]] == [0, 1, 2, 3, 4]  # default rubric

    one_level = client.post("/api/competencies", json={"name": "X", "levels": [{"level": 1, "description": "a"}]})
    assert one_level.status_code == 400
    twice = client.patch(f"/api/competencies/{created['id']}", json={"levels": [{"level": 1}, {"level": 1}]})
    assert twice.status_code == 400 and "used twice" in twice.json()["detail"]
    not_int = client.patch(f"/api/competencies/{created['id']}", json={"levels": [{"level": 1.5}, {"level": 2}]})
    assert not_int.status_code == 400
    dup_ids = client.patch(f"/api/competencies/{created['id']}", json={"indicators": [{"id": "i1", "text": "a"}, {"id": "i1", "text": "b"}]})
    assert dup_ids.status_code == 400
    assert client.patch(f"/api/competencies/{created['id']}", json={"indicators": [{"id": "i1", "text": "a", "polarity": "negative"}]}).status_code == 200


def test_state_variable_rules(client, world):
    sid = world["scenario_id"]
    ok = client.post("/api/state-variables", json={"scenario_id": sid, "name": "Trust", "kind": "scale"})
    assert ok.status_code == 200  # a draft with no levels yet is allowed
    assert client.post("/api/state-variables", json={"scenario_id": sid, "kind": "choice", "is_objective": True}).status_code == 400
    assert client.post("/api/state-variables", json={"scenario_id": sid, "kind": "mood"}).status_code == 400
    dup = {"scenario_id": sid, "kind": "choice", "options": [{"option": "A"}, {"option": "a"}]}
    assert client.post("/api/state-variables", json=dup).status_code == 400
    one = client.patch(f"/api/state-variables/{ok.json()['id']}", json={"options": [{"level": 0}]})
    assert one.status_code == 400
    assert [v["name"] for v in client.get(f"/api/state-variables?scenario_id={sid}").json()] == ["Trust"]


def test_scenario_competency_is_unique(client, world):
    sid = world["scenario_id"]
    competency_id = client.get("/api/competencies").json()[0]["id"]
    first = client.post("/api/scenario-competencies", json={"scenario_id": sid, "competency_id": competency_id})
    assert first.status_code == 200
    assert client.post("/api/scenario-competencies", json={"scenario_id": sid, "competency_id": competency_id}).status_code == 400
    assert client.patch(f"/api/scenario-competencies/{first.json()['id']}", json={"weight": 0}).status_code == 400
    assert client.patch(f"/api/scenario-competencies/{first.json()['id']}", json={"weight": 2}).status_code == 200

    client.delete(f"/api/competencies/{competency_id}")
    assert client.get(f"/api/scenario-competencies?scenario_id={sid}").json() == []


def test_profiles_assignments_and_session_filters(client, world):
    assert client.post("/api/profiles", json={"name": "X", "role": "admin"}).status_code == 400
    ana = client.post("/api/profiles", json={"name": "Ana", "role": "user"}).json()
    bob = client.post("/api/profiles", json={"name": "Bob", "role": "user"}).json()
    sid = world["scenario_id"]
    client.post("/api/assignments", json={"scenario_id": sid, "profile_id": ana["id"], "due_date": "2026-12-01"})
    assignments = client.get(f"/api/assignments?profile_id={ana['id']}").json()
    assert len(assignments) == 1 and assignments[0]["due_date"] == "2026-12-01"
    assert client.get(f"/api/assignments?profile_id={bob['id']}").json() == []

    body = {"scenario_id": sid, "persona_id": world["persona_id"]}
    assert client.post("/api/sessions", json={**body, "profile_id": 999}).status_code == 404
    session = client.post("/api/sessions", json={**body, "profile_id": ana["id"]}).json()
    assert session["status"] == "active" and session["profile_id"] == ana["id"]
    assert [s["id"] for s in client.get(f"/api/sessions?profile_id={ana['id']}").json()] == [session["id"]]
    assert client.get(f"/api/sessions?profile_id={bob['id']}").json() == []
    assert client.get("/api/sessions?status=completed").json() == []

    client.delete(f"/api/profiles/{ana['id']}")
    assert client.get(f"/api/assignments?profile_id={ana['id']}").json() == []


def test_deleting_scenario_deletes_training_children(client, world, engine):
    sid = world["scenario_id"]
    competency_id = client.get("/api/competencies").json()[0]["id"]
    profile = client.post("/api/profiles", json={"name": "Ana"}).json()
    client.post("/api/scenario-competencies", json={"scenario_id": sid, "competency_id": competency_id})
    client.post("/api/state-variables", json={"scenario_id": sid, "name": "Trust", "kind": "yesno"})
    client.post("/api/assignments", json={"scenario_id": sid, "profile_id": profile["id"]})
    client.delete(f"/api/scenarios/{sid}")
    with Session(engine) as db:
        for model in (ScenarioCompetency, StateVariable, Assignment):
            assert db.exec(select(model)).all() == []


def test_sample_data_seed():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    app_db.init_db(engine, sample_data=True)
    app_db.init_db(engine, sample_data=True)  # a restart adds nothing
    with Session(engine) as db:
        assert sorted(p.role for p in db.exec(select(Profile))) == ["manager", "user"]
        scenario = db.exec(select(Scenario)).one()
        variables = db.exec(select(StateVariable).where(StateVariable.scenario_id == scenario.id)).all()
        assert sum(v.is_objective for v in variables) == 3
        assert len(db.exec(select(ScenarioCompetency)).all()) == 4
        assert len(db.exec(select(Assignment)).all()) == 1
