import pytest

from linxvoice.http import etag, parse_if_match
from linxvoice.problems import Problem


def test_if_match_parses_a_quoted_positive_version() -> None:
    assert parse_if_match('"12"') == 12
    assert etag(12) == '"12"'


def test_missing_if_match_requires_a_precondition() -> None:
    with pytest.raises(Problem) as raised:
        parse_if_match(None)

    assert raised.value.status == 428


@pytest.mark.parametrize("value", ["3", 'W/"3"', '"0"', '"-1"', '"abc"'])
def test_invalid_if_match_is_rejected(value: str) -> None:
    with pytest.raises(Problem) as raised:
        parse_if_match(value)

    assert raised.value.status == 400
