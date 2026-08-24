from uuid import UUID

from linxvoice.adapters.persistence.database import create_database
from linxvoice.adapters.persistence.unit_of_work import SqlAlchemyUnitOfWork
from linxvoice.application.todos.commands import CreateTodoCommand
from linxvoice.application.todos.errors import TodoAlreadyExists
from linxvoice.application.todos.use_cases import TodoService
from linxvoice.bootstrap.config import get_settings

SEED_TODOS = (
    (UUID("0198d8b6-6535-7a68-a6ec-45bfbe0d4191"), "Trace the first signal"),
    (UUID("0198d8b6-6535-7a68-a6ec-45bfbe0d4192"), "Open a second browser window"),
    (UUID("0198d8b6-6535-7a68-a6ec-45bfbe0d4193"), "Watch both lists converge"),
)


def main() -> None:
    engine, session_factory = create_database(get_settings().database_url)
    service = TodoService(lambda: SqlAlchemyUnitOfWork(session_factory))
    created = 0
    try:
        for todo_id, title in SEED_TODOS:
            try:
                service.create(CreateTodoCommand(id=todo_id, title=title))
            except TodoAlreadyExists:
                continue
            created += 1
    finally:
        engine.dispose()
    print(f"Seed complete: {created} Todo(s) created")


if __name__ == "__main__":
    main()
