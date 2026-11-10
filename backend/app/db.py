from collections.abc import Iterator
from pathlib import Path

from sqlalchemy import Engine, event
from sqlmodel import Session, SQLModel, create_engine

from app.config import get_settings

_engine: Engine | None = None


def make_engine(url: str) -> Engine:
    if url.startswith("sqlite:///") and ":memory:" not in url:
        Path(url.removeprefix("sqlite:///")).parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(url, connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def _pragmas(dbapi_conn, _record):  # noqa: ANN001
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

    return engine


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        _engine = make_engine(get_settings().database_url)
    return _engine


def set_engine(engine: Engine) -> None:
    """Replace the engine (tests)."""
    global _engine
    _engine = engine


def init_db(engine: Engine | None = None) -> None:
    from app import models  # noqa: F401  (register tables)
    from app.seed import seed_defaults

    engine = engine or get_engine()
    SQLModel.metadata.create_all(engine)
    _add_missing_columns(engine)
    with Session(engine) as db:
        _scope_global_personas(db)
        seed_defaults(db)


# create_all() never alters an existing table, so columns added after the first release are added here.
_ADDED_COLUMNS: dict[str, dict[str, str]] = {
    "scenario": {"themes": "JSON NOT NULL DEFAULT '[]'"},
    "persona": {"scenario_id": "INTEGER"},
}


def _add_missing_columns(engine: Engine) -> None:
    with engine.begin() as conn:
        for table, columns in _ADDED_COLUMNS.items():
            existing = {row[1] for row in conn.exec_driver_sql(f"PRAGMA table_info({table})")}
            for name, ddl in columns.items():
                if name not in existing:
                    conn.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}")


def _scope_global_personas(db: Session) -> None:
    """Personas belong to one scenario. Copy each old global persona into every scenario,
    point existing sessions at their scenario's copy, then remove the global rows."""
    from sqlmodel import select

    from app.models import Persona, RoleplaySession, Scenario

    globals_ = list(db.exec(select(Persona).where(Persona.scenario_id == None)))  # noqa: E711
    scenarios = list(db.exec(select(Scenario)))
    if not globals_ or not scenarios:
        return
    for scenario in scenarios:
        copies: dict[int, int] = {}
        for persona in globals_:
            copy = Persona(scenario_id=scenario.id, name=persona.name, description=persona.description)
            db.add(copy)
            db.flush()
            copies[persona.id] = copy.id
        for session in db.exec(select(RoleplaySession).where(RoleplaySession.scenario_id == scenario.id)):
            if session.persona_id in copies:
                session.persona_id = copies[session.persona_id]
                db.add(session)
    for persona in globals_:
        db.delete(persona)
    db.commit()


def get_db() -> Iterator[Session]:
    with Session(get_engine()) as db:
        yield db
