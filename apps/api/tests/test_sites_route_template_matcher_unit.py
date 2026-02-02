from __future__ import annotations

from uuid import UUID

from apps.api.routers.v1.sites.repository import _compile_path_pattern, _match_compiled, _match_path_pattern


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


def test_compile_and_sort_prefers_more_segments_when_static_count_equal() -> None:
    # /blog/:year/:slug should be preferred over /blog/:slug for paths like /blog/2026/hello.
    t1 = _compile_path_pattern(
        "/blog/:slug",
        template_id=UUID(int=1),
        entry_type_id=UUID(int=1),
        template_page_revision_id=None,
    )
    t2 = _compile_path_pattern(
        "/blog/:year/:slug",
        template_id=UUID(int=2),
        entry_type_id=UUID(int=1),
        template_page_revision_id=None,
    )
    assert t1 is not None and t2 is not None

    compiled = sorted([t1, t2], key=lambda x: x.sort_key, reverse=True)
    assert compiled[0].path_pattern == "/blog/:year/:slug"
    assert _match_compiled(compiled[0], "/blog/2026/hello") == {"year": "2026", "slug": "hello"}
    # The more specific template shouldn't match a shorter path.
    assert _match_compiled(compiled[0], "/blog/hello") is None


def test_compile_prefers_more_static_segments() -> None:
    # /blog/hello should be preferred over /blog/:slug when both could match /blog/hello.
    static = _compile_path_pattern(
        "/blog/hello",
        template_id=UUID(int=1),
        entry_type_id=UUID(int=1),
        template_page_revision_id=None,
    )
    dyn = _compile_path_pattern(
        "/blog/:slug",
        template_id=UUID(int=2),
        entry_type_id=UUID(int=1),
        template_page_revision_id=None,
    )
    assert static is not None and dyn is not None
    compiled = sorted([static, dyn], key=lambda x: x.sort_key, reverse=True)
    assert compiled[0].path_pattern == "/blog/hello"
    assert _match_compiled(compiled[0], "/blog/hello") == {}


def test_compile_rejects_invalid_patterns() -> None:
    assert (
        _compile_path_pattern(
            "blog/:slug",
            template_id=UUID(int=1),
            entry_type_id=UUID(int=1),
            template_page_revision_id=None,
        )
        is None
    )
    assert (
        _compile_path_pattern(
            "/",
            template_id=UUID(int=1),
            entry_type_id=UUID(int=1),
            template_page_revision_id=None,
        )
        is None
    )
    assert (
        _compile_path_pattern(
            "/blog/:slug/:slug",
            template_id=UUID(int=1),
            entry_type_id=UUID(int=1),
            template_page_revision_id=None,
        )
        is None
    )
