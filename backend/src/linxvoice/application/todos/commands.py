from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True, slots=True)
class CreateTodoCommand:
    id: UUID
    title: str


@dataclass(frozen=True, slots=True)
class UpdateTodoCommand:
    id: UUID
    expected_version: int
    title: str | None = None
    completed: bool | None = None
