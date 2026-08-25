from dataclasses import dataclass
from typing import Any

from apiflask import APIFlask
from apiflask.types import ResponsesObjectType
from flask import Response, jsonify, request
from werkzeug.exceptions import HTTPException

from linxvoice.adapters.http.schemas import ProblemDetail
from linxvoice.application.todos.errors import (
    EmptyTodoPatch,
    InvalidTodoVersion,
    StaleTodoVersion,
    TodoAlreadyExists,
    TodoApplicationError,
    TodoNotFound,
)
from linxvoice.domain.todos import InvalidTodoTitle


@dataclass(slots=True)
class Problem(Exception):
    status: int
    title: str
    detail: str
    type: str = "about:blank"
    errors: dict[str, list[str]] | None = None


type ProblemResponse = tuple[Response, int, dict[str, str]]


def problem_documentation(description: str) -> dict[str, str | dict[str, dict[str, Any]]]:
    return {
        "description": description,
        "content": {"application/problem+json": {"schema": ProblemDetail.model_json_schema()}},
    }


def problem_responses(items: dict[int, str]) -> ResponsesObjectType:
    return {status: problem_documentation(description) for status, description in items.items()}


def problem_response(problem: Problem) -> ProblemResponse:
    payload: dict[str, Any] = {
        "type": problem.type,
        "title": problem.title,
        "status": problem.status,
        "detail": problem.detail,
        "instance": request.path,
    }
    if problem.errors:
        payload["errors"] = problem.errors
    response = jsonify(payload)
    return response, problem.status, {"Content-Type": "application/problem+json"}


def _handle_problem(error: Problem) -> ProblemResponse:
    return problem_response(error)


def _todo_problem(error: TodoApplicationError) -> Problem:
    if isinstance(error, TodoAlreadyExists):
        return Problem(409, "Todo already exists", "A Todo with this id already exists.")
    if isinstance(error, TodoNotFound):
        return Problem(404, "Todo not found", "The requested Todo does not exist.")
    if isinstance(error, StaleTodoVersion):
        return Problem(
            412,
            "Precondition failed",
            "The Todo changed since it was last synchronized.",
        )
    if isinstance(error, EmptyTodoPatch):
        return Problem(422, "Validation failed", str(error))
    if isinstance(error, InvalidTodoVersion):
        return Problem(400, "Invalid Todo version", str(error))
    return Problem(500, "Internal Server Error", "The request failed.")


def _handle_todo_error(error: TodoApplicationError) -> ProblemResponse:
    return problem_response(_todo_problem(error))


def _handle_invalid_title(error: InvalidTodoTitle) -> ProblemResponse:
    return problem_response(Problem(422, "Validation failed", str(error)))


def _handle_http(error: HTTPException) -> ProblemResponse:
    return problem_response(
        Problem(error.code or 500, error.name, error.description or "Request failed.")
    )


def _validation_fields(detail: Any) -> tuple[dict[str, list[str]], bool]:
    fields: dict[str, list[str]] = {}
    missing_precondition = False
    if not isinstance(detail, dict):
        return fields, missing_precondition

    for location, location_errors in detail.items():
        if not isinstance(location_errors, dict):
            continue
        for raw_field, messages in location_errors.items():
            field = str(raw_field)
            fields[field] = [str(message) for message in messages]
            if location == "headers" and field == "If-Match":
                missing_precondition = True
    return fields, missing_precondition


def _handle_api_error(error: Any) -> ProblemResponse:
    fields, missing_precondition = _validation_fields(error.detail)
    if missing_precondition:
        return problem_response(
            Problem(
                428,
                "Precondition required",
                "Supply the Todo version using If-Match.",
                errors=fields,
            )
        )

    message = str(error.message)
    title = "Validation failed" if fields else message
    detail = "The request contains invalid fields." if fields else message
    return problem_response(
        Problem(
            status=error.status_code,
            title=title,
            detail=detail,
            errors=fields or None,
        )
    )


def register_error_handlers(app: APIFlask) -> None:
    app.register_error_handler(Problem, _handle_problem)
    app.register_error_handler(TodoApplicationError, _handle_todo_error)
    app.register_error_handler(InvalidTodoTitle, _handle_invalid_title)
    app.register_error_handler(HTTPException, _handle_http)
    app.error_processor(_handle_api_error)
