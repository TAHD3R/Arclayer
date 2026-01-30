from __future__ import annotations

import pytest


def test_parse_range_header_none_returns_none() -> None:
    from apps.api.http_utils.range import parse_range_header

    assert parse_range_header(None, size=10) is None


def test_parse_range_header_full_prefix_is_required() -> None:
    from apps.api.http_utils.range import parse_range_header

    with pytest.raises(ValueError):
        parse_range_header("0-1", size=10)


def test_parse_range_header_simple_range() -> None:
    from apps.api.http_utils.range import parse_range_header

    assert parse_range_header("bytes=0-4", size=10) == (0, 4)


def test_parse_range_header_open_ended_range() -> None:
    from apps.api.http_utils.range import parse_range_header

    assert parse_range_header("bytes=5-", size=10) == (5, 9)


def test_parse_range_header_suffix_range() -> None:
    from apps.api.http_utils.range import parse_range_header

    assert parse_range_header("bytes=-3", size=10) == (7, 9)


def test_parse_range_header_rejects_multiple_ranges() -> None:
    from apps.api.http_utils.range import parse_range_header

    with pytest.raises(ValueError):
        parse_range_header("bytes=0-1,3-4", size=10)


def test_parse_range_header_rejects_out_of_bounds() -> None:
    from apps.api.http_utils.range import parse_range_header

    with pytest.raises(ValueError):
        parse_range_header("bytes=10-20", size=10)


def test_parse_range_header_rejects_inverted_range() -> None:
    from apps.api.http_utils.range import parse_range_header

    with pytest.raises(ValueError):
        parse_range_header("bytes=5-4", size=10)
