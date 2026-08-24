import pytest

from linxvoice.domain.todos import InvalidTodoTitle, TodoTitle


def test_todo_title_trims_boundary_whitespace() -> None:
    assert TodoTitle("  keep   this  ").value == "keep   this"


@pytest.mark.parametrize("title", ["", " ", "\n\t", "x" * 201])
def test_todo_title_rejects_invalid_values(title: str) -> None:
    with pytest.raises(InvalidTodoTitle):
        TodoTitle(title)
