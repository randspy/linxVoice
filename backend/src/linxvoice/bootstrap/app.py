from collections.abc import Callable

from apiflask import APIFlask
from flask import Response

from linxvoice.adapters.http.health import create_health_blueprint
from linxvoice.adapters.http.logging import configure_logging
from linxvoice.adapters.http.problems import register_error_handlers
from linxvoice.adapters.http.schemas import ProblemDetail
from linxvoice.adapters.http.sync import create_sync_blueprint
from linxvoice.adapters.http.todos import create_todos_blueprint
from linxvoice.adapters.persistence.database import create_database
from linxvoice.adapters.persistence.unit_of_work import SqlAlchemyUnitOfWork
from linxvoice.application.todos.ports import TodoUnitOfWork
from linxvoice.application.todos.use_cases import TodoService
from linxvoice.bootstrap.config import Settings, get_settings


def create_app(
    settings: Settings | None = None,
    *,
    unit_of_work_factory: Callable[[], TodoUnitOfWork] | None = None,
) -> APIFlask:
    settings = settings or get_settings()
    engine, session_factory = create_database(settings.database_url)
    if unit_of_work_factory is None:

        def default_unit_of_work_factory() -> TodoUnitOfWork:
            return SqlAlchemyUnitOfWork(session_factory)

        unit_of_work_factory = default_unit_of_work_factory
    todo_service = TodoService(unit_of_work_factory)

    app = APIFlask(
        __name__,
        title="linxVoice API",
        version="1.0.0",
        docs_path="/docs",
        spec_path="/openapi.json",
    )
    app.config.update(
        TESTING=settings.testing,
        MAX_CONTENT_LENGTH=settings.request_body_limit,
        JSON_SORT_KEYS=False,
        HTTP_ERROR_SCHEMA=ProblemDetail.model_json_schema(),
        VALIDATION_ERROR_SCHEMA=ProblemDetail.model_json_schema(),
    )
    app.extensions["linxvoice_engine"] = engine
    configure_logging(app, settings.log_format)
    register_error_handlers(app)
    app.register_blueprint(create_health_blueprint(engine))
    app.register_blueprint(create_todos_blueprint(todo_service))
    app.register_blueprint(create_sync_blueprint(settings.electric_url))

    @app.after_request
    def security_headers(response: Response) -> Response:
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        return response

    return app
