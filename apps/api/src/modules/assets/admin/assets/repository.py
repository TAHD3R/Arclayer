from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.expressions import Q
from tortoise.queryset import QuerySet

from src.common.constants.assets import ADMIN_ASSET_ALLOWED_ORDER_FIELDS
from src.common.repositories import BaseRepository
from src.models.assets.asset import AssetRecord
from src.models.assets.asset_folder import AssetFolderRecord
from src.models.assets.asset_tag import AssetTagLinkRecord, AssetTagRecord
from src.modules.assets.admin.assets.schema import AdminAssetListQuery
from src.modules.assets.scope import AssetScope, AssetScopeDatabaseRouter, scope_filter_kwargs
from src.modules.tenancy.schema import TenantContext


class AdminAssetsRepository(BaseRepository):
    def __init__(self, tenant_context: TenantContext | None = None) -> None:
        super().__init__()
        self.scope_db = AssetScopeDatabaseRouter(tenant_context)

    @asynccontextmanager
    async def connection(
        self,
        *,
        scope: AssetScope,
        conn: BaseDBAsyncClient | None = None,
    ) -> AsyncIterator[BaseDBAsyncClient | None]:
        async with self.scope_db.connection(scope=scope, conn=conn) as scoped_conn:
            yield scoped_conn

    def query_assets(
        self,
        *,
        scope: AssetScope,
        filters: AdminAssetListQuery,
        folder_ids: list[UUID] | None = None,
        conn: BaseDBAsyncClient | None = None,
    ) -> QuerySet[AssetRecord]:
        qs = self.using_db(AssetRecord.filter(deleted_at=None, **scope_filter_kwargs(scope)), conn)

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

    async def get_asset(
        self,
        *,
        scope: AssetScope,
        asset_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> AssetRecord | None:
        return await AssetRecord.get_or_none(
            id=asset_id, deleted_at=None, **scope_filter_kwargs(scope), **self._using_db_kwargs(conn)
        )

    async def get_assets_by_ids(
        self,
        *,
        scope: AssetScope,
        asset_ids: list[UUID],
        conn: BaseDBAsyncClient | None = None,
    ) -> list[AssetRecord]:
        if not asset_ids:
            return []
        return await self.using_db(
            AssetRecord.filter(deleted_at=None, id__in=list(asset_ids), **scope_filter_kwargs(scope)),
            conn,
        ).all()

    async def get_asset_with_tags(
        self,
        *,
        scope: AssetScope,
        asset_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> AssetRecord | None:
        return (
            await self
            .using_db(
                AssetRecord.filter(id=asset_id, deleted_at=None, **scope_filter_kwargs(scope)),
                conn,
            )
            .prefetch_related("tag_links__tag")
            .first()
        )

    def query_folders(
        self,
        *,
        scope: AssetScope,
        conn: BaseDBAsyncClient | None = None,
    ) -> QuerySet[AssetFolderRecord]:
        return self.using_db(AssetFolderRecord.filter(**scope_filter_kwargs(scope)), conn).order_by(
            "sort_order", "name"
        )

    def query_tags(
        self,
        *,
        scope: AssetScope,
        q: str | None = None,
        conn: BaseDBAsyncClient | None = None,
    ) -> QuerySet[AssetTagRecord]:
        qs = self.using_db(AssetTagRecord.filter(**scope_filter_kwargs(scope)), conn)
        if q:
            needle = q.strip()
            if needle:
                qs = qs.filter(name__icontains=needle)
        return qs.order_by("name")

    async def get_tag_by_name(
        self,
        *,
        scope: AssetScope,
        name: str,
        conn: BaseDBAsyncClient | None = None,
    ) -> AssetTagRecord | None:
        return await AssetTagRecord.get_or_none(name=name, **scope_filter_kwargs(scope), **self._using_db_kwargs(conn))

    async def create_tag(
        self,
        *,
        scope: AssetScope,
        name: str,
        conn: BaseDBAsyncClient | None = None,
    ) -> AssetTagRecord:
        return await AssetTagRecord.create(name=name, **scope_filter_kwargs(scope), **self._using_db_kwargs(conn))

    async def list_tags_by_ids(
        self,
        *,
        scope: AssetScope,
        tag_ids: list[UUID],
        conn: BaseDBAsyncClient | None = None,
    ) -> list[AssetTagRecord]:
        if not tag_ids:
            return []
        return await self.using_db(AssetTagRecord.filter(id__in=tag_ids, **scope_filter_kwargs(scope)), conn).all()

    async def replace_asset_tags(
        self,
        *,
        asset_id: UUID,
        tag_ids: list[UUID],
        conn: BaseDBAsyncClient | None = None,
    ) -> None:
        # Replace links with the given set (idempotent).
        target = set(tag_ids)
        raw_rows = await self.using_db(AssetTagLinkRecord.filter(asset_id=asset_id), conn).values_list(
            "tag_id", flat=True
        )
        existing: set[UUID] = set()
        for r in raw_rows:
            value = r[0] if isinstance(r, tuple) else r
            if value is None:
                continue
            existing.add(value if isinstance(value, UUID) else UUID(str(value)))

        to_delete = list(existing - target)
        to_add = list(target - existing)

        if to_delete:
            await self.using_db(AssetTagLinkRecord.filter(asset_id=asset_id, tag_id__in=to_delete), conn).delete()
        for tag_id in to_add:
            await AssetTagLinkRecord.create(asset_id=asset_id, tag_id=tag_id, **self._using_db_kwargs(conn))

    async def get_folder(
        self,
        *,
        scope: AssetScope,
        folder_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> AssetFolderRecord | None:
        return await AssetFolderRecord.get_or_none(
            id=folder_id, **scope_filter_kwargs(scope), **self._using_db_kwargs(conn)
        )

    async def folder_has_children(
        self,
        *,
        scope: AssetScope,
        folder_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> bool:
        return await self.using_db(
            AssetFolderRecord.filter(parent_id=folder_id, **scope_filter_kwargs(scope)), conn
        ).exists()

    async def folder_has_assets(
        self,
        *,
        scope: AssetScope,
        folder_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> bool:
        return await self.using_db(
            AssetRecord.filter(deleted_at=None, folder_id=folder_id, **scope_filter_kwargs(scope)),
            conn,
        ).exists()

    async def delete_folder(
        self,
        *,
        scope: AssetScope,
        folder_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> None:
        await self.using_db(AssetFolderRecord.filter(id=folder_id, **scope_filter_kwargs(scope)), conn).delete()

    async def move_assets_in_folder(
        self,
        *,
        scope: AssetScope,
        from_folder_id: UUID,
        to_folder_id: UUID | None,
        updated_at,
        conn: BaseDBAsyncClient | None = None,
    ) -> int:
        return int(
            await self.using_db(
                AssetRecord.filter(
                    deleted_at=None,
                    folder_id=from_folder_id,
                    **scope_filter_kwargs(scope),
                ),
                conn,
            ).update(folder_id=to_folder_id, updated_at=updated_at)
        )

    async def move_child_folders(
        self,
        *,
        scope: AssetScope,
        from_folder_id: UUID,
        to_parent_id: UUID | None,
        updated_at,
        conn: BaseDBAsyncClient | None = None,
    ) -> int:
        return int(
            await self.using_db(
                AssetFolderRecord.filter(
                    parent_id=from_folder_id,
                    **scope_filter_kwargs(scope),
                ),
                conn,
            ).update(parent_id=to_parent_id, updated_at=updated_at)
        )

    async def collect_descendant_folder_ids(
        self,
        *,
        scope: AssetScope,
        root_folder_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> list[UUID]:
        # We intentionally do this in Python (single query) to keep DB/storage agnostic.
        rows = await self.using_db(AssetFolderRecord.filter(**scope_filter_kwargs(scope)), conn).values(
            "id", "parent_id"
        )
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
        conn: BaseDBAsyncClient | None = None,
    ) -> AssetFolderRecord:
        return await AssetFolderRecord.create(
            name=name,
            parent_id=parent_id,
            description=description,
            sort_order=sort_order,
            **scope_filter_kwargs(scope),
            **self._using_db_kwargs(conn),
        )

    async def save_folder_updates(
        self,
        folder: AssetFolderRecord,
        *,
        updates: dict,
        conn: BaseDBAsyncClient | None = None,
    ) -> AssetFolderRecord:
        for key, value in updates.items():
            setattr(folder, key, value)
        await folder.save(**self._using_db_kwargs(conn))
        return folder

    async def save_asset_updates(
        self,
        asset: AssetRecord,
        *,
        updates: dict,
        conn: BaseDBAsyncClient | None = None,
    ) -> AssetRecord:
        for key, value in updates.items():
            setattr(asset, key, value)
        await asset.save(**self._using_db_kwargs(conn))
        return asset

    async def bulk_update_assets_folder(
        self,
        *,
        scope: AssetScope,
        asset_ids: list[UUID],
        folder_id: UUID | None,
        updated_at,
        conn: BaseDBAsyncClient | None = None,
    ) -> int:
        if not asset_ids:
            return 0
        return int(
            await self.using_db(
                AssetRecord.filter(deleted_at=None, id__in=list(asset_ids), **scope_filter_kwargs(scope)),
                conn,
            ).update(
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
        conn: BaseDBAsyncClient | None = None,
    ) -> int:
        if not asset_ids:
            return 0
        return int(
            await self.using_db(
                AssetRecord.filter(deleted_at=None, id__in=list(asset_ids), **scope_filter_kwargs(scope)),
                conn,
            ).update(
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
        conn: BaseDBAsyncClient | None = None,
    ) -> int:
        if not asset_ids:
            return 0
        if not updates:
            return 0
        payload = dict(updates)
        payload["updated_at"] = updated_at
        return int(
            await self.using_db(
                AssetRecord.filter(deleted_at=None, id__in=list(asset_ids), **scope_filter_kwargs(scope)),
                conn,
            ).update(**payload)
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
