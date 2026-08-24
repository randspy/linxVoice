from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[4]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_prefix="LINXVOICE_",
        extra="ignore",
    )

    database_url: str = "postgresql+psycopg://linxvoice:linxvoice@localhost:54321/linxvoice"
    electric_url: str = "http://localhost:3000"
    log_format: Literal["console", "json"] = "console"
    request_body_limit: int = Field(default=16 * 1024, ge=1024)
    testing: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
