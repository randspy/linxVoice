from dataclasses import dataclass
from typing import NoReturn
from uuid import UUID

from sqlalchemy import delete, select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from linxvoice.problems import Problem
from linxvoice.todos.model import Todo
from linxvoice.todos.schemas import TodoCreate, TodoPatch


@dataclass(frozen=True, slots=True)
class MutationResult:
    todo: Todo
    txid: int


def create_todo(session: Session, command: TodoCreate) -> MutationResult:
    todo = Todo(id=command.id, title=command.title, completed=False, version=1)
    session.add(todo)
    try:
        session.flush()
    except IntegrityError as error:
        raise Problem(409, "Todo already exists", "A Todo with this id already exists.") from error
    txid = current_txid(session)
    session.refresh(todo)
    return MutationResult(todo, txid)


def update_todo(
    session: Session, todo_id: UUID, expected_version: int, command: TodoPatch
) -> MutationResult:
    changes = command.model_dump(exclude_none=True)
    statement = (
        update(Todo)
        .where(Todo.id == todo_id, Todo.version == expected_version)
        .values(**changes, version=Todo.version + 1, updated_at=text("CURRENT_TIMESTAMP"))
        .returning(Todo)
    )
    todo = session.execute(statement).scalar_one_or_none()
    if todo is None:
        raise_stale_or_missing(session, todo_id)
    txid = current_txid(session)
    return MutationResult(todo, txid)


def delete_todo(session: Session, todo_id: UUID, expected_version: int) -> int:
    statement = (
        delete(Todo).where(Todo.id == todo_id, Todo.version == expected_version).returning(Todo.id)
    )
    deleted_id = session.execute(statement).scalar_one_or_none()
    if deleted_id is None:
        raise_stale_or_missing(session, todo_id)
    return current_txid(session)


def current_txid(session: Session) -> int:
    value = session.execute(text("SELECT pg_current_xact_id()::xid::text")).scalar_one()
    return int(value)


def raise_stale_or_missing(session: Session, todo_id: UUID) -> NoReturn:
    exists = session.scalar(select(Todo.id).where(Todo.id == todo_id)) is not None
    if exists:
        raise Problem(
            412,
            "Precondition failed",
            "The Todo changed since it was last synchronized.",
        )
    raise Problem(404, "Todo not found", "The requested Todo does not exist.")
