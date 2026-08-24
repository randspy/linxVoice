from dataclasses import dataclass
from typing import Any

from apiflask.types import ResponsesObjectType
from flask import Flask, Response, jsonify, request
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


def problem_documentation(description: str) -> dict[str, str | dict[str, dict[str, Any]]]:
    return {
        "description": description,
        "content": {"application/problem+json": {"schema": ProblemDetail.model_json_schema()}},
    }


def problem_responses(items: dict[int, str]) -> ResponsesObjectType:
    return {status: problem_documentation(description) for status, description in items.items()}


def problem_response(problem: Problem) -> tuple[Response, int, dict[str, str]]:
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


def register_error_handlers(app: Flask) -> None:
    @app.errorhandler(Problem)
    def handle_problem(error: Problem) -> tuple[Response, int, dict[str, str]]:
        return problem_response(error)

    @app.errorhandler(TodoApplicationError)
    def handle_todo_error(error: TodoApplicationError) -> tuple[Response, int, dict[str, str]]:
        if isinstance(error, TodoAlreadyExists):
            problem = Problem(409, "Todo already exists", "A Todo with this id already exists.")
        elif isinstance(error, TodoNotFound):
            problem = Problem(404, "Todo not found", "The requested Todo does not exist.")
        elif isinstance(error, StaleTodoVersion):
            problem = Problem(
                412,
                "Precondition failed",
                "The Todo changed since it was last synchronized.",
            )
        elif isinstance(error, EmptyTodoPatch):
            problem = Problem(422, "Validation failed", str(error))
        elif isinstance(error, InvalidTodoVersion):
            problem = Problem(400, "Invalid Todo version", str(error))
        else:
            problem = Problem(500, "Internal Server Error", "The request failed.")
        return problem_response(problem)

    @app.errorhandler(InvalidTodoTitle)
    def handle_invalid_title(error: InvalidTodoTitle) -> tuple[Response, int, dict[str, str]]:
        return problem_response(Problem(422, "Validation failed", str(error)))

    @app.errorhandler(HTTPException)
    def handle_http(error: HTTPException) -> tuple[Response, int, dict[str, str]]:
        return problem_response(
            Problem(error.code or 500, error.name, error.description or "Request failed.")
        )

    @app.error_processor  # type: ignore[untyped-decorator]
    def handle_api_error(error: Any) -> tuple[Response, int, dict[str, str]]:
        fields: dict[str, list[str]] = {}
        missing_precondition = False
        if isinstance(error.detail, dict):
            for location, location_errors in error.detail.items():
                if isinstance(location_errors, dict):
                    for field, messages in location_errors.items():
                        fields[field] = [str(message) for message in messages]
                        if location == "headers" and field == "If-Match":
                            missing_precondition = True
        if missing_precondition:
            return problem_response(
                Problem(
                    428,
                    "Precondition required",
                    "Supply the Todo version using If-Match.",
                    errors=fields,
                )
            )
        title = "Validation failed" if fields else str(error.message)
        detail = "The request contains invalid fields." if fields else str(error.message)
        return problem_response(
            Problem(
                status=error.status_code,
                title=title,
                detail=detail,
                errors=fields or None,
            )
        )
