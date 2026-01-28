from __future__ import annotations

from uuid import UUID

from tortoise.expressions import Q
from tortoise.queryset import QuerySet

from apps.api.common.repositories import BaseRepository
from apps.api.models.asset import AssetRecord
from apps.api.models.asset_folder import AssetFolderRecord
from apps.api.routers.v1.admin.assets.schema import AdminAssetListQuery


class AdminAssetsRepository(BaseRepository):
    def query_assets(self, *, org_id: UUID, filters: AdminAssetListQuery) -> QuerySet[AssetRecord]:
        qs = AssetRecord.filter(org_id=org_id, deleted_at=None)

        if filters.folder_id is not None:
            qs = qs.filter(folder_id=filters.folder_id)

        if filters.purpose:
            qs = qs.filter(purpose=filters.purpose)

        if filters.visibility:
            qs = qs.filter(visibility=filters.visibility)

        if filters.indexable is not None:
            qs = qs.filter(indexable=filters.indexable)

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

        ordering = (filters.ordering or "").strip()
        if ordering:
            qs = qs.order_by(*_normalize_asset_ordering(ordering))
        else:
            qs = qs.order_by("-created_at")

        return qs

    async def get_asset(self, *, org_id: UUID, asset_id: UUID) -> AssetRecord | None:
        return await AssetRecord.get_or_none(id=asset_id, org_id=org_id, deleted_at=None)

    def query_folders(self, *, org_id: UUID) -> QuerySet[AssetFolderRecord]:
        return AssetFolderRecord.filter(org_id=org_id).order_by("sort_order", "name")

    async def get_folder(self, *, org_id: UUID, folder_id: UUID) -> AssetFolderRecord | None:
        return await AssetFolderRecord.get_or_none(id=folder_id, org_id=org_id)

    async def create_folder(
        self,
        *,
        org_id: UUID,
        name: str,
        parent_id: UUID | None,
        sort_order: int,
    ) -> AssetFolderRecord:
        return await AssetFolderRecord.create(org_id=org_id, name=name, parent_id=parent_id, sort_order=sort_order)

    async def save_folder_updates(self, folder: AssetFolderRecord, *, updates: dict) -> AssetFolderRecord:
        for key, value in updates.items():
            setattr(folder, key, value)
        await folder.save()
        return folder

    async def save_asset_updates(self, asset: AssetRecord, *, updates: dict) -> AssetRecord:
        for key, value in updates.items():
            setattr(asset, key, value)
        await asset.save()
        return asset


_ALLOWED_ASSET_ORDER_FIELDS = {
    "created_at",
    "updated_at",
    "size_bytes",
    "purpose",
    "visibility",
}


def _normalize_asset_ordering(value: str) -> list[str]:
    fields: list[str] = []
    for part in value.split(","):
        raw = part.strip()
        if not raw:
            continue
        desc = raw.startswith("-")
        name = raw[1:] if desc else raw
        if name not in _ALLOWED_ASSET_ORDER_FIELDS:
            continue
        fields.append(f"-{name}" if desc else name)
    return fields or ["-created_at"]
