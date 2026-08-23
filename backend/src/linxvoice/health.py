from apiflask import APIBlueprint
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from linxvoice.database import get_engine
from linxvoice.todos.schemas import HealthResponse

health = APIBlueprint("health", __name__, tag="Health")


@health.get("/healthz")
@health.output(HealthResponse)
def liveness() -> HealthResponse:
    return HealthResponse(status="ok")


@health.get("/readyz")
@health.output(HealthResponse)
def readiness() -> tuple[HealthResponse, int] | HealthResponse:
    try:
        with get_engine().connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError:
        return HealthResponse(status="unavailable"), 503
    return HealthResponse(status="ready")
