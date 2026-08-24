from datetime import UTC, datetime
from types import TracebackType
from uuid import UUID, uuid4

import pytest

from linxvoice.application.todos.commands import CreateTodoCommand, UpdateTodoCommand
from linxvoice.application.todos.errors import (
    EmptyTodoPatch,
    InvalidTodoVersion,
    StaleTodoVersion,
    TodoAlreadyExists,
    TodoNotFound,
)
from linxvoice.application.todos.use_cases import TodoService
from linxvoice.domain.todos import Todo, TodoTitle


class FakeTodoRepository:
    def __init__(self) -> None:
        self.items: dict[UUID, Todo] = {}

    def create(self, todo_id: UUID, title: TodoTitle) -> Todo:
        if todo_id in self.items:
            raise TodoAlreadyExists
        todo = todo_factory(todo_id=todo_id, title=title)
        self.items[todo_id] = todo
        return todo

    def update(
        self,
        todo_id: UUID,
        expected_version: int,
        *,
        title: TodoTitle | None,
        completed: bool | None,
    ) -> Todo | None:
        current = self.items.get(todo_id)
        if current is None or current.version != expected_version:
            return None
        changed = Todo(
            id=current.id,
            title=title or current.title,
            completed=completed if completed is not None else current.completed,
            created_at=current.created_at,
            updated_at=current.updated_at,
            version=current.version + 1,
        )
        self.items[todo_id] = changed
        return changed

    def delete(self, todo_id: UUID, expected_version: int) -> bool:
        current = self.items.get(todo_id)
        if current is None or current.version != expected_version:
            return False
        del self.items[todo_id]
        return True

    def exists(self, todo_id: UUID) -> bool:
        return todo_id in self.items


class FakeUnitOfWork:
    def __init__(self, repository: FakeTodoRepository, transaction_id: int = 73) -> None:
        self.todos = repository
        self._transaction_id = transaction_id
        self.entered = False
        self.exited = False

    def transaction_id(self) -> int:
        return self._transaction_id

    def __enter__(self) -> "FakeUnitOfWork":
        self.entered = True
        return self

    def __exit__(
        self,
        _exc_type: type[BaseException] | None,
        _exc_value: BaseException | None,
        _traceback: TracebackType | None,
    ) -> None:
        self.exited = True


def test_create_normalizes_domain_title_and_uses_the_transaction_boundary() -> None:
    repository = FakeTodoRepository()
    unit_of_work = FakeUnitOfWork(repository)
    service = TodoService(lambda: unit_of_work)
    todo_id = uuid4()

    result = service.create(CreateTodoCommand(id=todo_id, title="  Create me  "))

    assert result.todo.title == TodoTitle("Create me")
    assert result.transaction_id == 73
    assert unit_of_work.entered is True
    assert unit_of_work.exited is True


def test_create_rejects_a_duplicate_identifier() -> None:
    repository = FakeTodoRepository()
    todo_id = uuid4()
    repository.items[todo_id] = todo_factory(todo_id=todo_id)
    service = TodoService(lambda: FakeUnitOfWork(repository))

    with pytest.raises(TodoAlreadyExists):
        service.create(CreateTodoCommand(id=todo_id, title="Duplicate"))


def test_update_returns_the_incremented_domain_entity() -> None:
    repository = FakeTodoRepository()
    todo_id = uuid4()
    repository.items[todo_id] = todo_factory(todo_id=todo_id, version=3)
    service = TodoService(lambda: FakeUnitOfWork(repository, transaction_id=74))

    result = service.update(UpdateTodoCommand(id=todo_id, expected_version=3, completed=True))

    assert result.todo.completed is True
    assert result.todo.version == 4
    assert result.transaction_id == 74


def test_update_distinguishes_a_stale_todo() -> None:
    repository = FakeTodoRepository()
    todo_id = uuid4()
    repository.items[todo_id] = todo_factory(todo_id=todo_id, version=2)
    service = TodoService(lambda: FakeUnitOfWork(repository))

    with pytest.raises(StaleTodoVersion):
        service.update(UpdateTodoCommand(id=todo_id, expected_version=1, completed=True))


def test_update_distinguishes_a_missing_todo() -> None:
    service = TodoService(lambda: FakeUnitOfWork(FakeTodoRepository()))

    with pytest.raises(TodoNotFound):
        service.update(UpdateTodoCommand(id=uuid4(), expected_version=1, completed=True))


def test_update_rejects_an_empty_change_outside_http() -> None:
    service = TodoService(lambda: FakeUnitOfWork(FakeTodoRepository()))

    with pytest.raises(EmptyTodoPatch):
        service.update(UpdateTodoCommand(id=uuid4(), expected_version=1))


def test_delete_rejects_a_non_positive_version_outside_http() -> None:
    service = TodoService(lambda: FakeUnitOfWork(FakeTodoRepository()))

    with pytest.raises(InvalidTodoVersion):
        service.delete(uuid4(), 0)


def test_delete_returns_the_transaction_id() -> None:
    repository = FakeTodoRepository()
    todo_id = uuid4()
    repository.items[todo_id] = todo_factory(todo_id=todo_id, version=2)
    service = TodoService(lambda: FakeUnitOfWork(repository, transaction_id=75))

    result = service.delete(todo_id, 2)

    assert result.id == todo_id
    assert result.transaction_id == 75
    assert todo_id not in repository.items


def todo_factory(
    *,
    todo_id: UUID,
    title: TodoTitle | None = None,
    version: int = 1,
) -> Todo:
    now = datetime(2026, 8, 23, 12, 0, tzinfo=UTC)
    return Todo(
        id=todo_id,
        title=title or TodoTitle("Todo"),
        completed=False,
        version=version,
        created_at=now,
        updated_at=now,
    )
