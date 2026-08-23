from uuid import UUID

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from linxvoice.config import get_settings
from linxvoice.todos.model import Todo

SEED_TODOS = (
    (UUID("0198d8b6-6535-7a68-a6ec-45bfbe0d4191"), "Trace the first signal"),
    (UUID("0198d8b6-6535-7a68-a6ec-45bfbe0d4192"), "Open a second browser window"),
    (UUID("0198d8b6-6535-7a68-a6ec-45bfbe0d4193"), "Watch both lists converge"),
)


def main() -> None:
    engine = create_engine(get_settings().database_url, pool_pre_ping=True)
    created = 0
    with Session(engine) as session, session.begin():
        existing = set(
            session.scalars(select(Todo.id).where(Todo.id.in_(id_ for id_, _ in SEED_TODOS)))
        )
        for todo_id, title in SEED_TODOS:
            if todo_id not in existing:
                session.add(Todo(id=todo_id, title=title))
                created += 1
    print(f"Seed complete: {created} Todo(s) created")


if __name__ == "__main__":
    main()
