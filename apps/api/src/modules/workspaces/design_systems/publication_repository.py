from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.models.design_systems.publication import DesignSystemArtifactRecord, DesignSystemPublicationRecord
from src.modules.tenancy.database import TenantScopedRepository
from src.modules.tenancy.schema import TenantContext


class DesignSystemPublicationRepository(TenantScopedRepository):
    def __init__(self, tenant_context: TenantContext) -> None:
        super().__init__(tenant_context)

    async def get_publication(
        self,
        *,
        workspace_id: UUID,
        system_id: UUID,
        version_id: UUID,
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> DesignSystemPublicationRecord | None:
        async with self.connection(conn) as tenant_conn:
            queryset = DesignSystemPublicationRecord.filter(
                workspace_id=workspace_id,
                design_system_id=system_id,
                design_system_version_id=version_id,
            ).using_db(tenant_conn)
            if for_update:
                queryset = queryset.select_for_update()
            return await queryset.first()

    async def get_publication_by_id(
        self,
        *,
        publication_id: UUID,
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> DesignSystemPublicationRecord | None:
        async with self.connection(conn) as tenant_conn:
            queryset = DesignSystemPublicationRecord.filter(id=publication_id).using_db(tenant_conn)
            if for_update:
                queryset = queryset.select_for_update()
            return await queryset.first()

    async def create_publication(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> DesignSystemPublicationRecord:
        async with self.connection(conn) as tenant_conn:
            return await DesignSystemPublicationRecord.create(using_db=tenant_conn, **values)

    async def save_publication(
        self,
        *,
        record: DesignSystemPublicationRecord,
        update_fields: Sequence[str],
        conn: BaseDBAsyncClient | None = None,
    ) -> None:
        async with self.connection(conn) as tenant_conn:
            await record.save(using_db=tenant_conn, update_fields=(*update_fields, "updated_at"))

    async def get_artifact_for_publication(
        self,
        *,
        publication_id: UUID,
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> DesignSystemArtifactRecord | None:
        async with self.connection(conn) as tenant_conn:
            queryset = DesignSystemArtifactRecord.filter(publication_id=publication_id).using_db(tenant_conn)
            if for_update:
                queryset = queryset.select_for_update()
            return await queryset.first()

    async def create_artifact(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> DesignSystemArtifactRecord:
        async with self.connection(conn) as tenant_conn:
            return await DesignSystemArtifactRecord.create(using_db=tenant_conn, **values)

    async def save_artifact(
        self,
        *,
        record: DesignSystemArtifactRecord,
        update_fields: Sequence[str],
        conn: BaseDBAsyncClient | None = None,
    ) -> None:
        async with self.connection(conn) as tenant_conn:
            await record.save(using_db=tenant_conn, update_fields=(*update_fields, "updated_at"))
