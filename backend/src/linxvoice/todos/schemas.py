from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class TodoCreate(StrictModel):
    id: UUID
    title: str = Field(min_length=1, max_length=200)

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Title must not be blank")
        return value


class TodoPatch(StrictModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    completed: bool | None = None

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.strip()
        if not value:
            raise ValueError("Title must not be blank")
        return value

    @model_validator(mode="after")
    def require_change(self) -> "TodoPatch":
        if self.title is None and self.completed is None:
            raise ValueError("At least one field must be supplied")
        return self


class TodoRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    completed: bool
    created_at: datetime
    updated_at: datetime
    version: int


class TodoMutationResponse(BaseModel):
    todo: TodoRead
    txid: int


class TodoDeleteResponse(BaseModel):
    id: UUID
    txid: int


class HealthResponse(BaseModel):
    status: str


class IfMatchHeaders(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    if_match: str = Field(alias="If-Match")


class ETagHeaders(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    etag: str = Field(alias="ETag")


class ProblemDetail(BaseModel):
    type: str
    title: str
    status: int
    detail: str
    instance: str
    errors: dict[str, list[str]] | None = None
