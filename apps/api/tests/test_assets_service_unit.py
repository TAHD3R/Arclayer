from __future__ import annotations

from uuid import uuid4


def test_canonical_asset_filename() -> None:
    from apps.api.routers.assets.service import canonical_asset_filename

    assert canonical_asset_filename(slug="avatar", ext="png") == "avatar.png"
    assert canonical_asset_filename(slug="avatar", ext=".png") == "avatar.png"
    assert canonical_asset_filename(slug="", ext="") == "asset.bin"


def test_build_asset_headers_sets_noindex_by_default() -> None:
    from apps.api.routers.assets.service import AssetPublicView, build_asset_headers

    view = AssetPublicView(
        id=uuid4(),
        slug="x",
        ext="png",
        mime="image/png",
        checksum_sha256=None,
        original_filename="x.png",
        object_key="org/x/assets/y.png",
        indexable=False,
        variants=None,
        storage_provider="local",
    )
    headers = build_asset_headers(view)
    assert headers["Cache-Control"] == "public, max-age=31536000, immutable"
    assert headers["X-Robots-Tag"] == "noindex"


def test_build_asset_headers_omits_noindex_when_indexable() -> None:
    from apps.api.routers.assets.service import AssetPublicView, build_asset_headers

    view = AssetPublicView(
        id=uuid4(),
        slug="x",
        ext="png",
        mime="image/png",
        checksum_sha256=None,
        original_filename="x.png",
        object_key="org/x/assets/y.png",
        indexable=True,
        variants=None,
        storage_provider="local",
    )
    headers = build_asset_headers(view)
    assert "X-Robots-Tag" not in headers
