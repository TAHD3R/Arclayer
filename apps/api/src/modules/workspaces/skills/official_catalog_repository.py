from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from tortoise import connections
from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.expressions import Q

from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.skills.skill_package import SkillPackageRecord
from src.models.skills.skill_version import (
    SkillResourceRecord,
    SkillValidationResultRecord,
    SkillVersionRecord,
)

_CATALOG_SYNC_LOCK_NAMESPACE = "arclayer:official-skill-catalog:v1"


class OfficialSkillCatalogRepository(TortoiseORMRepository[SkillPackageRecord]):
    def __init__(self) -> None:
        super().__init__(SkillPackageRecord)

    @staticmethod
    def public_connection() -> BaseDBAsyncClient:
        return connections.get("default")

    def public_query(self, query, conn: BaseDBAsyncClient | None = None):
        return query.using_db(conn or self.public_connection())

    async def lock_catalog_sync(self, *, conn: BaseDBAsyncClient) -> None:
        await conn.execute_query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
            [_CATALOG_SYNC_LOCK_NAMESPACE],
        )

    async def list_packages(
        self,
        *,
        limit: int,
        cursor: UUID | None,
        query: str | None,
    ) -> tuple[tuple[SkillPackageRecord, ...], UUID | None]:
        conn = self.public_connection()
        queryset = self.public_query(_official_packages().filter(status="active"), conn)
        if query:
            queryset = queryset.filter(
                Q(display_name__icontains=query) | Q(description__icontains=query) | Q(slug__icontains=query)
            )
        if cursor is not None:
            cursor_record = await self.get_package(package_id=cursor, conn=conn)
            if cursor_record is None:
                return (), None
            queryset = queryset.filter(
                Q(updated_at__lt=cursor_record.updated_at)
                | Q(updated_at=cursor_record.updated_at, id__lt=cursor_record.id)
            )
        rows = tuple(await queryset.order_by("-updated_at", "-id").limit(limit + 1))
        next_cursor = rows[limit - 1].id if len(rows) > limit else None
        return rows[:limit], next_cursor

    async def get_package(
        self,
        *,
        package_id: UUID,
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> SkillPackageRecord | None:
        queryset = _official_packages().filter(id=package_id, status="active")
        if for_update:
            queryset = queryset.select_for_update()
        return await self.public_query(queryset, conn).first()

    async def get_package_by_stable_key(
        self,
        *,
        stable_key: str,
        conn: BaseDBAsyncClient,
    ) -> SkillPackageRecord | None:
        return await self.public_query(
            SkillPackageRecord.filter(workspace_id=None, stable_key=stable_key).select_for_update(),
            conn,
        ).first()

    async def list_all_packages_for_update(
        self,
        *,
        conn: BaseDBAsyncClient,
    ) -> tuple[SkillPackageRecord, ...]:
        return tuple(await self.public_query(_official_packages().select_for_update(), conn).order_by("id"))

    async def create_package(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> SkillPackageRecord:
        return await SkillPackageRecord.create(using_db=conn, **values)

    async def save_package(
        self,
        *,
        package: SkillPackageRecord,
        update_fields: Sequence[str],
        conn: BaseDBAsyncClient,
    ) -> None:
        await package.save(using_db=conn, update_fields=(*update_fields, "updated_at"))

    async def get_version(
        self,
        *,
        package_id: UUID,
        version_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> SkillVersionRecord | None:
        return await self.public_query(
            SkillVersionRecord.filter(
                workspace_id=None,
                package_id=package_id,
                id=version_id,
            ),
            conn,
        ).first()

    async def get_versions_by_ids(
        self,
        *,
        version_ids: Sequence[UUID],
    ) -> dict[UUID, SkillVersionRecord]:
        if not version_ids:
            return {}
        records = await self.public_query(SkillVersionRecord.filter(workspace_id=None, id__in=version_ids))
        return {record.id: record for record in records}

    async def get_version_by_checksum(
        self,
        *,
        package_id: UUID,
        package_checksum: str,
        conn: BaseDBAsyncClient,
    ) -> SkillVersionRecord | None:
        return await self.public_query(
            SkillVersionRecord.filter(
                workspace_id=None,
                package_id=package_id,
                package_checksum=package_checksum,
            ),
            conn,
        ).first()

    async def next_version_number(self, *, package_id: UUID, conn: BaseDBAsyncClient) -> int:
        latest = (
            await self
            .public_query(
                SkillVersionRecord.filter(package_id=package_id, workspace_id=None),
                conn,
            )
            .order_by("-version_number")
            .first()
        )
        return 1 if latest is None else latest.version_number + 1

    async def create_version(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> SkillVersionRecord:
        return await SkillVersionRecord.create(using_db=conn, **values)

    async def create_resources(
        self,
        *,
        values: Sequence[dict[str, object]],
        conn: BaseDBAsyncClient,
    ) -> tuple[SkillResourceRecord, ...]:
        records = [SkillResourceRecord(**row) for row in values]
        await SkillResourceRecord.bulk_create(records, using_db=conn)
        return tuple(records)

    async def list_resources(
        self,
        *,
        version_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> tuple[SkillResourceRecord, ...]:
        return tuple(
            await self.public_query(
                SkillResourceRecord.filter(workspace_id=None, skill_version_id=version_id),
                conn,
            ).order_by("normalized_path", "id")
        )

    async def create_validation(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> SkillValidationResultRecord:
        return await SkillValidationResultRecord.create(using_db=conn, **values)

    async def get_latest_validation(
        self,
        *,
        version_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> SkillValidationResultRecord | None:
        return (
            await self
            .public_query(
                SkillValidationResultRecord.filter(workspace_id=None, skill_version_id=version_id),
                conn,
            )
            .order_by("-created_at", "-id")
            .first()
        )

    async def get_latest_validations_by_version_ids(
        self,
        *,
        version_ids: Sequence[UUID],
    ) -> dict[UUID, SkillValidationResultRecord]:
        if not version_ids:
            return {}
        records = await self.public_query(
            SkillValidationResultRecord.filter(
                workspace_id=None,
                skill_version_id__in=version_ids,
            )
        ).order_by("skill_version_id", "-created_at", "-id")
        latest: dict[UUID, SkillValidationResultRecord] = {}
        for record in records:
            latest.setdefault(record.skill_version_id, record)
        return latest


def _official_packages():
    return SkillPackageRecord.filter(
        workspace_id=None,
        scope="system",
        source_kind="builtin",
        trust_level="official_verified",
    )
