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


def init_db(engine: Engine | None = None, sample_data: bool | None = None) -> None:
    """Create tables and seed defaults. `sample_data` defaults to the SAMPLE_DATA setting."""
    from app import models  # noqa: F401  (register tables)
    from app.seed import seed_defaults
    from app.seed_library import seed_library
    from app.seed_sample import seed_sample

    engine = engine or get_engine()
    SQLModel.metadata.create_all(engine)
    _add_missing_columns(engine)
    with Session(engine) as db:
        seed_defaults(db)
        seed_library(db)
        if get_settings().sample_data if sample_data is None else sample_data:
            seed_sample(db)


# create_all() never alters an existing table, so columns added after the first release are added here:
# {"table": {"column": "SQLite DDL"}}.
_ADDED_COLUMNS: dict[str, dict[str, str]] = {}


def _add_missing_columns(engine: Engine) -> None:
    with engine.begin() as conn:
        for table, columns in _ADDED_COLUMNS.items():
            existing = {row[1] for row in conn.exec_driver_sql(f"PRAGMA table_info({table})")}
            for name, ddl in columns.items():
                if name not in existing:
                    conn.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}")


def get_db() -> Iterator[Session]:
    with Session(get_engine()) as db:
        yield db
