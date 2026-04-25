from __future__ import annotations

from uuid import UUID

from src.models.system.setting import SettingRecord
from src.modules.tenancy.database import TenantScopedRepository
from src.modules.tenancy.schema import TenantContext


class ProjectContentViewsRepository(TenantScopedRepository):
    def __init__(self, tenant_context: TenantContext) -> None:
        super().__init__(tenant_context)

    async def get_setting(
        self,
        *,
        scope_type: str,
        scope_id: UUID,
        namespace: str,
    ) -> SettingRecord | None:
        async with self.connection() as conn:
            return await SettingRecord.get_or_none(
                scope_type=scope_type,
                scope_id=scope_id,
                namespace=namespace,
                using_db=conn,
            )

    async def save_setting(
        self,
        *,
        scope_type: str,
        scope_id: UUID,
        namespace: str,
        value: dict | None,
        updated_by: UUID,
    ) -> SettingRecord | None:
        async with self.connection() as conn:
            record = await SettingRecord.get_or_none(
                scope_type=scope_type,
                scope_id=scope_id,
                namespace=namespace,
                using_db=conn,
            )
            if record is None:
                if value is None:
                    return None
                return await SettingRecord.create(
                    scope_type=scope_type,
                    scope_id=scope_id,
                    namespace=namespace,
                    value=value,
                    updated_by=updated_by,
                    using_db=conn,
                )

            record.value = value
            record_like = record
            record_like_typed = record_like  # keep local alias for protocol cast-free assignment
            record_like_typed.updated_by = updated_by
            await record.save(update_fields=["value", "updated_by", "updated_at"], using_db=conn)
            return record
