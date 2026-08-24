from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from docker.errors import DockerException
from testcontainers.community.postgres import PostgresContainer

from linxvoice.adapters.persistence.database import create_database
from linxvoice.adapters.persistence.unit_of_work import SqlAlchemyUnitOfWork
from linxvoice.application.todos.commands import CreateTodoCommand, UpdateTodoCommand
from linxvoice.application.todos.errors import StaleTodoVersion
from linxvoice.application.todos.use_cases import TodoService


@pytest.mark.integration
def test_postgres_enforces_versioned_command_lifecycle() -> None:
    try:
        with PostgresContainer("postgres:17.6-alpine", driver="psycopg") as postgres:
            database_url = postgres.get_connection_url()
            migrate(database_url)
            engine, session_factory = create_database(database_url)
            service = TodoService(lambda: SqlAlchemyUnitOfWork(session_factory))
            todo_id = uuid4()

            created = service.create(CreateTodoCommand(id=todo_id, title="Tracer Todo"))
            assert created.todo.version == 1
            assert created.transaction_id > 0

            changed = service.update(
                UpdateTodoCommand(id=todo_id, expected_version=1, completed=True)
            )
            assert changed.todo.completed is True
            assert changed.todo.version == 2

            with pytest.raises(StaleTodoVersion):
                service.update(UpdateTodoCommand(id=todo_id, expected_version=1, title="Stale"))

            deleted = service.delete(todo_id, 2)
            assert deleted.transaction_id > 0
            engine.dispose()
    except DockerException as error:
        pytest.skip(f"Docker is unavailable: {error}")


def migrate(database_url: str) -> None:
    backend_root = Path(__file__).resolve().parents[1]
    config = Config(backend_root / "alembic.ini")
    config.set_main_option("script_location", str(backend_root / "migrations"))
    config.attributes["database_url"] = database_url
    command.upgrade(config, "head")
