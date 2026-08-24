from types import TracebackType

from sqlalchemy import text
from sqlalchemy.orm import Session, sessionmaker

from linxvoice.adapters.persistence.todos import SqlAlchemyTodoRepository


class SqlAlchemyUnitOfWork:
    def __init__(self, session_factory: sessionmaker[Session]) -> None:
        self._session_factory = session_factory
        self._session: Session | None = None
        self._todos: SqlAlchemyTodoRepository | None = None

    @property
    def todos(self) -> SqlAlchemyTodoRepository:
        if self._todos is None:
            raise RuntimeError("Unit of Work has not been entered")
        return self._todos

    def transaction_id(self) -> int:
        if self._session is None:
            raise RuntimeError("Unit of Work has not been entered")
        value = self._session.execute(text("SELECT pg_current_xact_id()::xid::text")).scalar_one()
        return int(value)

    def __enter__(self) -> "SqlAlchemyUnitOfWork":
        self._session = self._session_factory()
        self._session.begin()
        self._todos = SqlAlchemyTodoRepository(self._session)
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        _exc_value: BaseException | None,
        _traceback: TracebackType | None,
    ) -> None:
        if self._session is None:
            return
        try:
            if exc_type is None:
                self._session.commit()
            else:
                self._session.rollback()
        finally:
            self._session.close()
            self._session = None
            self._todos = None
