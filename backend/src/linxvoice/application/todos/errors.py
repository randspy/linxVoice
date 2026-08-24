class TodoApplicationError(Exception):
    """Base class for expected Todo use-case failures."""


class TodoAlreadyExists(TodoApplicationError):
    pass


class TodoNotFound(TodoApplicationError):
    pass


class StaleTodoVersion(TodoApplicationError):
    pass


class EmptyTodoPatch(TodoApplicationError):
    pass


class InvalidTodoVersion(TodoApplicationError):
    pass
