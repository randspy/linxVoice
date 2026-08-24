from types import TracebackType
from typing import Protocol, Self
from uuid import UUID

from linxvoice.domain.todos import Todo, TodoTitle


class TodoRepository(Protocol):
    def create(self, todo_id: UUID, title: TodoTitle) -> Todo:
        """Persist a new Todo or raise TodoAlreadyExists."""
        ...

    def update(
        self,
        todo_id: UUID,
        expected_version: int,
        *,
        title: TodoTitle | None,
        completed: bool | None,
    ) -> Todo | None: ...

    def delete(self, todo_id: UUID, expected_version: int) -> bool: ...

    def exists(self, todo_id: UUID) -> bool: ...


class TodoUnitOfWork(Protocol):
    @property
    def todos(self) -> TodoRepository: ...

    def transaction_id(self) -> int: ...

    def __enter__(self) -> Self: ...

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc_value: BaseException | None,
        traceback: TracebackType | None,
    ) -> bool | None: ...


class TodoUnitOfWorkFactory(Protocol):
    def __call__(self) -> TodoUnitOfWork: ...
