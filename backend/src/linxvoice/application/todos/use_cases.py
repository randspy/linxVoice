from typing import NoReturn
from uuid import UUID

from linxvoice.application.todos.commands import CreateTodoCommand, UpdateTodoCommand
from linxvoice.application.todos.errors import (
    EmptyTodoPatch,
    InvalidTodoVersion,
    StaleTodoVersion,
    TodoNotFound,
)
from linxvoice.application.todos.ports import TodoRepository, TodoUnitOfWorkFactory
from linxvoice.application.todos.results import TodoDeleteResult, TodoMutationResult
from linxvoice.domain.todos import TodoTitle


class TodoService:
    def __init__(self, unit_of_work_factory: TodoUnitOfWorkFactory) -> None:
        self._unit_of_work_factory = unit_of_work_factory

    def create(self, command: CreateTodoCommand) -> TodoMutationResult:
        title = TodoTitle(command.title)
        with self._unit_of_work_factory() as unit_of_work:
            todo = unit_of_work.todos.create(command.id, title)
            transaction_id = unit_of_work.transaction_id()
        return TodoMutationResult(todo=todo, transaction_id=transaction_id)

    def update(self, command: UpdateTodoCommand) -> TodoMutationResult:
        self._validate_update(command)
        title = TodoTitle(command.title) if command.title is not None else None
        with self._unit_of_work_factory() as unit_of_work:
            todo = unit_of_work.todos.update(
                command.id,
                command.expected_version,
                title=title,
                completed=command.completed,
            )
            if todo is None:
                self._raise_stale_or_missing(unit_of_work.todos, command.id)
            transaction_id = unit_of_work.transaction_id()
        return TodoMutationResult(todo=todo, transaction_id=transaction_id)

    def delete(self, todo_id: UUID, expected_version: int) -> TodoDeleteResult:
        self._validate_version(expected_version)
        with self._unit_of_work_factory() as unit_of_work:
            if not unit_of_work.todos.delete(todo_id, expected_version):
                self._raise_stale_or_missing(unit_of_work.todos, todo_id)
            transaction_id = unit_of_work.transaction_id()
        return TodoDeleteResult(id=todo_id, transaction_id=transaction_id)

    @staticmethod
    def _validate_update(command: UpdateTodoCommand) -> None:
        TodoService._validate_version(command.expected_version)
        if command.title is None and command.completed is None:
            raise EmptyTodoPatch("At least one Todo field must be changed")

    @staticmethod
    def _validate_version(version: int) -> None:
        if version < 1:
            raise InvalidTodoVersion("Expected Todo version must be positive")

    @staticmethod
    def _raise_stale_or_missing(repository: TodoRepository, todo_id: UUID) -> NoReturn:
        if repository.exists(todo_id):
            raise StaleTodoVersion("The Todo changed since it was last synchronized")
        raise TodoNotFound("The requested Todo does not exist")
