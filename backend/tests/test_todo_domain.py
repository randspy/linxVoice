from datetime import UTC, datetime
from uuid import uuid4

import pytest

from linxvoice.domain.todos import InvalidTodoTitle, Todo, TodoTitle


def test_todo_title_trims_boundary_whitespace() -> None:
    assert TodoTitle("  keep   this  ").value == "keep   this"


def test_todo_title_accepts_the_maximum_length() -> None:
    assert TodoTitle("x" * 200).value == "x" * 200


@pytest.mark.parametrize("title", ["", " ", "\n\t", "x" * 201])
def test_todo_title_rejects_invalid_values(title: str) -> None:
    with pytest.raises(InvalidTodoTitle):
        TodoTitle(title)


def test_todo_accepts_the_initial_version() -> None:
    assert todo_with_version(1).version == 1


@pytest.mark.parametrize("version", [0, -1])
def test_todo_rejects_non_positive_versions(version: int) -> None:
    with pytest.raises(ValueError, match="Todo version must be positive"):
        todo_with_version(version)


def todo_with_version(version: int) -> Todo:
    now = datetime(2026, 8, 25, 12, 0, tzinfo=UTC)
    return Todo(
        id=uuid4(),
        title=TodoTitle("Todo"),
        completed=False,
        created_at=now,
        updated_at=now,
        version=version,
    )
