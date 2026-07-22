from __future__ import annotations

from datetime import datetime
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonObject
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.storage.storage_profile import StorageProfile, StorageProfileRouteRevision


class StorageProfileRouteRepositoryInvariantError(RuntimeError):
    """Persisted storage-profile transaction evidence violates its DB contract."""


class StorageProfileRouteRepository(TortoiseORMRepository[StorageProfile]):
    """Persistence port for profile identity and immutable route revisions."""

    def __init__(self) -> None:
        super().__init__(StorageProfile)

    async def get_profile_for_update(
        self,
        *,
        profile_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> StorageProfile | None:
        return await StorageProfile.filter(id=profile_id).using_db(conn).select_for_update().first()

    async def get_profile_by_key_for_update(
        self,
        *,
        scope_type: str,
        scope_id: UUID,
        profile_key: str,
        conn: BaseDBAsyncClient,
    ) -> StorageProfile | None:
        return await (
            StorageProfile
            .filter(scope_type=scope_type, scope_id=scope_id, profile_key=profile_key)
            .using_db(conn)
            .select_for_update()
            .first()
        )

    async def create_profile(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> StorageProfile:
        return await self.create_record(StorageProfile, conn=conn, **values)

    async def insert_profile_if_absent(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> UUID:
        candidate = StorageProfile(**values)
        await StorageProfile.bulk_create(
            [candidate],
            ignore_conflicts=True,
            using_db=conn,
        )
        return candidate.id

    async def get_database_time(self, *, conn: BaseDBAsyncClient) -> datetime:
        rows = await conn.execute_query_dict("SELECT clock_timestamp() AS database_time")
        if len(rows) != 1:
            raise StorageProfileRouteRepositoryInvariantError(
                f"Expected one PostgreSQL clock row, received {len(rows)}"
            )
        database_time = rows[0].get("database_time")
        if not isinstance(database_time, datetime) or database_time.utcoffset() is None:
            raise StorageProfileRouteRepositoryInvariantError(
                "PostgreSQL clock_timestamp() must return a timezone-aware datetime"
            )
        return database_time

    async def get_route_revision(
        self,
        *,
        profile_id: UUID,
        revision_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> StorageProfileRouteRevision | None:
        return await StorageProfileRouteRevision.filter(id=revision_id, profile_id=profile_id).using_db(conn).first()

    async def list_route_revisions_by_ids(
        self,
        *,
        revision_ids: tuple[UUID, ...],
        conn: BaseDBAsyncClient,
    ) -> list[StorageProfileRouteRevision]:
        if not revision_ids:
            return []
        return await StorageProfileRouteRevision.filter(id__in=revision_ids).using_db(conn).order_by("id")

    async def get_route_revision_by_hash(
        self,
        *,
        profile_id: UUID,
        route_hash: str,
        conn: BaseDBAsyncClient,
    ) -> StorageProfileRouteRevision | None:
        return await (
            StorageProfileRouteRevision.filter(profile_id=profile_id, route_hash=route_hash).using_db(conn).first()
        )

    async def get_latest_route_revision(
        self,
        *,
        profile_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> StorageProfileRouteRevision | None:
        return await (
            StorageProfileRouteRevision
            .filter(profile_id=profile_id)
            .using_db(conn)
            .order_by("-revision_number", "-id")
            .first()
        )

    async def create_route_revision(
        self,
        *,
        profile_id: UUID,
        revision_number: int,
        route: JsonObject,
        route_hash: str,
        conn: BaseDBAsyncClient,
    ) -> StorageProfileRouteRevision:
        return await self.create_record(
            StorageProfileRouteRevision,
            conn=conn,
            profile_id=profile_id,
            revision_number=revision_number,
            route=route,
            route_hash=route_hash,
        )
