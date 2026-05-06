from pathlib import Path
from typing import Generator

from sqlmodel import Session, SQLModel, create_engine

_DB_PATH = Path(__file__).parent.parent / "argus.db"
DATABASE_URL = f"sqlite:///{_DB_PATH}"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})


_MIGRATIONS = [
    "ALTER TABLE event ADD COLUMN hook_event_name TEXT",
    "ALTER TABLE event ADD COLUMN agent_type TEXT",
    "ALTER TABLE event ADD COLUMN skill_name TEXT",
    "ALTER TABLE event ADD COLUMN command TEXT",
    "ALTER TABLE session ADD COLUMN trust_score REAL",
    "ALTER TABLE session ADD COLUMN safety_score REAL",
    "ALTER TABLE session ADD COLUMN behavior_score REAL",
    "ALTER TABLE session ADD COLUMN economy_score REAL",
]


def init_db() -> None:
    """Create all SQLModel tables and apply any pending column migrations.

    Safe to call on an existing database — migrations use ALTER TABLE which
    SQLite silently ignores if the column already exists.
    """
    SQLModel.metadata.create_all(engine)
    # Add new columns to existing DBs; SQLite ignores errors for duplicate columns.
    with engine.connect() as conn:
        for stmt in _MIGRATIONS:
            try:
                conn.execute(__import__("sqlalchemy").text(stmt))
                conn.commit()
            except Exception:
                pass


def get_session() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a SQLModel Session and closes it on exit."""
    with Session(engine) as session:
        yield session
