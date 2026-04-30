from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.queryset import QuerySet

from src.models.assets.asset_usage import AssetUsageRecord
from src.modules.assets.scope import AssetScope, AssetScopeDatabaseRouter, scope_filter_kwargs
from src.modules.tenancy.schema import TenantContext


class AdminAssetUsagesRepository:
    def __init__(self, tenant_context: TenantContext | None = None) -> None:
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

    def query_usages_by_asset(
        self,
        *,
        scope: AssetScope,
        asset_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> QuerySet[AssetUsageRecord]:
        qs = AssetUsageRecord.filter(asset_id=asset_id, **scope_filter_kwargs(scope))
        if conn is not None:
            qs = qs.using_db(conn)
        return qs.order_by("-created_at")

    async def list_usages_by_asset(
        self,
        *,
        scope: AssetScope,
        asset_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> list[AssetUsageRecord]:
        return await self.query_usages_by_asset(scope=scope, asset_id=asset_id, conn=conn).all()

    async def get_usage_by_ref(
        self,
        *,
        scope: AssetScope,
        entity_type: str,
        entity_id: str,
        field_key: str,
        conn: BaseDBAsyncClient | None = None,
    ) -> AssetUsageRecord | None:
        kwargs = {"using_db": conn} if conn is not None else {}
        return await AssetUsageRecord.get_or_none(
            entity_type=entity_type,
            entity_id=entity_id,
            field_key=field_key,
            **scope_filter_kwargs(scope),
            **kwargs,
        )

    async def upsert_usage(
        self,
        *,
        scope: AssetScope,
        asset_id: UUID,
        purpose: str,
        entity_type: str,
        entity_id: str,
        field_key: str,
        created_by_user_id: UUID | None,
        conn: BaseDBAsyncClient | None = None,
    ) -> AssetUsageRecord:
        existing = await self.get_usage_by_ref(
            scope=scope,
            entity_type=entity_type,
            entity_id=entity_id,
            field_key=field_key,
            conn=conn,
        )
        if existing is None:
            kwargs = {"using_db": conn} if conn is not None else {}
            return await AssetUsageRecord.create(
                asset_id=asset_id,
                purpose=purpose,
                entity_type=entity_type,
                entity_id=entity_id,
                field_key=field_key,
                created_by_user_id=created_by_user_id,
                **scope_filter_kwargs(scope),
                **kwargs,
            )

        changed = False
        current_asset_id = getattr(existing, "asset_id", None)
        if current_asset_id != asset_id:
            existing.asset_id = asset_id
            changed = True
        if existing.purpose != purpose:
            existing.purpose = purpose
            changed = True

        # Only set created_by_user_id on creation to preserve "who configured first" audit intent.
        if changed:
            if conn is None:
                await existing.save(update_fields=["asset_id", "purpose", "updated_at"])
            else:
                await existing.save(update_fields=["asset_id", "purpose", "updated_at"], using_db=conn)
        return existing

    async def delete_usage_by_ref(
        self,
        *,
        scope: AssetScope,
        entity_type: str,
        entity_id: str,
        field_key: str,
        conn: BaseDBAsyncClient | None = None,
    ) -> bool:
        qs = AssetUsageRecord.filter(
            entity_type=entity_type,
            entity_id=entity_id,
            field_key=field_key,
            **scope_filter_kwargs(scope),
        )
        if conn is not None:
            qs = qs.using_db(conn)
        deleted = await qs.delete()
        return deleted > 0
