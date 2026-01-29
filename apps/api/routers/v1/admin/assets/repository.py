from __future__ import annotations

from uuid import UUID

from tortoise.expressions import Q
from tortoise.queryset import QuerySet

from apps.api.common.repositories import BaseRepository
from apps.api.models.asset import AssetRecord
from apps.api.models.asset_folder import AssetFolderRecord
from apps.api.models.asset_tag import AssetTagLinkRecord, AssetTagRecord
from apps.api.routers.v1.admin.assets.schema import AdminAssetListQuery


class AdminAssetsRepository(BaseRepository):
    def query_assets(
        self,
        *,
        org_id: UUID,
        filters: AdminAssetListQuery,
        folder_ids: list[UUID] | None = None,
    ) -> QuerySet[AssetRecord]:
        qs = AssetRecord.filter(org_id=org_id, deleted_at=None)

        if folder_ids is not None:
            qs = qs.filter(folder_id__in=folder_ids)
        elif filters.folder_id is not None:
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

        if filters.created_from is not None:
            qs = qs.filter(created_at__gte=filters.created_from)

        if filters.created_to is not None:
            qs = qs.filter(created_at__lte=filters.created_to)

        if filters.tag_ids:
            # any-of: match assets with at least one of the given tag ids.
            qs = qs.filter(tag_links__tag_id__in=list(filters.tag_ids)).distinct()

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

    async def get_asset_with_tags(self, *, org_id: UUID, asset_id: UUID) -> AssetRecord | None:
        return (
            await AssetRecord
            .filter(id=asset_id, org_id=org_id, deleted_at=None)
            .prefetch_related("tag_links__tag")
            .first()
        )

    def query_folders(self, *, org_id: UUID) -> QuerySet[AssetFolderRecord]:
        return AssetFolderRecord.filter(org_id=org_id).order_by("sort_order", "name")

    def query_tags(self, *, org_id: UUID, q: str | None = None) -> QuerySet[AssetTagRecord]:
        qs = AssetTagRecord.filter(org_id=org_id)
        if q:
            needle = q.strip()
            if needle:
                qs = qs.filter(name__icontains=needle)
        return qs.order_by("name")

    async def get_tag_by_name(self, *, org_id: UUID, name: str) -> AssetTagRecord | None:
        return await AssetTagRecord.get_or_none(org_id=org_id, name=name)

    async def create_tag(self, *, org_id: UUID, name: str) -> AssetTagRecord:
        return await AssetTagRecord.create(org_id=org_id, name=name)

    async def list_tags_by_ids(self, *, org_id: UUID, tag_ids: list[UUID]) -> list[AssetTagRecord]:
        if not tag_ids:
            return []
        return await AssetTagRecord.filter(org_id=org_id, id__in=tag_ids).all()

    async def replace_asset_tags(self, *, asset_id: UUID, tag_ids: list[UUID]) -> None:
        # Replace links with the given set (idempotent).
        target = set(tag_ids)
        existing = set(
            await AssetTagLinkRecord.filter(asset_id=asset_id).values_list("tag_id", flat=True)  # type: ignore[arg-type]
        )

        to_delete = list(existing - target)
        to_add = list(target - existing)

        if to_delete:
            await AssetTagLinkRecord.filter(asset_id=asset_id, tag_id__in=to_delete).delete()
        for tag_id in to_add:
            await AssetTagLinkRecord.create(asset_id=asset_id, tag_id=tag_id)

    async def get_folder(self, *, org_id: UUID, folder_id: UUID) -> AssetFolderRecord | None:
        return await AssetFolderRecord.get_or_none(id=folder_id, org_id=org_id)

    async def collect_descendant_folder_ids(self, *, org_id: UUID, root_folder_id: UUID) -> list[UUID]:
        # We intentionally do this in Python (single query) to keep DB/storage agnostic.
        rows = await AssetFolderRecord.filter(org_id=org_id).values("id", "parent_id")
        children: dict[UUID, list[UUID]] = {}
        for r in rows:
            fid = r.get("id")
            pid = r.get("parent_id")
            if fid is None:
                continue
            if pid is None:
                continue
            children.setdefault(pid, []).append(fid)

        out: list[UUID] = []
        seen: set[UUID] = set()
        stack: list[UUID] = [root_folder_id]
        while stack:
            cur = stack.pop()
            if cur in seen:
                continue
            seen.add(cur)
            out.append(cur)
            stack.extend(children.get(cur, []))
        return out

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
