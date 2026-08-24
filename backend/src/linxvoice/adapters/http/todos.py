from uuid import UUID

from apiflask import APIBlueprint

from linxvoice.adapters.http.etag import etag, parse_if_match
from linxvoice.adapters.http.problems import problem_responses
from linxvoice.adapters.http.schemas import (
    ETagHeaders,
    IfMatchHeaders,
    TodoCreate,
    TodoDeleteResponse,
    TodoMutationResponse,
    TodoPatch,
    TodoRead,
)
from linxvoice.application.todos.commands import CreateTodoCommand, UpdateTodoCommand
from linxvoice.application.todos.use_cases import TodoService


def create_todos_blueprint(service: TodoService) -> APIBlueprint:
    todos = APIBlueprint("todos", __name__, url_prefix="/api/v1/todos", tag="Todos")

    @todos.post("")
    @todos.doc(responses=problem_responses({409: "The Todo identifier already exists."}))
    @todos.input(TodoCreate)
    @todos.output(TodoMutationResponse, status_code=201, headers=ETagHeaders)
    def create(json_data: TodoCreate) -> tuple[TodoMutationResponse, int, dict[str, str]]:
        result = service.create(CreateTodoCommand(id=json_data.id, title=json_data.title))
        payload = TodoMutationResponse(
            todo=TodoRead.from_domain(result.todo), txid=result.transaction_id
        )
        return payload, 201, {"ETag": etag(result.todo.version)}

    @todos.patch("/<uuid:todo_id>")
    @todos.doc(
        responses=problem_responses(
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
        result = service.update(
            UpdateTodoCommand(
                id=todo_id,
                expected_version=parse_if_match(header_data.if_match),
                title=json_data.title,
                completed=json_data.completed,
            )
        )
        payload = TodoMutationResponse(
            todo=TodoRead.from_domain(result.todo), txid=result.transaction_id
        )
        return payload, 200, {"ETag": etag(result.todo.version)}

    @todos.delete("/<uuid:todo_id>")
    @todos.doc(
        responses=problem_responses(
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
        result = service.delete(todo_id, parse_if_match(header_data.if_match))
        return TodoDeleteResponse(id=result.id, txid=result.transaction_id)

    return todos
