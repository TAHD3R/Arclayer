from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.expressions import Q

from src.models.skills.skill_installation import SkillInstallationRecord
from src.models.skills.skill_version import SkillValidationResultRecord, SkillVersionRecord
from src.modules.tenancy.database import TenantScopedRepository
from src.modules.tenancy.schema import TenantContext


class WorkspaceSkillLifecycleRepository(TenantScopedRepository):
    def __init__(self, tenant_context: TenantContext) -> None:
        super().__init__(tenant_context)

    async def get_validation_by_idempotency_key(
        self,
        *,
        version_id: UUID,
        idempotency_key: str,
        conn: BaseDBAsyncClient,
    ) -> SkillValidationResultRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await SkillValidationResultRecord
                .filter(
                    skill_version_id=version_id,
                    request_idempotency_key=idempotency_key,
                )
                .using_db(tenant_conn)
                .first()
            )

    async def get_validation(
        self,
        *,
        workspace_id: UUID,
        version_id: UUID,
        finding_hash: str,
        conn: BaseDBAsyncClient | None = None,
    ) -> SkillValidationResultRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await SkillValidationResultRecord
                .filter(
                    workspace_id=workspace_id,
                    skill_version_id=version_id,
                    finding_hash=finding_hash,
                )
                .using_db(tenant_conn)
                .order_by("-created_at", "-id")
                .first()
            )

    async def list_validations(
        self,
        *,
        workspace_id: UUID,
        version_id: UUID,
    ) -> tuple[SkillValidationResultRecord, ...]:
        async with self.connection() as conn:
            return tuple(
                await SkillValidationResultRecord
                .filter(workspace_id=workspace_id, skill_version_id=version_id)
                .using_db(conn)
                .order_by("-created_at", "-id")
            )

    async def get_latest_validation(
        self,
        *,
        workspace_id: UUID,
        version_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> SkillValidationResultRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await SkillValidationResultRecord
                .filter(workspace_id=workspace_id, skill_version_id=version_id)
                .using_db(tenant_conn)
                .order_by("-created_at", "-id")
                .first()
            )

    async def create_validation(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> SkillValidationResultRecord:
        async with self.connection(conn) as tenant_conn:
            return await SkillValidationResultRecord.create(using_db=tenant_conn, **values)

    async def save_version_status(
        self,
        *,
        version: SkillVersionRecord,
        conn: BaseDBAsyncClient,
    ) -> None:
        async with self.connection(conn) as tenant_conn:
            await version.save(using_db=tenant_conn, update_fields=("status", "updated_at"))

    async def list_installations(
        self,
        *,
        workspace_id: UUID,
        limit: int,
        cursor: UUID | None,
        status: str | None,
    ) -> tuple[tuple[SkillInstallationRecord, ...], UUID | None]:
        async with self.connection() as conn:
            queryset = SkillInstallationRecord.filter(workspace_id=workspace_id).using_db(conn)
            if status:
                queryset = queryset.filter(status=status)
            if cursor is not None:
                cursor_record = await self.get_installation(
                    workspace_id=workspace_id,
                    installation_id=cursor,
                    conn=conn,
                )
                if cursor_record is None:
                    return (), None
                queryset = queryset.filter(
                    Q(updated_at__lt=cursor_record.updated_at)
                    | Q(updated_at=cursor_record.updated_at, id__lt=cursor_record.id)
                )
            rows = tuple(await queryset.order_by("-updated_at", "-id").limit(limit + 1))
            next_cursor = rows[limit - 1].id if len(rows) > limit else None
            return rows[:limit], next_cursor

    async def get_installation(
        self,
        *,
        workspace_id: UUID,
        installation_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> SkillInstallationRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await SkillInstallationRecord
                .filter(workspace_id=workspace_id, id=installation_id)
                .using_db(tenant_conn)
                .first()
            )

    async def get_installation_for_update(
        self,
        *,
        workspace_id: UUID,
        installation_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> SkillInstallationRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await SkillInstallationRecord
                .filter(workspace_id=workspace_id, id=installation_id)
                .using_db(tenant_conn)
                .select_for_update()
                .first()
            )

    async def get_installation_by_idempotency_key(
        self,
        *,
        workspace_id: UUID,
        idempotency_key: str,
        conn: BaseDBAsyncClient | None = None,
    ) -> SkillInstallationRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await SkillInstallationRecord
                .filter(
                    workspace_id=workspace_id,
                    request_idempotency_key=idempotency_key,
                )
                .using_db(tenant_conn)
                .first()
            )

    async def get_installation_by_package(
        self,
        *,
        workspace_id: UUID,
        package_scope: str,
        package_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> SkillInstallationRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await SkillInstallationRecord
                .filter(
                    workspace_id=workspace_id,
                    package_scope=package_scope,
                    package_id=package_id,
                )
                .using_db(tenant_conn)
                .first()
            )

    async def get_installations_by_packages(
        self,
        *,
        workspace_id: UUID,
        package_scope: str,
        package_ids: Sequence[UUID],
        conn: BaseDBAsyncClient | None = None,
    ) -> tuple[SkillInstallationRecord, ...]:
        if not package_ids:
            return ()
        async with self.connection(conn) as tenant_conn:
            return tuple(
                await SkillInstallationRecord
                .filter(
                    workspace_id=workspace_id,
                    package_scope=package_scope,
                    package_id__in=package_ids,
                )
                .using_db(tenant_conn)
                .order_by("package_id", "id")
            )

    async def create_installation(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> SkillInstallationRecord:
        async with self.connection(conn) as tenant_conn:
            return await SkillInstallationRecord.create(using_db=tenant_conn, **values)

    async def save_installation(
        self,
        *,
        installation: SkillInstallationRecord,
        update_fields: Sequence[str],
        conn: BaseDBAsyncClient,
    ) -> None:
        async with self.connection(conn) as tenant_conn:
            await installation.save(
                using_db=tenant_conn,
                update_fields=(*update_fields, "updated_at"),
            )

    async def delete_installation(
        self,
        *,
        installation: SkillInstallationRecord,
        conn: BaseDBAsyncClient,
    ) -> None:
        async with self.connection(conn) as tenant_conn:
            await installation.delete(using_db=tenant_conn)
