from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Integer,
    String,
    delete,
    func,
    select,
    update,
)
from sqlalchemy import text as sql_text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Mapped, Session, mapped_column

from linxvoice.adapters.persistence.database import Base
from linxvoice.application.todos.errors import TodoAlreadyExists
from linxvoice.domain.todos import Todo, TodoTitle


class TodoRecord(Base):
    __tablename__ = "todos"
    __table_args__ = (
        CheckConstraint("char_length(btrim(title)) BETWEEN 1 AND 200", name="title_length"),
        CheckConstraint("version >= 1", name="positive_version"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    completed: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")


class SqlAlchemyTodoRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def create(self, todo_id: UUID, title: TodoTitle) -> Todo:
        record = TodoRecord(id=todo_id, title=title.value, completed=False, version=1)
        self._session.add(record)
        try:
            self._session.flush()
        except IntegrityError as error:
            raise TodoAlreadyExists from error
        self._session.refresh(record)
        return _to_domain(record)

    def update(
        self,
        todo_id: UUID,
        expected_version: int,
        *,
        title: TodoTitle | None,
        completed: bool | None,
    ) -> Todo | None:
        changes: dict[str, object] = {
            "version": TodoRecord.version + 1,
            "updated_at": sql_text("CURRENT_TIMESTAMP"),
        }
        if title is not None:
            changes["title"] = title.value
        if completed is not None:
            changes["completed"] = completed
        statement = (
            update(TodoRecord)
            .where(TodoRecord.id == todo_id, TodoRecord.version == expected_version)
            .values(**changes)
            .returning(TodoRecord)
        )
        record = self._session.execute(statement).scalar_one_or_none()
        return _to_domain(record) if record is not None else None

    def delete(self, todo_id: UUID, expected_version: int) -> bool:
        statement = (
            delete(TodoRecord)
            .where(TodoRecord.id == todo_id, TodoRecord.version == expected_version)
            .returning(TodoRecord.id)
        )
        return self._session.execute(statement).scalar_one_or_none() is not None

    def exists(self, todo_id: UUID) -> bool:
        statement = select(TodoRecord.id).where(TodoRecord.id == todo_id)
        return self._session.scalar(statement) is not None


def _to_domain(record: TodoRecord) -> Todo:
    return Todo(
        id=record.id,
        title=TodoTitle(record.title),
        completed=record.completed,
        created_at=record.created_at,
        updated_at=record.updated_at,
        version=record.version,
    )
