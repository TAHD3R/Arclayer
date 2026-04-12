from __future__ import annotations


def test_normalize_visibility_for_avatar_forces_public_and_noindex() -> None:
    from src.modules.assets.admin.uploads.service import normalize_visibility_and_indexable

    visibility, indexable = normalize_visibility_and_indexable(
        purpose="avatar",
        requested_visibility="private",
        requested_indexable=True,
    )
    assert visibility == "public"
    assert indexable is False


def test_normalize_visibility_allows_library_public_indexable() -> None:
    from src.modules.assets.admin.uploads.service import normalize_visibility_and_indexable

    visibility, indexable = normalize_visibility_and_indexable(
        purpose="library",
        requested_visibility="public",
        requested_indexable=True,
    )
    assert visibility == "public"
    assert indexable is True


def test_normalize_visibility_forbids_indexable_when_not_public() -> None:
    from src.modules.assets.admin.uploads.service import normalize_visibility_and_indexable

    visibility, indexable = normalize_visibility_and_indexable(
        purpose="library",
        requested_visibility="private",
        requested_indexable=True,
    )
    assert visibility == "private"
    assert indexable is False


def test_normalize_visibility_invalid_defaults_private() -> None:
    from src.modules.assets.admin.uploads.service import normalize_visibility_and_indexable

    visibility, indexable = normalize_visibility_and_indexable(
        purpose="library",
        requested_visibility="nope",
        requested_indexable=None,
    )
    assert visibility == "private"
    assert indexable is False
