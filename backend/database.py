from pathlib import Path
from typing import Generator

from sqlmodel import Session, SQLModel, create_engine

_DB_PATH = Path(__file__).parent.parent / "argus.db"
DATABASE_URL = f"sqlite:///{_DB_PATH}"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})


def init_db() -> None:
    SQLModel.metadata.create_all(engine)


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
