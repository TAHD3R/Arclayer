from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal, cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.expressions import Q
from tortoise.functions import Count

from src.core.exceptions import NotFound
from src.models.knowledge._enums import KnowledgeGuidanceRevisionStatus
from src.models.knowledge.guidance import (
    KnowledgeGuidanceCommandRecord,
    KnowledgeGuidanceLayerRecord,
    KnowledgeGuidancePreviewRecord,
    KnowledgeGuidanceReferenceRecord,
    KnowledgeGuidanceRevisionRecord,
)
from src.models.knowledge.knowledge_base import KnowledgeAccessPolicyRecord, KnowledgeBaseRecord
from src.models.knowledge.knowledge_source import KnowledgeSourceRecord
from src.models.knowledge.knowledge_source_version import (
    KnowledgeSourceVersionRecord,
    KnowledgeSourceVersionStateRecord,
)
from src.models.projects.project import ProjectRecord
from src.modules.tenancy.database import TenantScopedRepository
from src.modules.tenancy.schema import TenantContext

GuidanceUnavailableCode = Literal[
    "workspace_guidance_unpublished",
    "project_guidance_unpublished",
    "workspace_guidance_removed",
    "project_guidance_removed",
]


@dataclass(frozen=True, slots=True)
class GuidancePublishedRevision:
    """Immutable published guidance materialized for a runtime snapshot."""

    id: UUID
    revision_number: int
    content: str
    content_hash: str


@dataclass(frozen=True, slots=True)
class EffectiveGuidanceContext:
    """The single canonical precedence result for Workspace and Project guidance.

    A missing or unpublished layer is represented by an explicit unavailable code,
    never by fabricated content. A removed layer is likewise excluded from content
    and attached references while its immutable revision history remains intact.
    """

    workspace_layer_id: UUID | None
    project_layer_id: UUID | None
    workspace_published_revision: GuidancePublishedRevision | None
    project_published_revision: GuidancePublishedRevision | None
    project_mode: Literal["supplement", "override"] | None
    precedence: tuple[Literal["workspace", "project"], ...]
    effective_content: str | None
    attached_knowledge_base_ids: tuple[UUID, ...]
    unavailable_codes: tuple[GuidanceUnavailableCode, ...]
    conflict_codes: tuple[Literal["project_override_hides_workspace"], ...]


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


class WorkspaceGuidanceRepository(TenantScopedRepository):
    def __init__(self, tenant_context: TenantContext) -> None:
        super().__init__(tenant_context)

    async def get_layer(
        self,
        *,
        workspace_id: UUID,
        scope_kind: str,
        scope_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> KnowledgeGuidanceLayerRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await KnowledgeGuidanceLayerRecord
                .filter(workspace_id=workspace_id, scope_kind=scope_kind, scope_id=scope_id)
                .using_db(tenant_conn)
                .first()
            )

    async def get_layer_for_update(
        self,
        *,
        workspace_id: UUID,
        scope_kind: str,
        scope_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> KnowledgeGuidanceLayerRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await KnowledgeGuidanceLayerRecord
                .filter(workspace_id=workspace_id, scope_kind=scope_kind, scope_id=scope_id)
                .using_db(tenant_conn)
                .select_for_update()
                .first()
            )

    async def create_layer(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> KnowledgeGuidanceLayerRecord:
        async with self.connection(conn) as tenant_conn:
            return await KnowledgeGuidanceLayerRecord.create(using_db=tenant_conn, **values)

    async def save_layer(
        self,
        *,
        record: KnowledgeGuidanceLayerRecord,
        update_fields: Sequence[str],
        conn: BaseDBAsyncClient,
    ) -> None:
        async with self.connection(conn) as tenant_conn:
            await record.save(using_db=tenant_conn, update_fields=[*update_fields, "updated_at"])

    async def project_exists(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> bool:
        async with self.connection(conn) as tenant_conn:
            return await ProjectRecord.filter(id=project_id, workspace_id=workspace_id).using_db(tenant_conn).exists()

    async def get_knowledge_base(
        self,
        *,
        workspace_id: UUID,
        knowledge_base_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> KnowledgeBaseRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await KnowledgeBaseRecord
                .filter(id=knowledge_base_id, workspace_id=workspace_id)
                .using_db(tenant_conn)
                .first()
            )

    async def get_revision(
        self,
        *,
        workspace_id: UUID,
        guidance_layer_id: UUID,
        revision_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> KnowledgeGuidanceRevisionRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await KnowledgeGuidanceRevisionRecord
                .filter(
                    id=revision_id,
                    workspace_id=workspace_id,
                    guidance_layer_id=guidance_layer_id,
                )
                .using_db(tenant_conn)
                .first()
            )

    async def get_revision_for_update(
        self,
        *,
        workspace_id: UUID,
        guidance_layer_id: UUID,
        revision_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> KnowledgeGuidanceRevisionRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await KnowledgeGuidanceRevisionRecord
                .filter(
                    id=revision_id,
                    workspace_id=workspace_id,
                    guidance_layer_id=guidance_layer_id,
                )
                .using_db(tenant_conn)
                .select_for_update()
                .first()
            )

    async def get_revision_by_idempotency_key(
        self,
        *,
        guidance_layer_id: UUID,
        idempotency_key: str,
        conn: BaseDBAsyncClient,
    ) -> KnowledgeGuidanceRevisionRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await KnowledgeGuidanceRevisionRecord
                .filter(guidance_layer_id=guidance_layer_id, request_idempotency_key=idempotency_key)
                .using_db(tenant_conn)
                .first()
            )

    async def list_revisions(
        self,
        *,
        workspace_id: UUID,
        guidance_layer_id: UUID,
        limit: int,
        cursor: UUID | None,
        conn: BaseDBAsyncClient | None = None,
    ) -> tuple[tuple[KnowledgeGuidanceRevisionRecord, ...], UUID | None]:
        async with self.connection(conn) as tenant_conn:
            queryset = KnowledgeGuidanceRevisionRecord.filter(
                workspace_id=workspace_id,
                guidance_layer_id=guidance_layer_id,
            ).using_db(tenant_conn)
            if cursor is not None:
                cursor_record = (
                    await KnowledgeGuidanceRevisionRecord
                    .filter(
                        id=cursor,
                        workspace_id=workspace_id,
                        guidance_layer_id=guidance_layer_id,
                    )
                    .using_db(tenant_conn)
                    .first()
                )
                if cursor_record is None:
                    return (), None
                queryset = queryset.filter(revision_number__lt=cursor_record.revision_number)
            rows = tuple(await queryset.order_by("-revision_number", "-id").limit(limit + 1))
            next_cursor = rows[limit - 1].id if len(rows) > limit else None
            return rows[:limit], next_cursor

    async def next_revision_number(self, *, guidance_layer_id: UUID, conn: BaseDBAsyncClient) -> int:
        async with self.connection(conn) as tenant_conn:
            latest = (
                await KnowledgeGuidanceRevisionRecord
                .filter(guidance_layer_id=guidance_layer_id)
                .using_db(tenant_conn)
                .order_by("-revision_number")
                .first()
            )
            return 1 if latest is None else int(latest.revision_number) + 1

    async def create_revision(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> KnowledgeGuidanceRevisionRecord:
        async with self.connection(conn) as tenant_conn:
            return await KnowledgeGuidanceRevisionRecord.create(using_db=tenant_conn, **values)

    async def save_revision(
        self,
        *,
        record: KnowledgeGuidanceRevisionRecord,
        update_fields: Sequence[str],
        conn: BaseDBAsyncClient,
    ) -> None:
        async with self.connection(conn) as tenant_conn:
            await record.save(using_db=tenant_conn, update_fields=[*update_fields, "updated_at"])

    async def list_references(
        self,
        *,
        workspace_id: UUID,
        guidance_layer_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> tuple[KnowledgeGuidanceReferenceRecord, ...]:
        async with self.connection(conn) as tenant_conn:
            return tuple(
                await KnowledgeGuidanceReferenceRecord
                .filter(workspace_id=workspace_id, guidance_layer_id=guidance_layer_id)
                .using_db(tenant_conn)
                .order_by("created_at", "id")
            )

    async def get_reference(
        self,
        *,
        workspace_id: UUID,
        guidance_layer_id: UUID,
        knowledge_base_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> KnowledgeGuidanceReferenceRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await KnowledgeGuidanceReferenceRecord
                .filter(
                    workspace_id=workspace_id,
                    guidance_layer_id=guidance_layer_id,
                    knowledge_base_id=knowledge_base_id,
                )
                .using_db(tenant_conn)
                .first()
            )

    async def create_reference(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> KnowledgeGuidanceReferenceRecord:
        async with self.connection(conn) as tenant_conn:
            return await KnowledgeGuidanceReferenceRecord.create(using_db=tenant_conn, **values)

    async def delete_reference(
        self,
        *,
        record: KnowledgeGuidanceReferenceRecord,
        conn: BaseDBAsyncClient,
    ) -> None:
        async with self.connection(conn) as tenant_conn:
            await record.delete(using_db=tenant_conn)

    async def source_counts_for_references(
        self,
        *,
        workspace_id: UUID,
        guidance_layer_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> tuple[int, int, int]:
        async with self.connection(conn) as tenant_conn:
            references = tuple(
                await KnowledgeGuidanceReferenceRecord
                .filter(workspace_id=workspace_id, guidance_layer_id=guidance_layer_id)
                .using_db(tenant_conn)
                .values_list("knowledge_base_id", flat=True)
            )
            if not references:
                return 0, 0, 0
            rows = await (
                KnowledgeSourceRecord
                .filter(workspace_id=workspace_id, knowledge_base_id__in=references)
                .using_db(tenant_conn)
                .annotate(
                    source_count=Count("id"),
                    ready_source_count=Count("id", _filter=Q(status="ready")),
                )
                .values("source_count", "ready_source_count")
            )
            counts = rows[0] if rows else {"source_count": 0, "ready_source_count": 0}
            return len(references), int(counts["source_count"]), int(counts["ready_source_count"])

    async def count_project_layers(
        self,
        *,
        workspace_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> int:
        async with self.connection(conn) as tenant_conn:
            return (
                await KnowledgeGuidanceLayerRecord
                .filter(
                    workspace_id=workspace_id,
                    scope_kind="project",
                    removed_at__isnull=True,
                )
                .using_db(tenant_conn)
                .count()
            )

    async def get_preview_by_idempotency_key(
        self,
        *,
        guidance_layer_id: UUID,
        kind: str,
        idempotency_key: str,
        conn: BaseDBAsyncClient,
    ) -> KnowledgeGuidancePreviewRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await KnowledgeGuidancePreviewRecord
                .filter(
                    guidance_layer_id=guidance_layer_id,
                    kind=kind,
                    request_idempotency_key=idempotency_key,
                )
                .using_db(tenant_conn)
                .first()
            )

    async def get_preview_for_update(
        self,
        *,
        workspace_id: UUID,
        guidance_layer_id: UUID,
        preview_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> KnowledgeGuidancePreviewRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await KnowledgeGuidancePreviewRecord
                .filter(
                    id=preview_id,
                    workspace_id=workspace_id,
                    guidance_layer_id=guidance_layer_id,
                )
                .using_db(tenant_conn)
                .select_for_update()
                .first()
            )

    async def create_preview(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> KnowledgeGuidancePreviewRecord:
        async with self.connection(conn) as tenant_conn:
            return await KnowledgeGuidancePreviewRecord.create(using_db=tenant_conn, **values)

    async def save_preview(
        self,
        *,
        record: KnowledgeGuidancePreviewRecord,
        update_fields: Sequence[str],
        conn: BaseDBAsyncClient,
    ) -> None:
        async with self.connection(conn) as tenant_conn:
            await record.save(using_db=tenant_conn, update_fields=[*update_fields, "updated_at"])

    async def get_command(
        self,
        *,
        guidance_layer_id: UUID,
        kind: str,
        idempotency_key: str,
        conn: BaseDBAsyncClient,
    ) -> KnowledgeGuidanceCommandRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await KnowledgeGuidanceCommandRecord
                .filter(
                    guidance_layer_id=guidance_layer_id,
                    kind=kind,
                    request_idempotency_key=idempotency_key,
                )
                .using_db(tenant_conn)
                .first()
            )

    async def create_command(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> KnowledgeGuidanceCommandRecord:
        async with self.connection(conn) as tenant_conn:
            return await KnowledgeGuidanceCommandRecord.create(using_db=tenant_conn, **values)

    async def resolve_effective_context(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID | None,
        conn: BaseDBAsyncClient | None = None,
    ) -> EffectiveGuidanceContext:
        """Resolve the immutable guidance snapshot used by Product runtime work.

        Callers that need a run-consistent view pass their existing tenant
        transaction connection. This repository method owns precedence so runtime
        code cannot reimplement supplement/override or attachment semantics.
        """
        async with self.connection(conn) as tenant_conn:
            if project_id is not None and not await self.project_exists(
                workspace_id=workspace_id,
                project_id=project_id,
                conn=tenant_conn,
            ):
                raise NotFound("Project does not belong to Workspace", error="PROJECT_NOT_FOUND")

            workspace_layer = await self.get_layer(
                workspace_id=workspace_id,
                scope_kind="workspace",
                scope_id=workspace_id,
                conn=tenant_conn,
            )
            project_layer = (
                await self.get_layer(
                    workspace_id=workspace_id,
                    scope_kind="project",
                    scope_id=project_id,
                    conn=tenant_conn,
                )
                if project_id is not None
                else None
            )

            workspace_revision, workspace_unavailable = await self._published_snapshot(
                workspace_id=workspace_id,
                layer=workspace_layer,
                scope="workspace",
                conn=tenant_conn,
            )
            project_revision, project_unavailable = await self._published_snapshot(
                workspace_id=workspace_id,
                layer=project_layer,
                scope="project",
                conn=tenant_conn,
            )
            project_mode = self._project_mode(project_layer)
            unavailable_codes = tuple(
                code
                for code in (workspace_unavailable, project_unavailable if project_id is not None else None)
                if code is not None
            )

            if project_mode == "override" and project_revision is not None:
                project_reference_ids = await self._reference_ids(
                    workspace_id=workspace_id,
                    layer=project_layer,
                    conn=tenant_conn,
                )
                return EffectiveGuidanceContext(
                    workspace_layer_id=workspace_layer.id if workspace_layer is not None else None,
                    project_layer_id=project_layer.id if project_layer is not None else None,
                    workspace_published_revision=workspace_revision,
                    project_published_revision=project_revision,
                    project_mode=project_mode,
                    precedence=("project", "workspace"),
                    effective_content=project_revision.content,
                    attached_knowledge_base_ids=project_reference_ids,
                    unavailable_codes=unavailable_codes,
                    conflict_codes=(("project_override_hides_workspace",) if workspace_revision is not None else ()),
                )

            workspace_reference_ids = await self._reference_ids(
                workspace_id=workspace_id,
                layer=workspace_layer if workspace_revision is not None else None,
                conn=tenant_conn,
            )
            project_reference_ids = await self._reference_ids(
                workspace_id=workspace_id,
                layer=project_layer if project_revision is not None else None,
                conn=tenant_conn,
            )
            return EffectiveGuidanceContext(
                workspace_layer_id=workspace_layer.id if workspace_layer is not None else None,
                project_layer_id=project_layer.id if project_layer is not None else None,
                workspace_published_revision=workspace_revision,
                project_published_revision=project_revision,
                project_mode=project_mode,
                precedence=("workspace", "project") if project_id is not None else ("workspace",),
                effective_content=_join_effective_content(
                    workspace_revision.content if workspace_revision is not None else None,
                    project_revision.content if project_revision is not None else None,
                ),
                attached_knowledge_base_ids=_dedupe_ids(workspace_reference_ids + project_reference_ids),
                unavailable_codes=unavailable_codes,
                conflict_codes=(),
            )

    async def _published_snapshot(
        self,
        *,
        workspace_id: UUID,
        layer: KnowledgeGuidanceLayerRecord | None,
        scope: Literal["workspace", "project"],
        conn: BaseDBAsyncClient,
    ) -> tuple[GuidancePublishedRevision | None, GuidanceUnavailableCode | None]:
        if layer is None:
            return None, _guidance_unavailable_code(scope=scope, state="unpublished")
        if layer.removed_at is not None:
            return None, _guidance_unavailable_code(scope=scope, state="removed")
        if layer.published_revision_id is None:
            return None, _guidance_unavailable_code(scope=scope, state="unpublished")
        revision = await self.get_revision(
            workspace_id=workspace_id,
            guidance_layer_id=layer.id,
            revision_id=layer.published_revision_id,
            conn=conn,
        )
        if revision is None or revision.status != KnowledgeGuidanceRevisionStatus.PUBLISHED:
            raise RuntimeError("KNOWLEDGE_GUIDANCE_PUBLISHED_POINTER_INVARIANT_VIOLATION")
        return (
            GuidancePublishedRevision(
                id=revision.id,
                revision_number=revision.revision_number,
                content=revision.content,
                content_hash=revision.content_hash,
            ),
            None,
        )

    async def _reference_ids(
        self,
        *,
        workspace_id: UUID,
        layer: KnowledgeGuidanceLayerRecord | None,
        conn: BaseDBAsyncClient,
    ) -> tuple[UUID, ...]:
        if layer is None:
            return ()
        records = await self.list_references(
            workspace_id=workspace_id,
            guidance_layer_id=layer.id,
            conn=conn,
        )
        return tuple(record.knowledge_base_id for record in records)

    @staticmethod
    def _project_mode(
        layer: KnowledgeGuidanceLayerRecord | None,
    ) -> Literal["supplement", "override"] | None:
        if layer is None:
            return None
        if str(layer.scope_kind) == "workspace":
            if layer.project_mode is not None:
                raise RuntimeError("KNOWLEDGE_GUIDANCE_WORKSPACE_MODE_INVARIANT_VIOLATION")
            return None
        if layer.project_mode is None:
            raise RuntimeError("KNOWLEDGE_GUIDANCE_PROJECT_MODE_INVARIANT_VIOLATION")
        mode = str(layer.project_mode)
        if mode not in {"supplement", "override"}:
            raise RuntimeError("KNOWLEDGE_GUIDANCE_PROJECT_MODE_INVARIANT_VIOLATION")
        return cast(Literal["supplement", "override"], mode)


def _join_effective_content(workspace_content: str | None, project_content: str | None) -> str | None:
    contents = tuple(content for content in (workspace_content, project_content) if content)
    return "\n\n".join(contents) if contents else None


def _dedupe_ids(values: tuple[UUID, ...]) -> tuple[UUID, ...]:
    return tuple(dict.fromkeys(values))


def _guidance_unavailable_code(
    *,
    scope: Literal["workspace", "project"],
    state: Literal["removed", "unpublished"],
) -> GuidanceUnavailableCode:
    if scope == "workspace" and state == "removed":
        return "workspace_guidance_removed"
    if scope == "workspace":
        return "workspace_guidance_unpublished"
    if state == "removed":
        return "project_guidance_removed"
    return "project_guidance_unpublished"
