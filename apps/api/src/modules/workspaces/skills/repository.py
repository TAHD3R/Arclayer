from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.expressions import Q
from tortoise.functions import Count

from src.models.skills.skill_package import SkillPackageRecord
from src.models.skills.skill_version import SkillResourceRecord, SkillVersionRecord
from src.modules.tenancy.database import TenantScopedRepository
from src.modules.tenancy.schema import TenantContext


class WorkspaceSkillsRepository(TenantScopedRepository):
    def __init__(self, tenant_context: TenantContext) -> None:
        super().__init__(tenant_context)

    async def list_packages(
        self,
        *,
        workspace_id: UUID,
        limit: int,
        cursor: UUID | None,
        query: str | None,
        status: str | None,
    ) -> tuple[tuple[SkillPackageRecord, ...], UUID | None]:
        async with self.connection() as conn:
            queryset = SkillPackageRecord.filter(workspace_id=workspace_id).using_db(conn)
            if query:
                queryset = queryset.filter(
                    Q(display_name__icontains=query) | Q(description__icontains=query) | Q(slug__icontains=query)
                )
            if status:
                queryset = queryset.filter(status=status)
            if cursor is not None:
                cursor_record = await self.get_package(
                    workspace_id=workspace_id,
                    package_id=cursor,
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

    async def package_version_counts(
        self,
        *,
        workspace_id: UUID,
        package_ids: Sequence[UUID],
    ) -> dict[UUID, int]:
        if not package_ids:
            return {}
        async with self.connection() as conn:
            rows = await (
                SkillVersionRecord
                .filter(workspace_id=workspace_id, package_id__in=package_ids)
                .using_db(conn)
                .group_by("package_id")
                .annotate(version_count=Count("id"))
                .values("package_id", "version_count")
            )
        return {UUID(str(row["package_id"])): int(row["version_count"]) for row in rows}

    async def get_package(
        self,
        *,
        workspace_id: UUID,
        package_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> SkillPackageRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await SkillPackageRecord.filter(workspace_id=workspace_id, id=package_id).using_db(tenant_conn).first()
            )

    async def get_package_by_idempotency_key(
        self,
        *,
        workspace_id: UUID,
        idempotency_key: str,
        conn: BaseDBAsyncClient | None = None,
    ) -> SkillPackageRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await SkillPackageRecord
                .filter(
                    workspace_id=workspace_id,
                    request_idempotency_key=idempotency_key,
                )
                .using_db(tenant_conn)
                .first()
            )

    async def get_package_by_slug(
        self,
        *,
        workspace_id: UUID,
        normalized_slug: str,
        conn: BaseDBAsyncClient | None = None,
    ) -> SkillPackageRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await SkillPackageRecord
                .filter(
                    workspace_id=workspace_id,
                    normalized_slug=normalized_slug,
                )
                .using_db(tenant_conn)
                .first()
            )

    async def get_package_for_update(
        self,
        *,
        workspace_id: UUID,
        package_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> SkillPackageRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await SkillPackageRecord
                .filter(workspace_id=workspace_id, id=package_id)
                .using_db(tenant_conn)
                .select_for_update()
                .first()
            )

    async def create_package(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> SkillPackageRecord:
        async with self.connection(conn) as tenant_conn:
            return await SkillPackageRecord.create(using_db=tenant_conn, **values)

    async def save_package(
        self,
        *,
        package: SkillPackageRecord,
        update_fields: Sequence[str],
        conn: BaseDBAsyncClient,
    ) -> None:
        async with self.connection(conn) as tenant_conn:
            await package.save(using_db=tenant_conn, update_fields=(*update_fields, "updated_at"))

    async def list_versions(
        self,
        *,
        workspace_id: UUID,
        package_id: UUID,
        limit: int,
        cursor: UUID | None,
    ) -> tuple[tuple[SkillVersionRecord, ...], UUID | None]:
        async with self.connection() as conn:
            queryset = SkillVersionRecord.filter(
                workspace_id=workspace_id,
                package_id=package_id,
            ).using_db(conn)
            if cursor is not None:
                cursor_record = await self.get_version(
                    workspace_id=workspace_id,
                    package_id=package_id,
                    version_id=cursor,
                    conn=conn,
                )
                if cursor_record is None:
                    return (), None
                queryset = queryset.filter(version_number__lt=cursor_record.version_number)
            rows = tuple(await queryset.order_by("-version_number", "-id").limit(limit + 1))
            next_cursor = rows[limit - 1].id if len(rows) > limit else None
            return rows[:limit], next_cursor

    async def get_latest_version(
        self,
        *,
        workspace_id: UUID,
        package_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> SkillVersionRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await SkillVersionRecord
                .filter(workspace_id=workspace_id, package_id=package_id)
                .using_db(tenant_conn)
                .order_by("-version_number", "-id")
                .first()
            )

    async def get_latest_installable_version(
        self,
        *,
        workspace_id: UUID,
        package_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> SkillVersionRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await SkillVersionRecord
                .filter(
                    workspace_id=workspace_id,
                    package_id=package_id,
                    status__in=("valid", "warning"),
                )
                .using_db(tenant_conn)
                .order_by("-version_number", "-id")
                .first()
            )

    async def get_version(
        self,
        *,
        workspace_id: UUID,
        package_id: UUID,
        version_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> SkillVersionRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await SkillVersionRecord
                .filter(
                    workspace_id=workspace_id,
                    package_id=package_id,
                    id=version_id,
                )
                .using_db(tenant_conn)
                .first()
            )

    async def get_version_for_update(
        self,
        *,
        workspace_id: UUID,
        package_id: UUID,
        version_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> SkillVersionRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await SkillVersionRecord
                .filter(
                    workspace_id=workspace_id,
                    package_id=package_id,
                    id=version_id,
                )
                .using_db(tenant_conn)
                .select_for_update()
                .first()
            )

    async def get_version_by_idempotency_key(
        self,
        *,
        package_id: UUID,
        idempotency_key: str,
        conn: BaseDBAsyncClient,
    ) -> SkillVersionRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await SkillVersionRecord
                .filter(
                    package_id=package_id,
                    request_idempotency_key=idempotency_key,
                )
                .using_db(tenant_conn)
                .first()
            )

    async def next_version_number(self, *, package_id: UUID, conn: BaseDBAsyncClient) -> int:
        async with self.connection(conn) as tenant_conn:
            latest = (
                await SkillVersionRecord
                .filter(package_id=package_id)
                .using_db(tenant_conn)
                .order_by("-version_number")
                .first()
            )
            return 1 if latest is None else int(latest.version_number) + 1

    async def create_version(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> SkillVersionRecord:
        async with self.connection(conn) as tenant_conn:
            return await SkillVersionRecord.create(using_db=tenant_conn, **values)

    async def create_resources(
        self,
        *,
        values: Sequence[dict[str, object]],
        conn: BaseDBAsyncClient,
    ) -> tuple[SkillResourceRecord, ...]:
        async with self.connection(conn) as tenant_conn:
            records = [SkillResourceRecord(**row) for row in values]
            await SkillResourceRecord.bulk_create(records, using_db=tenant_conn)
            return tuple(records)

    async def list_resources(
        self,
        *,
        workspace_id: UUID,
        version_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> tuple[SkillResourceRecord, ...]:
        async with self.connection(conn) as tenant_conn:
            return tuple(
                await SkillResourceRecord
                .filter(workspace_id=workspace_id, skill_version_id=version_id)
                .using_db(tenant_conn)
                .order_by("normalized_path", "id")
            )
