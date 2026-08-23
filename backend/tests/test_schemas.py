from uuid import uuid4

import pytest
from pydantic import ValidationError

from linxvoice.todos.schemas import TodoCreate, TodoPatch


def test_create_trims_the_title() -> None:
    command = TodoCreate(id=uuid4(), title="  Trace the signal  ")

    assert command.title == "Trace the signal"


@pytest.mark.parametrize("title", ["", " ", "\n\t"])
def test_create_rejects_a_blank_title(title: str) -> None:
    with pytest.raises(ValidationError):
        TodoCreate(id=uuid4(), title=title)


def test_create_rejects_fields_owned_by_the_server() -> None:
    with pytest.raises(ValidationError):
        TodoCreate.model_validate({"id": str(uuid4()), "title": "Todo", "completed": True})


def test_patch_requires_at_least_one_change() -> None:
    with pytest.raises(ValidationError, match="At least one field"):
        TodoPatch()


def test_patch_preserves_internal_whitespace() -> None:
    command = TodoPatch(title="  keep   this  ")

    assert command.title == "keep   this"
