from __future__ import annotations

from uuid import UUID


def test_slugify_keeps_ascii_and_hyphens() -> None:
    from src.common.text.slug.service import slugify

    assert slugify("Hello World") == "hello-world"
    assert slugify("  Hello   World  ") == "hello-world"
    assert slugify("A_B.C") == "a_b.c"
    assert slugify("a--b") == "a-b"


def test_slugify_falls_back_when_empty() -> None:
    from src.common.text.slug.service import slugify

    assert slugify("") == "asset"
    assert slugify("   ") == "asset"


def test_build_asset_object_key_contains_workspace_and_asset_id() -> None:
    from src.modules.assets.naming.service import build_asset_object_key

    workspace_id = UUID("00000000-0000-0000-0000-000000000001")
    asset_id = UUID("00000000-0000-0000-0000-000000000002")
    key = build_asset_object_key(workspace_id=workspace_id, asset_id=asset_id, ext="png")
    assert str(workspace_id) in key
    assert str(asset_id) in key
    assert key.endswith(".png")


def test_build_upload_part_object_key_is_stable() -> None:
    from src.modules.assets.naming.service import build_upload_part_object_key

    workspace_id = UUID("00000000-0000-0000-0000-000000000001")
    upload_id = UUID("00000000-0000-0000-0000-000000000003")
    assert (
        build_upload_part_object_key(workspace_id=workspace_id, upload_id=upload_id, part_number=1)
        == "workspaces/00000000-0000-0000-0000-000000000001/uploads/00000000-0000-0000-0000-000000000003/part-000001"
    )


def test_compute_total_parts() -> None:
    from src.modules.assets.naming.service import compute_total_parts

    assert compute_total_parts(size_bytes=0, chunk_size_bytes=8) == 1
    assert compute_total_parts(size_bytes=1, chunk_size_bytes=8) == 1
    assert compute_total_parts(size_bytes=8, chunk_size_bytes=8) == 1
    assert compute_total_parts(size_bytes=9, chunk_size_bytes=8) == 2
