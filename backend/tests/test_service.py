from datetime import UTC, datetime
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from linxvoice.problems import Problem
from linxvoice.todos.model import Todo
from linxvoice.todos.schemas import TodoCreate, TodoPatch
from linxvoice.todos.service import create_todo, delete_todo, update_todo


def test_create_uses_the_transaction_id_from_the_write_session() -> None:
    session = session_with_results(txid="73", include_mutation_result=False)
    command = TodoCreate(id=uuid4(), title="Create me")

    result = create_todo(session, command)

    session.add.assert_called_once()
    session.flush.assert_called_once()
    assert result.todo.id == command.id
    assert result.txid == 73


def test_update_returns_the_incremented_canonical_row() -> None:
    todo = todo_factory(version=4, completed=True)
    session = session_with_results(todo=todo, txid="74")

    result = update_todo(session, todo.id, 3, TodoPatch(completed=True))

    assert result.todo.version == 4
    assert result.txid == 74


def test_update_distinguishes_a_stale_todo() -> None:
    session = session_with_results(todo=None)
    session.scalar.return_value = uuid4()

    with pytest.raises(Problem) as raised:
        update_todo(session, uuid4(), 1, TodoPatch(completed=True))

    assert raised.value.status == 412


def test_update_distinguishes_a_missing_todo() -> None:
    session = session_with_results(todo=None)
    session.scalar.return_value = None

    with pytest.raises(Problem) as raised:
        update_todo(session, uuid4(), 1, TodoPatch(completed=True))

    assert raised.value.status == 404


def test_delete_returns_the_write_transaction_id() -> None:
    todo_id = uuid4()
    session = session_with_results(todo=todo_id, txid="75")

    assert delete_todo(session, todo_id, 2) == 75


def session_with_results(*, todo=None, txid: str = "1", include_mutation_result: bool = True):  # type: ignore[no-untyped-def]
    session = MagicMock()
    todo_result = MagicMock()
    todo_result.scalar_one_or_none.return_value = todo
    txid_result = MagicMock()
    txid_result.scalar_one.return_value = txid
    session.execute.side_effect = (
        [todo_result, txid_result] if include_mutation_result else [txid_result]
    )
    return session


def todo_factory(*, version: int, completed: bool) -> Todo:
    now = datetime(2026, 8, 23, 12, 0, tzinfo=UTC)
    return Todo(
        id=uuid4(),
        title="Todo",
        completed=completed,
        version=version,
        created_at=now,
        updated_at=now,
    )
