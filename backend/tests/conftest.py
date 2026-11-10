import json
import random

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, create_engine

from app import db as app_db
from app.clients.openrouter import OpenRouterClient
from app.clients.sage import SageClient
from app.config import Settings
from app.harness.orchestrator import Harness
from app.models import Character, LoreEntry, Persona, Scenario

SAGE = "https://sage.test"
OPENROUTER = "https://openrouter.test/api/v1"


@pytest.fixture
def engine():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    app_db.set_engine(engine)
    app_db.init_db(engine)
    yield engine
    app_db.set_engine(None)


@pytest.fixture
def settings():
    return Settings(
        openrouter_api_key="sk-or-test",
        openrouter_base_url=OPENROUTER,
        sage_api_key="lv_live_test",
        sage_base_url=SAGE,
        default_model="test/narrator",
        summary_model="test/summary",
        _env_file=None,
    )


def make_harness(engine, settings, sage_key="lv_live_test"):
    return Harness(
        engine=engine,
        sage=SageClient(SAGE, sage_key, 5),
        openrouter=OpenRouterClient("sk-or-test", OPENROUTER),
        settings=settings,
        rng=random.Random(1),
    )


@pytest.fixture
def harness(engine, settings):
    return make_harness(engine, settings)


@pytest.fixture
def client(engine, harness):
    from app.main import create_app

    with TestClient(create_app(harness)) as test_client:
        yield test_client


@pytest.fixture
def world(engine):
    """A scenario with two characters, a persona and lore entries."""
    with Session(engine) as db:
        scenario = Scenario(
            title="Neon Harbor",
            world="A rain-soaked port city run by smuggler guilds.",
            scenario_rules="No modern firearms exist.",
            opening_message="Rain hammers the docks as {{user}} steps off the ferry.",
        )
        db.add(scenario)
        db.commit()
        db.refresh(scenario)
        mira = Character(scenario_id=scenario.id, name="Mira", description="A sharp-eyed smuggler. She trusts no one.", personality="wry, guarded", example_dialogues="Mira: Keep your voice down.")
        kade = Character(scenario_id=scenario.id, name="Kade", description="A dock guard with debts. He talks too much.", personality="nervous")
        persona = Persona(scenario_id=scenario.id, name="Ash", description="A courier with a sealed package.")
        db.add_all([mira, kade, persona])
        db.commit()
        for c in (mira, kade, persona):
            db.refresh(c)
        lore = [
            LoreEntry(scenario_id=scenario.id, title="Neon Harbor", kind="location", content="The harbor glows with neon signs.", keys=["harbor", "docks"], order=100),
            LoreEntry(scenario_id=scenario.id, title="Guild Law", content="Guilds settle disputes with duels.", constant=True, position="before_char", order=50),
            LoreEntry(scenario_id=scenario.id, title="The Lantern", kind="location", content="A tavern where deals are made.", keys=["lantern", "tavern"], order=90),
            LoreEntry(scenario_id=scenario.id, title="Mira's Secret", content="Mira owes the Red Guild a fortune.", keys=["red guild"], known_by=[mira.id], order=80),
            LoreEntry(scenario_id=scenario.id, title="Tide Bell", content="A bell rings at high tide.", keys=["bell"], position="at_depth", depth=0, order=10),
        ]
        db.add_all(lore)
        db.commit()
        return {"scenario_id": scenario.id, "mira": mira.id, "kade": kade.id, "persona_id": persona.id}


def sse_events(text: str) -> list[tuple[str, dict]]:
    events = []
    for block in text.strip().split("\n\n"):
        name, data = None, None
        for line in block.splitlines():
            if line.startswith("event: "):
                name = line[7:]
            elif line.startswith("data: "):
                data = json.loads(line[6:])
        if name:
            events.append((name, data))
    return events


def openrouter_stream(*tokens: str, usage: dict | None = None) -> str:
    lines = [": OPENROUTER PROCESSING", ""]
    for token in tokens:
        lines.append("data: " + json.dumps({"choices": [{"index": 0, "delta": {"content": token}}]}))
        lines.append("")
    lines.append("data: " + json.dumps({"choices": [{"index": 0, "delta": {"content": ""}, "finish_reason": "stop"}], "usage": usage or {"prompt_tokens": 10, "completion_tokens": 5}}))
    lines.append("")
    lines.append("data: [DONE]")
    lines.append("")
    return "\n".join(lines)
