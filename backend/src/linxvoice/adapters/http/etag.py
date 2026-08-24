import re

from linxvoice.adapters.http.problems import Problem

ETAG_PATTERN = re.compile(r'^"(?P<version>[1-9][0-9]*)"$')


def parse_if_match(value: str | None) -> int:
    if value is None:
        raise Problem(428, "Precondition required", "Supply the Todo version using If-Match.")
    match = ETAG_PATTERN.fullmatch(value.strip())
    if not match:
        raise Problem(
            400,
            "Invalid If-Match",
            'If-Match must be a quoted positive integer, e.g. "3".',
        )
    return int(match.group("version"))


def etag(version: int) -> str:
    return f'"{version}"'
