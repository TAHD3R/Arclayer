from __future__ import annotations

from uuid import UUID

from apps.api.src.common.constants.assets import (
    ASSET_SCOPE_ORGANIZATION,
    ASSET_SCOPE_USER,
    ASSET_SCOPE_WORKSPACE,
)


def build_asset_object_key(*, workspace_id: UUID, asset_id: UUID, ext: str) -> str:
    safe_ext = (ext or "").lstrip(".").lower() or "bin"
    return f"workspaces/{workspace_id}/assets/{asset_id}.{safe_ext}"


def build_scoped_asset_object_key(*, scope: str, scope_id: UUID, asset_id: UUID, ext: str) -> str:
    safe_ext = (ext or "").lstrip(".").lower() or "bin"
    s = (scope or "").strip().lower()
    if s == ASSET_SCOPE_WORKSPACE:
        return f"workspaces/{scope_id}/assets/{asset_id}.{safe_ext}"
    if s == ASSET_SCOPE_ORGANIZATION:
        return f"organizations/{scope_id}/assets/{asset_id}.{safe_ext}"
    if s == ASSET_SCOPE_USER:
        return f"users/{scope_id}/assets/{asset_id}.{safe_ext}"
    raise ValueError("invalid scope")


def build_upload_part_object_key(*, workspace_id: UUID, upload_id: UUID, part_number: int) -> str:
    if part_number <= 0:
        raise ValueError("part_number must be >= 1")
    return f"workspaces/{workspace_id}/uploads/{upload_id}/part-{part_number:06d}"


def build_scoped_upload_part_object_key(*, scope: str, scope_id: UUID, upload_id: UUID, part_number: int) -> str:
    if part_number <= 0:
        raise ValueError("part_number must be >= 1")
    s = (scope or "").strip().lower()
    if s == ASSET_SCOPE_WORKSPACE:
        return f"workspaces/{scope_id}/uploads/{upload_id}/part-{part_number:06d}"
    if s == ASSET_SCOPE_ORGANIZATION:
        return f"organizations/{scope_id}/uploads/{upload_id}/part-{part_number:06d}"
    if s == ASSET_SCOPE_USER:
        return f"users/{scope_id}/uploads/{upload_id}/part-{part_number:06d}"
    raise ValueError("invalid scope")


def compute_total_parts(*, size_bytes: int, chunk_size_bytes: int) -> int:
    if size_bytes < 0:
        raise ValueError("size_bytes must be >= 0")
    if chunk_size_bytes <= 0:
        raise ValueError("chunk_size_bytes must be > 0")
    if size_bytes == 0:
        return 1
    return (size_bytes + chunk_size_bytes - 1) // chunk_size_bytes
