from dataclasses import dataclass
from datetime import datetime
from uuid import UUID


class InvalidTodoTitle(ValueError):
    """Raised when a Todo title violates a domain invariant."""


@dataclass(frozen=True, slots=True)
class TodoTitle:
    value: str

    def __post_init__(self) -> None:
        normalized = self.value.strip()
        if not normalized:
            raise InvalidTodoTitle("Title must not be blank")
        if len(normalized) > 200:
            raise InvalidTodoTitle("Title must contain at most 200 characters")
        object.__setattr__(self, "value", normalized)


@dataclass(frozen=True, slots=True)
class Todo:
    id: UUID
    title: TodoTitle
    completed: bool
    created_at: datetime
    updated_at: datetime
    version: int

    def __post_init__(self) -> None:
        if self.version < 1:
            raise ValueError("Todo version must be positive")
