from apiflask import APIBlueprint
from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError

from linxvoice.adapters.http.schemas import HealthResponse


def create_health_blueprint(engine: Engine) -> APIBlueprint:
    health = APIBlueprint("health", __name__, tag="Health")

    @health.get("/healthz")
    @health.output(HealthResponse)
    def liveness() -> HealthResponse:
        return HealthResponse(status="ok")

    @health.get("/readyz")
    @health.output(HealthResponse)
    def readiness() -> tuple[HealthResponse, int] | HealthResponse:
        try:
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))
        except SQLAlchemyError:
            return HealthResponse(status="unavailable"), 503
        return HealthResponse(status="ready")

    return health
