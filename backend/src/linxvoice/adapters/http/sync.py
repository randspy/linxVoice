from collections.abc import Iterator

import httpx
from apiflask import APIBlueprint
from apiflask.types import ResponsesObjectType
from flask import Response, request, stream_with_context

from linxvoice.adapters.http.problems import Problem, problem_responses

ALLOWED_QUERY_PARAMETERS = {
    "offset",
    "handle",
    "live",
    "live_sse",
    "experimental_live_sse",
    "cursor",
    "expired_handle",
    "log",
    "cache-buster",
}
FORWARDED_RESPONSE_HEADERS = {
    "cache-control",
    "content-encoding",
    "content-type",
    "electric-cursor",
    "electric-handle",
    "electric-offset",
    "electric-schema",
    "electric-up-to-date",
    "etag",
    "location",
    "vary",
}

SYNC_RESPONSES: ResponsesObjectType = problem_responses(
    {
        400: "Unsupported shape parameters were supplied.",
        503: "Electric could not be reached.",
    }
)
SYNC_RESPONSES[200] = {
    "description": "The fixed Todo shape stream from Electric.",
    "content": {
        "application/json": {"schema": {"type": "array", "items": {}}},
        "text/event-stream": {"schema": {"type": "string"}},
    },
}


def create_sync_blueprint(electric_url: str) -> APIBlueprint:
    sync = APIBlueprint("sync", __name__, url_prefix="/api/v1/sync", tag="Synchronization")

    @sync.get("/todos")
    @sync.doc(responses=SYNC_RESPONSES)
    def todo_shape() -> Response:
        unexpected = set(request.args) - ALLOWED_QUERY_PARAMETERS
        if unexpected:
            raise Problem(400, "Invalid synchronization request", "Unsupported shape parameters.")

        params: list[tuple[str, str | int | float | bool | None]] = [
            (str(key), str(value)) for key, value in request.args.items(multi=True)
        ]
        params.extend(
            [
                ("table", "todos"),
                ("columns", "id,title,completed,created_at,updated_at,version"),
            ]
        )
        client = httpx.Client(timeout=httpx.Timeout(15.0, read=45.0))
        try:
            upstream = client.build_request(
                "GET",
                f"{electric_url.rstrip('/')}/v1/shape",
                params=httpx.QueryParams(params),
                headers={"Accept": request.headers.get("Accept", "application/json")},
            )
            response = client.send(upstream, stream=True)
        except httpx.HTTPError as error:
            client.close()
            raise Problem(
                503,
                "Synchronization unavailable",
                "Electric could not be reached.",
            ) from error

        headers = {
            key: value
            for key, value in response.headers.items()
            if key.lower() in FORWARDED_RESPONSE_HEADERS
        }

        @stream_with_context
        def body() -> Iterator[bytes]:
            try:
                yield from response.iter_bytes()
            finally:
                response.close()
                client.close()

        return Response(body(), status=response.status_code, headers=headers)

    return sync
