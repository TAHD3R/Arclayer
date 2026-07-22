from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.expressions import Q
from tortoise.functions import Count

from src.models.design_systems.design_system import (
    DesignSystemRecord,
    WorkspaceDesignSystemDefaultCommandRecord,
    WorkspaceDesignSystemDefaultRecord,
)
from src.models.design_systems.design_system_version import (
    DesignSystemValidationResultRecord,
    DesignSystemVersionRecord,
    DesignSystemVersionStateRecord,
)
from src.modules.tenancy.database import TenantScopedRepository
from src.modules.tenancy.schema import TenantContext


class WorkspaceDesignSystemsRepository(TenantScopedRepository):
    def __init__(self, tenant_context: TenantContext) -> None:
        super().__init__(tenant_context)

    async def list_systems(
        self,
        *,
        workspace_id: UUID,
        limit: int,
        cursor: UUID | None,
        query: str | None,
    ) -> tuple[tuple[DesignSystemRecord, ...], UUID | None]:
        async with self.connection() as conn:
            queryset = DesignSystemRecord.filter(
                workspace_id=workspace_id,
                owner_kind="workspace",
                owning_project_id=None,
                status="active",
            ).using_db(conn)
            if query:
                queryset = queryset.filter(Q(name__icontains=query) | Q(description__icontains=query))
            if cursor is not None:
                cursor_record = await self.get_system(
                    workspace_id=workspace_id,
                    system_id=cursor,
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

    async def version_counts(
        self,
        *,
        workspace_id: UUID,
        system_ids: Sequence[UUID],
    ) -> dict[UUID, int]:
        if not system_ids:
            return {}
        async with self.connection() as conn:
            rows = await (
                DesignSystemVersionRecord
                .filter(
                    workspace_id=workspace_id,
                    design_system_id__in=system_ids,
                )
                .using_db(conn)
                .group_by("design_system_id")
                .annotate(version_count=Count("id"))
                .values("design_system_id", "version_count")
            )
        return {UUID(str(row["design_system_id"])): int(row["version_count"]) for row in rows}

    async def get_system(
        self,
        *,
        workspace_id: UUID,
        system_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> DesignSystemRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await DesignSystemRecord
                .filter(
                    workspace_id=workspace_id,
                    id=system_id,
                    owner_kind="workspace",
                    owning_project_id=None,
                )
                .using_db(tenant_conn)
                .first()
            )

    async def get_system_for_update(
        self,
        *,
        workspace_id: UUID,
        system_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> DesignSystemRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await DesignSystemRecord
                .filter(
                    workspace_id=workspace_id,
                    id=system_id,
                    owner_kind="workspace",
                    owning_project_id=None,
                )
                .using_db(tenant_conn)
                .select_for_update()
                .first()
            )

    async def lock_workspace_systems(
        self,
        *,
        workspace_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> tuple[DesignSystemRecord, ...]:
        async with self.connection(conn) as tenant_conn:
            return tuple(
                await DesignSystemRecord
                .filter(workspace_id=workspace_id, owner_kind="workspace", owning_project_id=None)
                .using_db(tenant_conn)
                .select_for_update()
                .order_by("id")
            )

    async def get_system_by_name(
        self,
        *,
        workspace_id: UUID,
        normalized_name: str,
        conn: BaseDBAsyncClient | None = None,
    ) -> DesignSystemRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await DesignSystemRecord
                .filter(workspace_id=workspace_id, normalized_name=normalized_name)
                .using_db(tenant_conn)
                .first()
            )

    async def get_system_by_idempotency_key(
        self,
        *,
        workspace_id: UUID,
        idempotency_key: str,
        conn: BaseDBAsyncClient | None = None,
    ) -> DesignSystemRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await DesignSystemRecord
                .filter(
                    workspace_id=workspace_id,
                    request_idempotency_key=idempotency_key,
                )
                .using_db(tenant_conn)
                .first()
            )

    async def create_system(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> DesignSystemRecord:
        async with self.connection(conn) as tenant_conn:
            return await DesignSystemRecord.create(using_db=tenant_conn, **values)

    async def save_system(
        self,
        *,
        record: DesignSystemRecord,
        update_fields: Sequence[str],
        conn: BaseDBAsyncClient,
    ) -> None:
        async with self.connection(conn) as tenant_conn:
            await record.save(using_db=tenant_conn, update_fields=(*update_fields, "updated_at"))

    async def list_versions(
        self,
        *,
        workspace_id: UUID,
        system_id: UUID,
        limit: int,
        cursor: UUID | None,
    ) -> tuple[tuple[DesignSystemVersionRecord, ...], UUID | None]:
        async with self.connection() as conn:
            queryset = DesignSystemVersionRecord.filter(
                workspace_id=workspace_id,
                design_system_id=system_id,
            ).using_db(conn)
            if cursor is not None:
                cursor_record = await self.get_version(
                    workspace_id=workspace_id,
                    system_id=system_id,
                    version_id=cursor,
                    conn=conn,
                )
                if cursor_record is None:
                    return (), None
                queryset = queryset.filter(
                    Q(version_number__lt=cursor_record.version_number)
                    | Q(version_number=cursor_record.version_number, id__lt=cursor_record.id)
                )
            rows = tuple(await queryset.order_by("-version_number", "-id").limit(limit + 1))
            next_cursor = rows[limit - 1].id if len(rows) > limit else None
            return rows[:limit], next_cursor

    async def get_latest_version(
        self,
        *,
        workspace_id: UUID,
        system_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> DesignSystemVersionRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await DesignSystemVersionRecord
                .filter(
                    workspace_id=workspace_id,
                    design_system_id=system_id,
                )
                .using_db(tenant_conn)
                .order_by("-version_number", "-id")
                .first()
            )

    async def get_version(
        self,
        *,
        workspace_id: UUID,
        system_id: UUID,
        version_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> DesignSystemVersionRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await DesignSystemVersionRecord
                .filter(
                    workspace_id=workspace_id,
                    design_system_id=system_id,
                    id=version_id,
                )
                .using_db(tenant_conn)
                .first()
            )

    async def get_version_by_idempotency_key(
        self,
        *,
        system_id: UUID,
        idempotency_key: str,
        conn: BaseDBAsyncClient,
    ) -> DesignSystemVersionRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await DesignSystemVersionRecord
                .filter(
                    design_system_id=system_id,
                    request_idempotency_key=idempotency_key,
                )
                .using_db(tenant_conn)
                .first()
            )

    async def create_version(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> DesignSystemVersionRecord:
        async with self.connection(conn) as tenant_conn:
            return await DesignSystemVersionRecord.create(using_db=tenant_conn, **values)

    async def get_version_state(
        self,
        *,
        workspace_id: UUID,
        version_id: UUID,
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> DesignSystemVersionStateRecord | None:
        async with self.connection(conn) as tenant_conn:
            queryset = DesignSystemVersionStateRecord.filter(
                workspace_id=workspace_id,
                design_system_version_id=version_id,
            ).using_db(tenant_conn)
            if for_update:
                queryset = queryset.select_for_update()
            return await queryset.first()

    async def version_states(
        self,
        *,
        workspace_id: UUID,
        version_ids: Sequence[UUID],
        conn: BaseDBAsyncClient | None = None,
    ) -> dict[UUID, DesignSystemVersionStateRecord]:
        if not version_ids:
            return {}
        async with self.connection(conn) as tenant_conn:
            rows = tuple(
                await DesignSystemVersionStateRecord.filter(
                    workspace_id=workspace_id,
                    design_system_version_id__in=version_ids,
                ).using_db(tenant_conn)
            )
        return {row.design_system_version_id: row for row in rows}

    async def create_version_state(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> DesignSystemVersionStateRecord:
        async with self.connection(conn) as tenant_conn:
            return await DesignSystemVersionStateRecord.create(using_db=tenant_conn, **values)

    async def save_version_state(
        self,
        *,
        record: DesignSystemVersionStateRecord,
        update_fields: Sequence[str],
        conn: BaseDBAsyncClient,
    ) -> None:
        async with self.connection(conn) as tenant_conn:
            await record.save(using_db=tenant_conn, update_fields=(*update_fields, "updated_at"))

    async def latest_validations(
        self,
        *,
        workspace_id: UUID,
        version_ids: Sequence[UUID],
        conn: BaseDBAsyncClient | None = None,
    ) -> dict[UUID, DesignSystemValidationResultRecord]:
        if not version_ids:
            return {}
        async with self.connection(conn) as tenant_conn:
            rows = tuple(
                await DesignSystemValidationResultRecord
                .filter(
                    workspace_id=workspace_id,
                    design_system_version_id__in=version_ids,
                    profile="foundation",
                )
                .using_db(tenant_conn)
                .order_by("design_system_version_id", "-created_at", "-id")
            )
        result: dict[UUID, DesignSystemValidationResultRecord] = {}
        for row in rows:
            result.setdefault(row.design_system_version_id, row)
        return result

    async def get_validation_by_idempotency_key(
        self,
        *,
        version_id: UUID,
        idempotency_key: str,
        conn: BaseDBAsyncClient,
    ) -> DesignSystemValidationResultRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await DesignSystemValidationResultRecord
                .filter(
                    design_system_version_id=version_id,
                    request_idempotency_key=idempotency_key,
                )
                .using_db(tenant_conn)
                .first()
            )

    async def create_validation(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> DesignSystemValidationResultRecord:
        async with self.connection(conn) as tenant_conn:
            return await DesignSystemValidationResultRecord.create(using_db=tenant_conn, **values)

    async def list_validations(
        self,
        *,
        workspace_id: UUID,
        version_id: UUID,
    ) -> tuple[DesignSystemValidationResultRecord, ...]:
        async with self.connection() as conn:
            return tuple(
                await DesignSystemValidationResultRecord
                .filter(
                    workspace_id=workspace_id,
                    design_system_version_id=version_id,
                )
                .using_db(conn)
                .order_by("-created_at", "-id")
            )

    async def get_latest_eligible_valid_version(
        self,
        *,
        workspace_id: UUID,
        system_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> DesignSystemVersionRecord | None:
        async with self.connection(conn) as tenant_conn:
            versions = tuple(
                await DesignSystemVersionRecord
                .filter(
                    workspace_id=workspace_id,
                    design_system_id=system_id,
                    lifecycle_state__status="valid",
                )
                .using_db(tenant_conn)
                .order_by("-version_number", "-id")
            )
        validations = await self.latest_validations(
            workspace_id=workspace_id,
            version_ids=tuple(version.id for version in versions),
            conn=conn,
        )
        for version in versions:
            validation = validations.get(version.id)
            if validation is not None and str(validation.status) == "valid":
                return version
        return None

    async def get_default(
        self,
        *,
        workspace_id: UUID,
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> WorkspaceDesignSystemDefaultRecord | None:
        async with self.connection(conn) as tenant_conn:
            queryset = WorkspaceDesignSystemDefaultRecord.filter(workspace_id=workspace_id).using_db(tenant_conn)
            if for_update:
                queryset = queryset.select_for_update()
            return await queryset.first()

    async def create_default(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> WorkspaceDesignSystemDefaultRecord:
        async with self.connection(conn) as tenant_conn:
            return await WorkspaceDesignSystemDefaultRecord.create(using_db=tenant_conn, **values)

    async def save_default(
        self,
        *,
        record: WorkspaceDesignSystemDefaultRecord,
        update_fields: Sequence[str],
        conn: BaseDBAsyncClient,
    ) -> None:
        async with self.connection(conn) as tenant_conn:
            await record.save(using_db=tenant_conn, update_fields=(*update_fields, "updated_at"))

    async def get_default_command(
        self,
        *,
        workspace_id: UUID,
        idempotency_key: str,
        conn: BaseDBAsyncClient | None = None,
    ) -> WorkspaceDesignSystemDefaultCommandRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await WorkspaceDesignSystemDefaultCommandRecord
                .filter(
                    workspace_id=workspace_id,
                    request_idempotency_key=idempotency_key,
                )
                .using_db(tenant_conn)
                .first()
            )

    async def create_default_command(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> WorkspaceDesignSystemDefaultCommandRecord:
        async with self.connection(conn) as tenant_conn:
            return await WorkspaceDesignSystemDefaultCommandRecord.create(using_db=tenant_conn, **values)
