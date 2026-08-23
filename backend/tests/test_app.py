from datetime import UTC, datetime
from uuid import UUID, uuid4

import httpx
import pytest

from linxvoice.app import create_app
from linxvoice.config import Settings
from linxvoice.problems import Problem
from linxvoice.todos.model import Todo
from linxvoice.todos.service import MutationResult


@pytest.fixture
def app():  # type: ignore[no-untyped-def]
    application = create_app(
        Settings(
            database_url="sqlite+pysqlite:///:memory:",
            electric_url="http://electric.test",
            testing=True,
        )
    )
    yield application
    application.extensions["linxvoice_engine"].dispose()


@pytest.fixture
def client(app):  # type: ignore[no-untyped-def]
    return app.test_client()


def test_liveness_exposes_security_and_request_headers(client) -> None:  # type: ignore[no-untyped-def]
    response = client.get("/healthz", headers={"X-Request-ID": "request-123"})

    assert response.status_code == 200
    assert response.json == {"status": "ok"}
    assert response.headers["X-Request-ID"] == "request-123"
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"


def test_readiness_checks_the_database(client) -> None:  # type: ignore[no-untyped-def]
    response = client.get("/readyz")

    assert response.status_code == 200
    assert response.json == {"status": "ready"}


def test_invalid_create_uses_problem_details(client) -> None:  # type: ignore[no-untyped-def]
    response = client.post("/api/v1/todos", json={"id": str(uuid4()), "title": "  "})

    assert response.status_code == 422
    assert response.content_type == "application/problem+json"
    assert response.json["title"] == "Validation failed"
    assert "title" in response.json["errors"]


def test_create_returns_canonical_todo_and_txid(client, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    todo_id = uuid4()
    todo = todo_factory(todo_id=todo_id)

    def fake_create(_session, command):  # type: ignore[no-untyped-def]
        assert command.title == "Transmit this"
        return MutationResult(todo=todo, txid=42)

    monkeypatch.setattr("linxvoice.todos.routes.create_todo", fake_create)
    response = client.post("/api/v1/todos", json={"id": str(todo_id), "title": " Transmit this "})

    assert response.status_code == 201
    assert response.json["txid"] == 42
    assert response.json["todo"]["id"] == str(todo_id)
    assert response.headers["ETag"] == '"3"'


def test_patch_requires_if_match(client) -> None:  # type: ignore[no-untyped-def]
    response = client.patch(f"/api/v1/todos/{uuid4()}", json={"completed": True})

    assert response.status_code == 428
    assert "If-Match" in response.json["errors"]


def test_patch_reports_a_stale_write_as_problem_details(client, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    def stale(*_args, **_kwargs):  # type: ignore[no-untyped-def]
        raise Problem(412, "Precondition failed", "The Todo changed.")

    monkeypatch.setattr("linxvoice.todos.routes.update_todo", stale)
    response = client.patch(
        f"/api/v1/todos/{uuid4()}",
        json={"completed": True},
        headers={"If-Match": '"1"'},
    )

    assert response.status_code == 412
    assert response.content_type == "application/problem+json"
    assert response.json["detail"] == "The Todo changed."


def test_delete_returns_the_replication_transaction(client, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    todo_id = uuid4()
    monkeypatch.setattr("linxvoice.todos.routes.delete_todo", lambda *_args: 88)

    response = client.delete(f"/api/v1/todos/{todo_id}", headers={"If-Match": '"2"'})

    assert response.status_code == 200
    assert response.json == {"id": str(todo_id), "txid": 88}


def test_sync_proxy_rejects_shape_injection(client) -> None:  # type: ignore[no-untyped-def]
    response = client.get("/api/v1/sync/todos?table=secrets")

    assert response.status_code == 400
    assert response.json["title"] == "Invalid synchronization request"


def test_sync_proxy_injects_the_fixed_shape_and_forwards_protocol_metadata(
    client, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    captured: list[httpx.Request] = []

    def fake_send(_client, request, *, stream):  # type: ignore[no-untyped-def]
        assert stream is True
        captured.append(request)
        return httpx.Response(
            200,
            content=b"[]",
            headers={"electric-up-to-date": "true", "x-private": "discard"},
            request=request,
        )

    monkeypatch.setattr(httpx.Client, "send", fake_send)
    response = client.get(
        "/api/v1/sync/todos?offset=-1&live=true",
        headers={"Accept": "text/event-stream"},
    )

    assert response.status_code == 200
    assert response.data == b"[]"
    assert response.headers["electric-up-to-date"] == "true"
    assert "x-private" not in response.headers
    upstream = captured[0]
    assert upstream.headers["Accept"] == "text/event-stream"
    assert upstream.url.params["table"] == "todos"
    assert upstream.url.params["columns"] == ("id,title,completed,created_at,updated_at,version")


def test_sync_proxy_reports_an_unavailable_upstream(client, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    def fail(_client, request, *, stream):  # type: ignore[no-untyped-def]
        raise httpx.ConnectError("offline", request=request)

    monkeypatch.setattr(httpx.Client, "send", fail)
    response = client.get("/api/v1/sync/todos?offset=-1")

    assert response.status_code == 503
    assert response.json["title"] == "Synchronization unavailable"


def test_openapi_documents_the_typed_contract(client) -> None:  # type: ignore[no-untyped-def]
    response = client.get("/openapi.json")

    post = response.json["paths"]["/api/v1/todos"]["post"]
    assert post["requestBody"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/TodoCreate"
    }
    assert "ETag" in post["responses"]["201"]["headers"]
    patch = response.json["paths"]["/api/v1/todos/{todo_id}"]["patch"]
    assert patch["responses"]["412"]["content"]["application/problem+json"]
    assert patch["responses"]["428"]["content"]["application/problem+json"]


def todo_factory(todo_id: UUID) -> Todo:
    now = datetime(2026, 8, 23, 12, 0, tzinfo=UTC)
    return Todo(
        id=todo_id,
        title="Transmit this",
        completed=False,
        created_at=now,
        updated_at=now,
        version=3,
    )
