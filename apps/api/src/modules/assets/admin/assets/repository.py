from __future__ import annotations

from uuid import UUID

from tortoise.expressions import Q
from tortoise.queryset import QuerySet

from apps.api.src.common.constants.assets import ADMIN_ASSET_ALLOWED_ORDER_FIELDS
from apps.api.src.common.repositories import BaseRepository
from apps.api.src.models.assets.asset import AssetRecord
from apps.api.src.models.assets.asset_folder import AssetFolderRecord
from apps.api.src.models.assets.asset_tag import AssetTagLinkRecord, AssetTagRecord
from apps.api.src.modules.assets.admin.assets.schema import AdminAssetListQuery
from apps.api.src.modules.assets.scope import AssetScope, scope_filter_kwargs


class AdminAssetsRepository(BaseRepository):
    def query_assets(
        self,
        *,
        scope: AssetScope,
        filters: AdminAssetListQuery,
        folder_ids: list[UUID] | None = None,
    ) -> QuerySet[AssetRecord]:
        qs = AssetRecord.filter(deleted_at=None, **scope_filter_kwargs(scope))

        if folder_ids is not None:
            qs = qs.filter(folder_id__in=folder_ids)
        elif filters.folder_id is not None:
            qs = qs.filter(folder_id=filters.folder_id)
        elif filters.folder_is_null is True:
            qs = qs.filter(folder_id__isnull=True)

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

    async def get_asset(self, *, scope: AssetScope, asset_id: UUID) -> AssetRecord | None:
        return await AssetRecord.get_or_none(id=asset_id, deleted_at=None, **scope_filter_kwargs(scope))

    async def get_assets_by_ids(self, *, scope: AssetScope, asset_ids: list[UUID]) -> list[AssetRecord]:
        if not asset_ids:
            return []
        return await AssetRecord.filter(deleted_at=None, id__in=list(asset_ids), **scope_filter_kwargs(scope)).all()

    async def get_asset_with_tags(self, *, scope: AssetScope, asset_id: UUID) -> AssetRecord | None:
        return (
            await AssetRecord
            .filter(id=asset_id, deleted_at=None, **scope_filter_kwargs(scope))
            .prefetch_related("tag_links__tag")
            .first()
        )

    def query_folders(self, *, scope: AssetScope) -> QuerySet[AssetFolderRecord]:
        return AssetFolderRecord.filter(**scope_filter_kwargs(scope)).order_by("sort_order", "name")

    def query_tags(self, *, scope: AssetScope, q: str | None = None) -> QuerySet[AssetTagRecord]:
        qs = AssetTagRecord.filter(**scope_filter_kwargs(scope))
        if q:
            needle = q.strip()
            if needle:
                qs = qs.filter(name__icontains=needle)
        return qs.order_by("name")

    async def get_tag_by_name(self, *, scope: AssetScope, name: str) -> AssetTagRecord | None:
        return await AssetTagRecord.get_or_none(name=name, **scope_filter_kwargs(scope))

    async def create_tag(self, *, scope: AssetScope, name: str) -> AssetTagRecord:
        return await AssetTagRecord.create(name=name, **scope_filter_kwargs(scope))

    async def list_tags_by_ids(self, *, scope: AssetScope, tag_ids: list[UUID]) -> list[AssetTagRecord]:
        if not tag_ids:
            return []
        return await AssetTagRecord.filter(id__in=tag_ids, **scope_filter_kwargs(scope)).all()

    async def replace_asset_tags(self, *, asset_id: UUID, tag_ids: list[UUID]) -> None:
        # Replace links with the given set (idempotent).
        target = set(tag_ids)
        raw_rows = await AssetTagLinkRecord.filter(asset_id=asset_id).values_list("tag_id", flat=True)
        existing: set[UUID] = set()
        for r in raw_rows:
            value = r[0] if isinstance(r, tuple) else r
            if value is None:
                continue
            existing.add(value if isinstance(value, UUID) else UUID(str(value)))

        to_delete = list(existing - target)
        to_add = list(target - existing)

        if to_delete:
            await AssetTagLinkRecord.filter(asset_id=asset_id, tag_id__in=to_delete).delete()
        for tag_id in to_add:
            await AssetTagLinkRecord.create(asset_id=asset_id, tag_id=tag_id)

    async def get_folder(self, *, scope: AssetScope, folder_id: UUID) -> AssetFolderRecord | None:
        return await AssetFolderRecord.get_or_none(id=folder_id, **scope_filter_kwargs(scope))

    async def folder_has_children(self, *, scope: AssetScope, folder_id: UUID) -> bool:
        return await AssetFolderRecord.filter(parent_id=folder_id, **scope_filter_kwargs(scope)).exists()

    async def folder_has_assets(self, *, scope: AssetScope, folder_id: UUID) -> bool:
        return await AssetRecord.filter(deleted_at=None, folder_id=folder_id, **scope_filter_kwargs(scope)).exists()

    async def delete_folder(self, *, scope: AssetScope, folder_id: UUID) -> None:
        await AssetFolderRecord.filter(id=folder_id, **scope_filter_kwargs(scope)).delete()

    async def move_assets_in_folder(
        self,
        *,
        scope: AssetScope,
        from_folder_id: UUID,
        to_folder_id: UUID | None,
        updated_at,
    ) -> int:
        return int(
            await AssetRecord.filter(
                deleted_at=None,
                folder_id=from_folder_id,
                **scope_filter_kwargs(scope),
            ).update(folder_id=to_folder_id, updated_at=updated_at)
        )

    async def move_child_folders(
        self,
        *,
        scope: AssetScope,
        from_folder_id: UUID,
        to_parent_id: UUID | None,
        updated_at,
    ) -> int:
        return int(
            await AssetFolderRecord.filter(
                parent_id=from_folder_id,
                **scope_filter_kwargs(scope),
            ).update(parent_id=to_parent_id, updated_at=updated_at)
        )

    async def collect_descendant_folder_ids(self, *, scope: AssetScope, root_folder_id: UUID) -> list[UUID]:
        # We intentionally do this in Python (single query) to keep DB/storage agnostic.
        rows = await AssetFolderRecord.filter(**scope_filter_kwargs(scope)).values("id", "parent_id")
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
        scope: AssetScope,
        name: str,
        parent_id: UUID | None,
        description: str | None,
        sort_order: int,
    ) -> AssetFolderRecord:
        return await AssetFolderRecord.create(
            name=name,
            parent_id=parent_id,
            description=description,
            sort_order=sort_order,
            **scope_filter_kwargs(scope),
        )

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

    async def bulk_update_assets_folder(
        self,
        *,
        scope: AssetScope,
        asset_ids: list[UUID],
        folder_id: UUID | None,
        updated_at,
    ) -> int:
        if not asset_ids:
            return 0
        return int(
            await AssetRecord.filter(deleted_at=None, id__in=list(asset_ids), **scope_filter_kwargs(scope)).update(
                folder_id=folder_id,
                updated_at=updated_at,
            )
        )

    async def bulk_soft_delete_assets(
        self,
        *,
        scope: AssetScope,
        asset_ids: list[UUID],
        deleted_at,
        updated_at,
    ) -> int:
        if not asset_ids:
            return 0
        return int(
            await AssetRecord.filter(deleted_at=None, id__in=list(asset_ids), **scope_filter_kwargs(scope)).update(
                deleted_at=deleted_at,
                updated_at=updated_at,
            )
        )

    async def bulk_update_assets_fields(
        self,
        *,
        scope: AssetScope,
        asset_ids: list[UUID],
        updates: dict,
        updated_at,
    ) -> int:
        if not asset_ids:
            return 0
        if not updates:
            return 0
        payload = dict(updates)
        payload["updated_at"] = updated_at
        return int(
            await AssetRecord.filter(deleted_at=None, id__in=list(asset_ids), **scope_filter_kwargs(scope)).update(
                **payload
            )
        )


def _normalize_asset_ordering(value: str) -> list[str]:
    fields: list[str] = []
    for part in value.split(","):
        raw = part.strip()
        if not raw:
            continue
        desc = raw.startswith("-")
        name = raw[1:] if desc else raw
        if name not in ADMIN_ASSET_ALLOWED_ORDER_FIELDS:
            continue
        fields.append(f"-{name}" if desc else name)
    return fields or ["-created_at"]
