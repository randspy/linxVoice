from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from docker.errors import DockerException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from testcontainers.community.postgres import PostgresContainer

from linxvoice.problems import Problem
from linxvoice.todos.schemas import TodoCreate, TodoPatch
from linxvoice.todos.service import create_todo, delete_todo, update_todo


@pytest.mark.integration
def test_postgres_enforces_versioned_command_lifecycle() -> None:
    try:
        with PostgresContainer("postgres:17.6-alpine", driver="psycopg") as postgres:
            database_url = postgres.get_connection_url()
            migrate(database_url)
            engine = create_engine(database_url)
            session_factory = sessionmaker(engine, expire_on_commit=False)
            todo_id = uuid4()

            with session_factory() as session, session.begin():
                created = create_todo(session, TodoCreate(id=todo_id, title="Tracer Todo"))
            assert created.todo.version == 1
            assert created.txid > 0

            with session_factory() as session, session.begin():
                changed = update_todo(session, todo_id, 1, TodoPatch(completed=True))
            assert changed.todo.completed is True
            assert changed.todo.version == 2

            with (
                session_factory() as session,
                session.begin(),
                pytest.raises(Problem) as stale,
            ):
                update_todo(session, todo_id, 1, TodoPatch(title="Stale"))
            assert stale.value.status == 412

            with session_factory() as session, session.begin():
                txid = delete_todo(session, todo_id, 2)
            assert txid > 0
    except DockerException as error:
        pytest.skip(f"Docker is unavailable: {error}")


def migrate(database_url: str) -> None:
    backend_root = Path(__file__).resolve().parents[1]
    config = Config(backend_root / "alembic.ini")
    config.set_main_option("script_location", str(backend_root / "migrations"))
    config.attributes["database_url"] = database_url
    command.upgrade(config, "head")
