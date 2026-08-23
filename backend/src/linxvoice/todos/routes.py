from typing import Any
from uuid import UUID

from apiflask import APIBlueprint
from apiflask.types import ResponsesObjectType

from linxvoice.database import transaction
from linxvoice.http import etag, parse_if_match
from linxvoice.todos.schemas import (
    ETagHeaders,
    IfMatchHeaders,
    ProblemDetail,
    TodoCreate,
    TodoDeleteResponse,
    TodoMutationResponse,
    TodoPatch,
    TodoRead,
)
from linxvoice.todos.service import create_todo, delete_todo, update_todo

todos = APIBlueprint("todos", __name__, url_prefix="/api/v1/todos", tag="Todos")


def problem(description: str) -> dict[str, str | dict[str, dict[str, Any]]]:
    return {
        "description": description,
        "content": {"application/problem+json": {"schema": ProblemDetail.model_json_schema()}},
    }


def problems(items: dict[int, str]) -> ResponsesObjectType:
    return {status: problem(description) for status, description in items.items()}


@todos.post("")
@todos.doc(responses=problems({409: "The Todo identifier already exists."}))
@todos.input(TodoCreate)
@todos.output(TodoMutationResponse, status_code=201, headers=ETagHeaders)
def create(json_data: TodoCreate) -> tuple[TodoMutationResponse, int, dict[str, str]]:
    with transaction() as session:
        result = create_todo(session, json_data)
        payload = TodoMutationResponse(todo=TodoRead.model_validate(result.todo), txid=result.txid)
    return payload, 201, {"ETag": etag(result.todo.version)}


@todos.patch("/<uuid:todo_id>")
@todos.doc(
    responses=problems(
        {
            400: "The If-Match value is malformed.",
            404: "The Todo does not exist.",
            412: "The Todo was changed by another client.",
            428: "An If-Match precondition is required.",
        }
    )
)
@todos.input(TodoPatch)
@todos.input(IfMatchHeaders, location="headers", arg_name="header_data")
@todos.output(TodoMutationResponse, headers=ETagHeaders)
def patch(
    todo_id: UUID, json_data: TodoPatch, header_data: IfMatchHeaders
) -> tuple[TodoMutationResponse, int, dict[str, str]]:
    expected_version = parse_if_match(header_data.if_match)
    with transaction() as session:
        result = update_todo(session, todo_id, expected_version, json_data)
        payload = TodoMutationResponse(todo=TodoRead.model_validate(result.todo), txid=result.txid)
    return payload, 200, {"ETag": etag(result.todo.version)}


@todos.delete("/<uuid:todo_id>")
@todos.doc(
    responses=problems(
        {
            400: "The If-Match value is malformed.",
            404: "The Todo does not exist.",
            412: "The Todo was changed by another client.",
            428: "An If-Match precondition is required.",
        }
    )
)
@todos.input(IfMatchHeaders, location="headers", arg_name="header_data")
@todos.output(TodoDeleteResponse)
def remove(todo_id: UUID, header_data: IfMatchHeaders) -> TodoDeleteResponse:
    expected_version = parse_if_match(header_data.if_match)
    with transaction() as session:
        txid = delete_todo(session, todo_id, expected_version)
    return TodoDeleteResponse(id=todo_id, txid=txid)
