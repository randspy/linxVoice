from dataclasses import dataclass
from uuid import UUID

from linxvoice.domain.todos import Todo


@dataclass(frozen=True, slots=True)
class TodoMutationResult:
    todo: Todo
    transaction_id: int


@dataclass(frozen=True, slots=True)
class TodoDeleteResult:
    id: UUID
    transaction_id: int
