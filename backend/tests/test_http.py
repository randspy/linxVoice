import pytest
from apiflask import APIFlask
from werkzeug.exceptions import NotFound

from linxvoice.adapters.http.etag import etag, parse_if_match
from linxvoice.adapters.http.problems import Problem, register_error_handlers
from linxvoice.application.todos.errors import (
    EmptyTodoPatch,
    InvalidTodoVersion,
    StaleTodoVersion,
    TodoAlreadyExists,
    TodoApplicationError,
    TodoNotFound,
)
from linxvoice.domain.todos import InvalidTodoTitle


def test_if_match_parses_a_quoted_positive_version() -> None:
    assert parse_if_match('"12"') == 12
    assert etag(12) == '"12"'


def test_missing_if_match_requires_a_precondition() -> None:
    with pytest.raises(Problem) as raised:
        parse_if_match(None)

    assert raised.value.status == 428


@pytest.mark.parametrize("value", ["3", 'W/"3"', '"0"', '"-1"', '"abc"'])
def test_invalid_if_match_is_rejected(value: str) -> None:
    with pytest.raises(Problem) as raised:
        parse_if_match(value)

    assert raised.value.status == 400


@pytest.mark.parametrize(
    ("error", "status", "title", "detail"),
    [
        (
            TodoAlreadyExists(),
            409,
            "Todo already exists",
            "A Todo with this id already exists.",
        ),
        (TodoNotFound(), 404, "Todo not found", "The requested Todo does not exist."),
        (
            StaleTodoVersion(),
            412,
            "Precondition failed",
            "The Todo changed since it was last synchronized.",
        ),
        (EmptyTodoPatch("No changes"), 422, "Validation failed", "No changes"),
        (InvalidTodoVersion("Bad version"), 400, "Invalid Todo version", "Bad version"),
        (
            TodoApplicationError("Unexpected"),
            500,
            "Internal Server Error",
            "The request failed.",
        ),
        (InvalidTodoTitle("Bad title"), 422, "Validation failed", "Bad title"),
        (Problem(418, "Teapot", "Short and stout"), 418, "Teapot", "Short and stout"),
        (NotFound(), 404, "Not Found", "Not Found"),
    ],
)
def test_registered_errors_are_translated_to_problem_details(
    error: Exception, status: int, title: str, detail: str
) -> None:
    app = APIFlask(__name__)
    register_error_handlers(app)

    @app.get("/failure")
    def failure() -> None:
        raise error

    response = app.test_client().get("/failure")

    assert response.status_code == status
    assert response.content_type == "application/problem+json"
    assert response.json == {
        "detail": detail,
        "instance": "/failure",
        "status": status,
        "title": title,
        "type": "about:blank",
    }
