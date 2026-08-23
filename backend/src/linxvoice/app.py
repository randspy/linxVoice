from apiflask import APIFlask
from flask import Response

from linxvoice.config import Settings, get_settings
from linxvoice.database import init_database
from linxvoice.health import health
from linxvoice.logging import configure_logging
from linxvoice.problems import register_error_handlers
from linxvoice.sync import sync
from linxvoice.todos.routes import todos
from linxvoice.todos.schemas import ProblemDetail


def create_app(settings: Settings | None = None) -> APIFlask:
    settings = settings or get_settings()
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
        ELECTRIC_URL=settings.electric_url,
        JSON_SORT_KEYS=False,
        HTTP_ERROR_SCHEMA=ProblemDetail.model_json_schema(),
        VALIDATION_ERROR_SCHEMA=ProblemDetail.model_json_schema(),
    )
    init_database(app, settings.database_url)
    configure_logging(app, settings.log_format)
    register_error_handlers(app)
    app.register_blueprint(health)
    app.register_blueprint(todos)
    app.register_blueprint(sync)

    @app.after_request
    def security_headers(response: Response) -> Response:
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        return response

    return app


app = create_app()
