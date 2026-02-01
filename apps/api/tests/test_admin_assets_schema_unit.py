from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4


def test_admin_asset_summary_out_computed_urls_for_public() -> None:
    from apps.api.routers.v1.admin.assets.schema import AdminAssetSummaryOut

    asset_id = uuid4()
    workspace_id = uuid4()
    out = AdminAssetSummaryOut(
        id=asset_id,
        workspace_id=workspace_id,
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
        created_at=datetime(2026, 1, 28, 0, 0, 0, tzinfo=UTC),
    )
    assert out.content_url_path == f"/api/v1/workspaces/{workspace_id}/assets/{asset_id}/content"
    assert out.public_url_path == f"/assets/{asset_id}/my-file.png"
    assert out.public_download_url_path == f"/assets/{asset_id}/download"
    assert out.public_thumb_url_path == f"/assets/{asset_id}/thumb"


def test_admin_asset_summary_out_computed_urls_for_private() -> None:
    from apps.api.routers.v1.admin.assets.schema import AdminAssetSummaryOut

    asset_id = uuid4()
    workspace_id = uuid4()
    out = AdminAssetSummaryOut(
        id=asset_id,
        workspace_id=workspace_id,
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
        created_at=datetime(2026, 1, 28, 0, 0, 0, tzinfo=UTC),
    )
    assert out.public_url_path is None
    assert out.public_download_url_path is None
    assert out.public_thumb_url_path is None


def test_admin_asset_list_query_accepts_datetime_and_tags() -> None:
    from apps.api.routers.v1.admin.assets.schema import AdminAssetListQuery

    q = AdminAssetListQuery.model_validate({
        "createdFrom": "2026-01-28T00:00:00Z",
        "createdTo": "2026-01-29T23:59:59Z",
        "tagIds": [str(uuid4()), str(uuid4())],
        "includeChildren": True,
        "visibility": "public",
    })
    assert q.created_from is not None
    assert q.created_to is not None
    assert q.tag_ids is not None
    assert q.include_children is True


def test_admin_asset_update_request_accepts_description_and_tag_ids() -> None:
    from apps.api.routers.v1.admin.assets.schema import AdminAssetUpdateRequest

    tid = uuid4()
    r = AdminAssetUpdateRequest.model_validate({
        "description": "  hello  ",
        "tagIds": [str(tid)],
    })
    assert r.description == "hello"
    assert r.tag_ids == [tid]
