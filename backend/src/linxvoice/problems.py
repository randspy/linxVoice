from dataclasses import dataclass
from typing import Any

from flask import Response, jsonify, request
from sqlalchemy.exc import IntegrityError
from werkzeug.exceptions import HTTPException


@dataclass(slots=True)
class Problem(Exception):
    status: int
    title: str
    detail: str
    type: str = "about:blank"
    errors: dict[str, list[str]] | None = None


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


def register_error_handlers(app: Any) -> None:
    @app.errorhandler(Problem)  # type: ignore[untyped-decorator]
    def handle_problem(error: Problem) -> tuple[Response, int, dict[str, str]]:
        return problem_response(error)

    @app.errorhandler(IntegrityError)  # type: ignore[untyped-decorator]
    def handle_integrity(_error: IntegrityError) -> tuple[Response, int, dict[str, str]]:
        return problem_response(
            Problem(409, "Conflict", "The requested state conflicts with data.")
        )

    @app.errorhandler(HTTPException)  # type: ignore[untyped-decorator]
    def handle_http(error: HTTPException) -> tuple[Response, int, dict[str, str]]:
        return problem_response(
            Problem(error.code or 500, error.name, error.description or "Request failed.")
        )

    @app.error_processor  # type: ignore[untyped-decorator]
    def handle_api_error(error: Any) -> tuple[Response, int, dict[str, str]]:
        fields: dict[str, list[str]] = {}
        missing_precondition = False
        if isinstance(error.detail, dict):
            for _location, location_errors in error.detail.items():
                if isinstance(location_errors, dict):
                    for field, messages in location_errors.items():
                        fields[field] = [str(message) for message in messages]
                        if _location == "headers" and field == "If-Match":
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
