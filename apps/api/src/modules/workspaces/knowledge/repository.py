from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.expressions import Q
from tortoise.functions import Count

from src.models.knowledge.knowledge_base import KnowledgeAccessPolicyRecord, KnowledgeBaseRecord
from src.models.knowledge.knowledge_source import KnowledgeSourceRecord
from src.models.knowledge.knowledge_source_version import (
    KnowledgeSourceVersionRecord,
    KnowledgeSourceVersionStateRecord,
)
from src.modules.tenancy.database import TenantScopedRepository
from src.modules.tenancy.schema import TenantContext


class WorkspaceKnowledgeRepository(TenantScopedRepository):
    def __init__(self, tenant_context: TenantContext) -> None:
        super().__init__(tenant_context)

    async def list_bases(
        self,
        *,
        workspace_id: UUID,
        limit: int,
        cursor: UUID | None,
        query: str | None,
        status: str | None,
        locale: str | None,
    ) -> tuple[tuple[KnowledgeBaseRecord, ...], UUID | None]:
        async with self.connection() as conn:
            queryset = KnowledgeBaseRecord.filter(workspace_id=workspace_id).using_db(conn)
            if query:
                queryset = queryset.filter(
                    Q(name__icontains=query) | Q(description__icontains=query) | Q(default_locale__icontains=query)
                )
            if status:
                queryset = queryset.filter(status=status)
            if locale:
                queryset = queryset.filter(default_locale=locale)
            if cursor is not None:
                cursor_record = (
                    await KnowledgeBaseRecord
                    .filter(
                        workspace_id=workspace_id,
                        id=cursor,
                    )
                    .using_db(conn)
                    .first()
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

    async def source_counts(
        self,
        *,
        workspace_id: UUID,
        knowledge_base_ids: Sequence[UUID],
        conn: BaseDBAsyncClient | None = None,
    ) -> dict[UUID, tuple[int, int]]:
        if not knowledge_base_ids:
            return {}
        async with self.connection(conn) as tenant_conn:
            rows = await (
                KnowledgeSourceRecord
                .filter(workspace_id=workspace_id, knowledge_base_id__in=knowledge_base_ids)
                .using_db(tenant_conn)
                .group_by("knowledge_base_id")
                .annotate(
                    source_count=Count("id"),
                    ready_source_count=Count("id", _filter=Q(status="ready")),
                )
                .values("knowledge_base_id", "source_count", "ready_source_count")
            )
            return {
                UUID(str(row["knowledge_base_id"])): (
                    int(row["source_count"]),
                    int(row["ready_source_count"]),
                )
                for row in rows
            }

    async def get_base(
        self,
        *,
        workspace_id: UUID,
        knowledge_base_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> KnowledgeBaseRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await KnowledgeBaseRecord
                .filter(
                    workspace_id=workspace_id,
                    id=knowledge_base_id,
                )
                .using_db(tenant_conn)
                .first()
            )

    async def get_base_for_update(
        self,
        *,
        workspace_id: UUID,
        knowledge_base_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> KnowledgeBaseRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await KnowledgeBaseRecord
                .filter(
                    workspace_id=workspace_id,
                    id=knowledge_base_id,
                )
                .using_db(tenant_conn)
                .select_for_update()
                .first()
            )

    async def get_base_by_idempotency_key(
        self,
        *,
        workspace_id: UUID,
        idempotency_key: str,
        conn: BaseDBAsyncClient,
    ) -> KnowledgeBaseRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await KnowledgeBaseRecord
                .filter(
                    workspace_id=workspace_id,
                    request_idempotency_key=idempotency_key,
                )
                .using_db(tenant_conn)
                .first()
            )

    async def active_base_name_exists(
        self,
        *,
        workspace_id: UUID,
        normalized_name: str,
        exclude_id: UUID | None,
        conn: BaseDBAsyncClient,
    ) -> bool:
        async with self.connection(conn) as tenant_conn:
            queryset = KnowledgeBaseRecord.filter(
                workspace_id=workspace_id,
                normalized_name=normalized_name,
            ).using_db(tenant_conn)
            if exclude_id is not None:
                queryset = queryset.exclude(id=exclude_id)
            return await queryset.exists()

    async def create_base(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> KnowledgeBaseRecord:
        async with self.connection(conn) as tenant_conn:
            return await KnowledgeBaseRecord.create(using_db=tenant_conn, **values)

    async def save_base(
        self,
        *,
        record: KnowledgeBaseRecord,
        update_fields: Sequence[str],
        conn: BaseDBAsyncClient,
    ) -> None:
        async with self.connection(conn) as tenant_conn:
            await record.save(using_db=tenant_conn, update_fields=[*update_fields, "updated_at"])

    async def create_policy(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> KnowledgeAccessPolicyRecord:
        async with self.connection(conn) as tenant_conn:
            return await KnowledgeAccessPolicyRecord.create(using_db=tenant_conn, **values)

    async def get_current_policy(
        self,
        *,
        workspace_id: UUID,
        knowledge_base_id: UUID,
        policy_revision: int,
        conn: BaseDBAsyncClient | None = None,
    ) -> KnowledgeAccessPolicyRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await KnowledgeAccessPolicyRecord
                .filter(
                    workspace_id=workspace_id,
                    knowledge_base_id=knowledge_base_id,
                    policy_revision=policy_revision,
                )
                .using_db(tenant_conn)
                .first()
            )

    async def list_sources(
        self,
        *,
        workspace_id: UUID,
        knowledge_base_id: UUID,
        limit: int,
        cursor: UUID | None,
        kind: str | None,
        status: str | None,
        freshness: str | None,
    ) -> tuple[tuple[KnowledgeSourceRecord, ...], UUID | None]:
        async with self.connection() as conn:
            queryset = KnowledgeSourceRecord.filter(
                workspace_id=workspace_id,
                knowledge_base_id=knowledge_base_id,
            ).using_db(conn)
            if kind:
                queryset = queryset.filter(source_kind=kind)
            if status:
                queryset = queryset.filter(status=status)
            if freshness:
                queryset = queryset.filter(serving_freshness=freshness)
            if cursor is not None:
                cursor_record = (
                    await KnowledgeSourceRecord
                    .filter(
                        workspace_id=workspace_id,
                        knowledge_base_id=knowledge_base_id,
                        id=cursor,
                    )
                    .using_db(conn)
                    .first()
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

    async def get_source(
        self,
        *,
        workspace_id: UUID,
        knowledge_base_id: UUID,
        source_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> KnowledgeSourceRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await KnowledgeSourceRecord
                .filter(
                    workspace_id=workspace_id,
                    knowledge_base_id=knowledge_base_id,
                    id=source_id,
                )
                .using_db(tenant_conn)
                .first()
            )

    async def get_source_for_update(
        self,
        *,
        workspace_id: UUID,
        knowledge_base_id: UUID,
        source_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> KnowledgeSourceRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await KnowledgeSourceRecord
                .filter(
                    workspace_id=workspace_id,
                    knowledge_base_id=knowledge_base_id,
                    id=source_id,
                )
                .using_db(tenant_conn)
                .select_for_update()
                .first()
            )

    async def get_source_by_idempotency_key(
        self,
        *,
        workspace_id: UUID,
        idempotency_key: str,
        conn: BaseDBAsyncClient,
    ) -> KnowledgeSourceRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await KnowledgeSourceRecord
                .filter(
                    workspace_id=workspace_id,
                    request_idempotency_key=idempotency_key,
                )
                .using_db(tenant_conn)
                .first()
            )

    async def create_source(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> KnowledgeSourceRecord:
        async with self.connection(conn) as tenant_conn:
            return await KnowledgeSourceRecord.create(using_db=tenant_conn, **values)

    async def save_source(
        self,
        *,
        record: KnowledgeSourceRecord,
        update_fields: Sequence[str],
        conn: BaseDBAsyncClient,
    ) -> None:
        async with self.connection(conn) as tenant_conn:
            await record.save(using_db=tenant_conn, update_fields=[*update_fields, "updated_at"])

    async def list_versions(
        self,
        *,
        workspace_id: UUID,
        source_id: UUID,
        limit: int,
        cursor: UUID | None,
    ) -> tuple[tuple[KnowledgeSourceVersionRecord, ...], UUID | None]:
        async with self.connection() as conn:
            queryset = KnowledgeSourceVersionRecord.filter(
                workspace_id=workspace_id,
                source_id=source_id,
            ).using_db(conn)
            if cursor is not None:
                cursor_record = (
                    await KnowledgeSourceVersionRecord
                    .filter(
                        workspace_id=workspace_id,
                        source_id=source_id,
                        id=cursor,
                    )
                    .using_db(conn)
                    .first()
                )
                if cursor_record is None:
                    return (), None
                queryset = queryset.filter(version_number__lt=cursor_record.version_number)
            rows = tuple(
                await queryset.select_related("operational_state").order_by("-version_number", "-id").limit(limit + 1)
            )
            next_cursor = rows[limit - 1].id if len(rows) > limit else None
            return rows[:limit], next_cursor

    async def get_version(
        self,
        *,
        workspace_id: UUID,
        source_id: UUID,
        version_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> KnowledgeSourceVersionRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await KnowledgeSourceVersionRecord
                .filter(
                    workspace_id=workspace_id,
                    source_id=source_id,
                    id=version_id,
                )
                .using_db(tenant_conn)
                .select_related("operational_state")
                .first()
            )

    async def get_version_by_idempotency_key(
        self,
        *,
        source_id: UUID,
        idempotency_key: str,
        conn: BaseDBAsyncClient,
    ) -> KnowledgeSourceVersionRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await KnowledgeSourceVersionRecord
                .filter(
                    source_id=source_id,
                    request_idempotency_key=idempotency_key,
                )
                .using_db(tenant_conn)
                .select_related("operational_state")
                .first()
            )

    async def get_version_by_content_hash(
        self,
        *,
        source_id: UUID,
        normalized_content_hash: str,
        conn: BaseDBAsyncClient,
    ) -> KnowledgeSourceVersionRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await KnowledgeSourceVersionRecord
                .filter(
                    source_id=source_id,
                    normalized_content_hash=normalized_content_hash,
                )
                .using_db(tenant_conn)
                .select_related("operational_state")
                .first()
            )

    async def next_version_number(self, *, source_id: UUID, conn: BaseDBAsyncClient) -> int:
        async with self.connection(conn) as tenant_conn:
            latest = (
                await KnowledgeSourceVersionRecord
                .filter(source_id=source_id)
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
    ) -> KnowledgeSourceVersionRecord:
        async with self.connection(conn) as tenant_conn:
            return await KnowledgeSourceVersionRecord.create(using_db=tenant_conn, **values)

    async def create_version_state(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> KnowledgeSourceVersionStateRecord:
        async with self.connection(conn) as tenant_conn:
            return await KnowledgeSourceVersionStateRecord.create(using_db=tenant_conn, **values)

    async def bind_version_job_on_create(
        self,
        *,
        record: KnowledgeSourceVersionRecord,
        job_id: UUID,
        correlation_id: str,
        conn: BaseDBAsyncClient,
    ) -> None:
        if record.provenance_job_id is not None or record.correlation_id is not None:
            raise RuntimeError("Knowledge source version Job provenance is already bound")
        record.provenance_job_id = job_id
        record.correlation_id = correlation_id
        async with self.connection(conn) as tenant_conn:
            await record.save(
                update_fields=("provenance_job_id", "correlation_id"),
                using_db=tenant_conn,
            )
