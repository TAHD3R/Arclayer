from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import Field, computed_field

from apps.api.common.schemas import BaseOut, BaseSchema
from apps.api.core.http.pagination import PageData


def _canonical_filename(slug: str | None, ext: str | None) -> str:
    s = (slug or "asset").strip() or "asset"
    e = (ext or "bin").lstrip(".").strip().lower() or "bin"
    return f"{s}.{e}"


class PublicLibraryListQuery(BaseSchema):
    page: int = Field(default=1, ge=1, description="Page number (1-based).")
    size: int = Field(default=24, ge=1, le=200, description="Page size.")
    q: str | None = Field(default=None, description="Search query (filename/title/slug).")
    mime_prefix: str | None = Field(default=None, description="Filter by MIME prefix, e.g. 'image/' or 'video/'.")
    ordering: str | None = Field(default="-created_at", description="Ordering, e.g. '-created_at'.")


class PublicLibraryOrgOut(BaseSchema):
    id: UUID = Field(..., description="Organization id.")
    slug: str = Field(..., description="Organization slug.")
    name: str = Field(..., description="Organization name.")


class PublicLibraryAssetOut(BaseOut):
    title: str | None = Field(default=None, description="Asset title (optional).")
    slug: str | None = Field(default=None, description="URL slug (optional).")
    original_filename: str | None = Field(default=None, description="Original file name.")
    mime: str | None = Field(default=None, description="MIME type.")
    ext: str | None = Field(default=None, description="File extension.")
    size_bytes: int = Field(..., ge=0, description="Size in bytes.")
    created_at: datetime = Field(..., description="Created at.")

    @computed_field
    @property
    def public_url_path(self) -> str:
        name = _canonical_filename(self.slug, self.ext)
        return f"/assets/{self.id}/{name}"

    @computed_field
    @property
    def public_thumb_url_path(self) -> str:
        return f"/assets/{self.id}/thumb?w=320"

    @computed_field
    @property
    def public_download_url_path(self) -> str:
        return f"/assets/{self.id}/download"


class PublicLibraryPageOut(PageData[PublicLibraryAssetOut]):
    org: PublicLibraryOrgOut = Field(..., description="Organization.")
