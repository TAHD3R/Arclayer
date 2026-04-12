from __future__ import annotations

from uuid import UUID

from tortoise.expressions import Q
from tortoise.queryset import QuerySet

from src.common.constants.assets import PUBLIC_LIBRARY_ASSET_ALLOWED_ORDER_FIELDS
from src.common.repositories import BaseRepository
from src.models.assets.asset import AssetPurpose, AssetRecord, AssetVisibility
from src.models.organization.organization import Organization
from src.modules.library.schema import PublicLibraryListQuery


class PublicLibraryRepository(BaseRepository):
    async def get_org_by_slug(self, *, slug: str) -> Organization | None:
        s = (slug or "").strip()
        if not s:
            return None
        return await Organization.get_or_none(slug=s, is_active=True)

    def query_public_library_assets(
        self,
        *,
        org_id: UUID,
        filters: PublicLibraryListQuery,
    ) -> QuerySet[AssetRecord]:
        qs = AssetRecord.filter(
            org_id=org_id,
            deleted_at=None,
            purpose=AssetPurpose.LIBRARY,
            visibility=AssetVisibility.PUBLIC,
            indexable=True,
        )

        if filters.mime_prefix:
            prefix = filters.mime_prefix.strip()
            if prefix:
                qs = qs.filter(mime__startswith=prefix)

        if filters.q:
            needle = filters.q.strip()
            if needle:
                qs = qs.filter(
                    Q(original_filename__icontains=needle) | Q(slug__icontains=needle) | Q(title__icontains=needle)
                )

        ordering = (filters.ordering or "").strip() or "-created_at"
        qs = qs.order_by(*_normalize_ordering(ordering))
        return qs


def _normalize_ordering(value: str) -> list[str]:
    fields: list[str] = []
    for part in value.split(","):
        raw = part.strip()
        if not raw:
            continue
        desc = raw.startswith("-")
        name = raw[1:] if desc else raw
        if name not in PUBLIC_LIBRARY_ASSET_ALLOWED_ORDER_FIELDS:
            continue
        fields.append(f"-{name}" if desc else name)
    return fields or ["-created_at"]
