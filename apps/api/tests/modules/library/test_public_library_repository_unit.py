from __future__ import annotations

from src.modules.library.repository import _normalize_ordering


def test_public_library_ordering_keeps_allowed_fields() -> None:
    ordering = _normalize_ordering("-created_at,title,unknown,-size_bytes")

    assert ordering == ["-created_at", "-size_bytes"]


def test_public_library_ordering_defaults_when_empty_or_invalid() -> None:
    assert _normalize_ordering("") == ["-created_at"]
    assert _normalize_ordering("unknown,-missing") == ["-created_at"]
