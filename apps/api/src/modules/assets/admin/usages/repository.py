from __future__ import annotations

from uuid import UUID

from tortoise.queryset import QuerySet

from apps.api.src.models.assets.asset_usage import AssetUsageRecord
from apps.api.src.modules.assets.scope import AssetScope, scope_filter_kwargs


class AdminAssetUsagesRepository:
    def query_usages_by_asset(self, *, scope: AssetScope, asset_id: UUID) -> QuerySet[AssetUsageRecord]:
        return AssetUsageRecord.filter(asset_id=asset_id, **scope_filter_kwargs(scope)).order_by("-created_at")

    async def list_usages_by_asset(self, *, scope: AssetScope, asset_id: UUID) -> list[AssetUsageRecord]:
        return await self.query_usages_by_asset(scope=scope, asset_id=asset_id).all()

    async def get_usage_by_ref(
        self,
        *,
        scope: AssetScope,
        entity_type: str,
        entity_id: str,
        field_key: str,
    ) -> AssetUsageRecord | None:
        return await AssetUsageRecord.get_or_none(
            entity_type=entity_type,
            entity_id=entity_id,
            field_key=field_key,
            **scope_filter_kwargs(scope),
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
    ) -> AssetUsageRecord:
        existing = await self.get_usage_by_ref(
            scope=scope,
            entity_type=entity_type,
            entity_id=entity_id,
            field_key=field_key,
        )
        if existing is None:
            return await AssetUsageRecord.create(
                asset_id=asset_id,
                purpose=purpose,
                entity_type=entity_type,
                entity_id=entity_id,
                field_key=field_key,
                created_by_user_id=created_by_user_id,
                **scope_filter_kwargs(scope),
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
            await existing.save(update_fields=["asset_id", "purpose", "updated_at"])
        return existing

    async def delete_usage_by_ref(
        self,
        *,
        scope: AssetScope,
        entity_type: str,
        entity_id: str,
        field_key: str,
    ) -> bool:
        deleted = await AssetUsageRecord.filter(
            entity_type=entity_type,
            entity_id=entity_id,
            field_key=field_key,
            **scope_filter_kwargs(scope),
        ).delete()
        return deleted > 0
