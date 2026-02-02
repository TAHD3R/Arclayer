from __future__ import annotations

from apps.api.routers.v1.sites.repository import _match_path_pattern


def test_match_path_pattern_static_segments() -> None:
    assert _match_path_pattern("/about", "/about") == ({}, 1)
    assert _match_path_pattern("/about", "/about/") == ({}, 1)
    assert _match_path_pattern("/about", "/nope") is None


def test_match_path_pattern_param_segment() -> None:
    assert _match_path_pattern("/blog/:slug", "/blog/hello") == ({"slug": "hello"}, 1)
    assert _match_path_pattern("/blog/:slug", "/blog/hello/") == ({"slug": "hello"}, 1)
    assert _match_path_pattern("/blog/:slug", "/blog") is None
    assert _match_path_pattern("/blog/:slug", "/blog/hello/world") is None


def test_match_path_pattern_specificity_prefers_static() -> None:
    # Specificity score = static segment count.
    m1 = _match_path_pattern("/blog/:slug", "/blog/hello")
    m2 = _match_path_pattern("/blog/hello", "/blog/hello")
    assert m1 is not None and m2 is not None
    assert m1[1] == 1
    assert m2[1] == 2

