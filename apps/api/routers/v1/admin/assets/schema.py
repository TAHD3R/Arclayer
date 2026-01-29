from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import Field, computed_field

from apps.api.common.schemas import BaseOut, BaseSchema


def _canonical_filename(slug: str | None, ext: str | None) -> str:
    s = (slug or "asset").strip() or "asset"
    e = (ext or "bin").lstrip(".").strip().lower() or "bin"
    return f"{s}.{e}"


class AdminAssetListQuery(BaseSchema):
    q: str | None = Field(default=None, description="Search query (filename/slug/title).")
    purpose: str | None = Field(default=None, description="Filter by purpose.")
    visibility: str | None = Field(default=None, description="Filter by visibility: public/private/shared.")
    indexable: bool | None = Field(default=None, description="Filter by indexable flag.")
    folder_id: UUID | None = Field(default=None, description="Filter by folder id.")
    include_children: bool = Field(
        default=False,
        description="When folder_id is provided, include assets in all descendant folders.",
    )
    mime_prefix: str | None = Field(default=None, description="Filter by MIME prefix, e.g. 'image/' or 'video/'.")
    created_from: datetime | None = Field(default=None, description="Filter by created_at >= this ISO datetime.")
    created_to: datetime | None = Field(default=None, description="Filter by created_at <= this ISO datetime.")
    tag_ids: list[UUID] | None = Field(default=None, description="Filter by tag ids (any-of).")
    ordering: str | None = Field(default=None, description="Ordering, e.g. '-created_at', 'size_bytes'.")


class AdminAssetSummaryOut(BaseOut):
    purpose: str = Field(..., description="Asset purpose.")
    visibility: str = Field(..., description="Asset visibility.")
    indexable: bool = Field(..., description="Whether the asset is indexable.")
    title: str | None = Field(default=None, description="Asset title (optional).")
    slug: str | None = Field(default=None, description="URL slug (optional).")
    original_filename: str | None = Field(default=None, description="Original file name.")
    mime: str | None = Field(default=None, description="MIME type.")
    ext: str | None = Field(default=None, description="File extension.")
    size_bytes: int = Field(..., ge=0, description="Size in bytes.")
    checksum_sha256: str | None = Field(default=None, description="SHA-256 checksum (hex).")
    folder_id: UUID | None = Field(default=None, description="Folder id (optional).")
    created_at: datetime = Field(..., description="Created at.")

    @computed_field
    @property
    def content_url_path(self) -> str:
        # Admin-authenticated streaming endpoint (supports Range).
        return f"/api/v1/admin/assets/{self.id}/content"

    @computed_field
    @property
    def public_url_path(self) -> str | None:
        if str(self.visibility) != "public":
            return None
        name = _canonical_filename(self.slug, self.ext)
        return f"/assets/{self.id}/{name}"

    @computed_field
    @property
    def public_download_url_path(self) -> str | None:
        if str(self.visibility) != "public":
            return None
        return f"/assets/{self.id}/download"

    @computed_field
    @property
    def public_thumb_url_path(self) -> str | None:
        if str(self.visibility) != "public":
            return None
        return f"/assets/{self.id}/thumb"


class AdminAssetFolderOut(BaseOut):
    name: str = Field(..., description="Folder name.")
    parent_id: UUID | None = Field(default=None, description="Parent folder id.")
    sort_order: int = Field(default=0, description="Sort order.")
    created_at: datetime = Field(..., description="Created at.")


class AdminAssetFolderCreateRequest(BaseSchema):
    name: str = Field(..., min_length=1, max_length=64, description="Folder name.")
    parent_id: UUID | None = Field(default=None, description="Parent folder id.")
    sort_order: int = Field(default=0, description="Sort order.")


class AdminAssetFolderUpdateRequest(BaseSchema):
    name: str | None = Field(default=None, min_length=1, max_length=64, description="Folder name.")
    sort_order: int | None = Field(default=None, description="Sort order.")


class AdminAssetMoveRequest(BaseSchema):
    folder_id: UUID | None = Field(default=None, description="Target folder id (null = move to root).")


class AdminAssetUpdateRequest(BaseSchema):
    description: str | None = Field(default=None, max_length=4000, description="User-facing description.")
    tag_ids: list[UUID] | None = Field(default=None, description="Tag ids to set (replace existing).")


class AdminAssetTagCreateRequest(BaseSchema):
    name: str = Field(..., min_length=1, max_length=64, description="Tag name.")


class AdminAssetTagOut(BaseOut):
    name: str = Field(..., description="Tag name.")
    created_at: datetime = Field(..., description="Created at.")


class AdminAssetDetailOut(AdminAssetSummaryOut):
    description: str | None = Field(default=None, description="User-facing description (from asset.meta).")
    tags: list[AdminAssetTagOut] = Field(default_factory=list, description="Attached tags.")
