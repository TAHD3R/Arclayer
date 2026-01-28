from __future__ import annotations

from uuid import uuid4


def test_admin_asset_summary_out_computed_urls_for_public() -> None:
    from apps.api.routers.v1.admin.assets.schema import AdminAssetSummaryOut

    asset_id = uuid4()
    out = AdminAssetSummaryOut(
        id=asset_id,
        purpose="library",
        visibility="public",
        indexable=True,
        title=None,
        slug="my-file",
        original_filename="my file.png",
        mime="image/png",
        ext="png",
        size_bytes=123,
        checksum_sha256=None,
        folder_id=None,
        created_at="2026-01-28T00:00:00Z",
    )
    assert out.content_url_path == f"/api/v1/admin/assets/{asset_id}/content"
    assert out.public_url_path == f"/assets/{asset_id}/my-file.png"
    assert out.public_download_url_path == f"/assets/{asset_id}/download"
    assert out.public_thumb_url_path == f"/assets/{asset_id}/thumb"


def test_admin_asset_summary_out_computed_urls_for_private() -> None:
    from apps.api.routers.v1.admin.assets.schema import AdminAssetSummaryOut

    asset_id = uuid4()
    out = AdminAssetSummaryOut(
        id=asset_id,
        purpose="library",
        visibility="private",
        indexable=False,
        title=None,
        slug="x",
        original_filename="x.png",
        mime="image/png",
        ext="png",
        size_bytes=123,
        checksum_sha256=None,
        folder_id=None,
        created_at="2026-01-28T00:00:00Z",
    )
    assert out.public_url_path is None
    assert out.public_download_url_path is None
    assert out.public_thumb_url_path is None
