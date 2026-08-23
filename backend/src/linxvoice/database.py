from collections.abc import Iterator
from contextlib import contextmanager
from typing import cast

from flask import Flask, g
from sqlalchemy import MetaData, create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


def init_database(app: Flask, database_url: str) -> None:
    engine = create_engine(database_url, pool_pre_ping=True)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    app.extensions["linxvoice_engine"] = engine
    app.extensions["linxvoice_session_factory"] = factory

    @app.teardown_appcontext
    def close_session(_error: BaseException | None = None) -> None:
        session = g.pop("db_session", None)
        if session is not None:
            session.close()


def get_engine() -> Engine:
    from flask import current_app

    return cast(Engine, current_app.extensions["linxvoice_engine"])


def get_session() -> Session:
    if "db_session" not in g:
        factory = _get_factory()
        g.db_session = factory()
    return cast(Session, g.db_session)


def _get_factory() -> sessionmaker[Session]:
    from flask import current_app

    return cast(sessionmaker[Session], current_app.extensions["linxvoice_session_factory"])


@contextmanager
def transaction() -> Iterator[Session]:
    session = get_session()
    try:
        with session.begin():
            yield session
    except Exception:
        session.rollback()
        raise
