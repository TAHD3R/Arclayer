from __future__ import annotations

import pytest

from apps.api.core.exceptions import Conflict
from apps.api.routers.v1.sites.service import _validate_route_template_pattern


@pytest.mark.parametrize(
    "pattern",
    [
        "/blog/:slug",
        "/blog/:year/:slug",
        "/docs/:section/:slug",
        "blog/:slug",  # leading slash normalization
    ],
)
def test_validate_route_template_pattern_accepts_valid_patterns(pattern: str) -> None:
    out = _validate_route_template_pattern(pattern)
    assert out.startswith("/")
    assert "?" not in out
    assert "#" not in out


@pytest.mark.parametrize(
    "pattern",
    [
        "/",
        "/blog//:slug",
        "/blog/:",
        "/blog/:slug-1",
        "/blog/:slug?x=1",
        "/blog/..",
        "/blog/*",
    ],
)
def test_validate_route_template_pattern_rejects_invalid_patterns(pattern: str) -> None:
    with pytest.raises(Conflict):
        _validate_route_template_pattern(pattern)
