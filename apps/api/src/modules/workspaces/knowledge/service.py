from __future__ import annotations

import hashlib
import json
import unicodedata
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any, Literal, NoReturn, Protocol
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import Settings, get_settings
from src.core.exceptions import Conflict, NotFound
from src.core.services import BaseService
from src.models.knowledge._enums import (
    KnowledgeBaseStatus,
    KnowledgeGuidanceCommandKind,
    KnowledgeGuidancePreviewKind,
    KnowledgeGuidancePreviewStatus,
    KnowledgeGuidanceRevisionStatus,
    KnowledgeGuidanceScope,
    KnowledgeIngestionMode,
    KnowledgeProjectGuidanceMode,
    KnowledgeSourceKind,
    KnowledgeSourceStatus,
    KnowledgeVersionStatus,
)
from src.models.knowledge.guidance import (
    KnowledgeGuidanceCommandRecord,
    KnowledgeGuidanceLayerRecord,
    KnowledgeGuidancePreviewRecord,
    KnowledgeGuidanceRevisionRecord,
)
from src.models.knowledge.knowledge_base import KnowledgeAccessPolicyRecord, KnowledgeBaseRecord
from src.models.knowledge.knowledge_source import KnowledgeSourceRecord
from src.models.knowledge.knowledge_source_version import KnowledgeSourceVersionRecord
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.jobs.registry import JobTypeRegistry
from src.modules.jobs.schema import BackgroundJobCreate, BackgroundJobCreateResult
from src.modules.workspaces.knowledge.ingestion_contract import (
    KNOWLEDGE_SOURCE_INGEST_JOB_TYPE,
    KNOWLEDGE_SOURCE_INGEST_JOB_TYPE_VERSION,
    KnowledgeSourceIngestJobInput,
    KnowledgeSourceIngestJobTarget,
    validate_knowledge_source_ingest_target_input,
)
from src.modules.workspaces.knowledge.projection import (
    project_base_detail,
    project_base_summary,
    project_effective_guidance_preview,
    project_guidance_layer,
    project_guidance_revision,
    project_source,
    project_version,
)
from src.modules.workspaces.knowledge.repository import (
    WorkspaceGuidanceRepository,
    WorkspaceKnowledgeRepository,
)
from src.modules.workspaces.knowledge.schema import (
    KnowledgeAccessPolicy,
    KnowledgeBaseCreateRequest,
    KnowledgeBaseDetailOut,
    KnowledgeBaseSummaryOut,
    KnowledgeBaseUpdateRequest,
    KnowledgeCursorPage,
    KnowledgeGuidanceDraftSaveRequest,
    KnowledgeGuidanceEffectivePreviewOut,
    KnowledgeGuidanceImpactOut,
    KnowledgeGuidanceLayerOut,
    KnowledgeGuidancePreviewApplyRequest,
    KnowledgeGuidancePreviewOut,
    KnowledgeGuidancePublishRequest,
    KnowledgeGuidanceReferenceAttachRequest,
    KnowledgeGuidanceReferenceDetachRequest,
    KnowledgeGuidanceRemovePreviewRequest,
    KnowledgeGuidanceRestorePreviewRequest,
    KnowledgeGuidanceRevisionOut,
    KnowledgeSourceCreateRequest,
    KnowledgeSourceIngestionAcceptedOut,
    KnowledgeSourceIngestionCreateRequest,
    KnowledgeSourceOut,
    KnowledgeSourceUpdateRequest,
    KnowledgeSourceVersionOut,
    ManualKnowledgeVersionCreateRequest,
    UrlKnowledgeLocator,
    WorkspaceKnowledgeCapabilitiesOut,
)
from src.modules.workspaces.knowledge.source_revision import build_url_source_revision
from src.modules.workspaces.knowledge.untrusted_url import (
    KnowledgeUrlPolicyError,
    normalize_untrusted_http_url,
)

ActivityWriter = Callable[..., Awaitable[object]]


class BackgroundJobCreator(Protocol):
    registry: JobTypeRegistry

    async def create_job_in_transaction(
        self,
        *,
        command: BackgroundJobCreate,
        conn: BaseDBAsyncClient,
    ) -> BackgroundJobCreateResult: ...

    async def publish_created_after_commit(self, result: BackgroundJobCreateResult) -> None: ...


KNOWLEDGE_BASE_CREATED = "workspace.knowledge.base.created"
KNOWLEDGE_BASE_UPDATED = "workspace.knowledge.base.updated"
KNOWLEDGE_SOURCE_CREATED = "workspace.knowledge.source.created"
KNOWLEDGE_SOURCE_UPDATED = "workspace.knowledge.source.updated"
KNOWLEDGE_SOURCE_VERSION_CREATED = "workspace.knowledge.source_version.created"


def workspace_knowledge_capabilities(
    settings: Settings | None = None,
) -> WorkspaceKnowledgeCapabilitiesOut:
    resolved_settings = settings or get_settings()
    external_ingestion_available = (
        resolved_settings.knowledge_source_fetch.enabled and resolved_settings.knowledge_index.enabled
    )
    return WorkspaceKnowledgeCapabilitiesOut(
        manual_sources_available=True,
        external_ingestion_available=external_ingestion_available,
        indexing_available=resolved_settings.knowledge_index.enabled,
        # This rollout cannot advertise retrieval before its ACL, citation, and
        # Agent Run pinning acceptance gate has been verified.
        retrieval_available=False,
        immutable_source_versions=True,
        supported_source_kinds=("manual", "url") if external_ingestion_available else ("manual",),
    )


class WorkspaceKnowledgeService(BaseService):
    def __init__(
        self,
        *,
        repository: WorkspaceKnowledgeRepository,
        jobs: BackgroundJobCreator,
        settings: Settings | None = None,
        activity_writer: ActivityWriter = write_required_activity_event,
    ) -> None:
        super().__init__(settings)
        self._repository = repository
        self._jobs = jobs
        self._activity_writer = activity_writer

    async def list_bases(
        self,
        *,
        workspace_id: UUID,
        limit: int,
        cursor: UUID | None,
        query: str | None,
        status: str | None,
        locale: str | None,
    ) -> KnowledgeCursorPage[KnowledgeBaseSummaryOut]:
        records, next_cursor = await self._repository.list_bases(
            workspace_id=workspace_id,
            limit=limit,
            cursor=cursor,
            query=_optional_text(query),
            status=status,
            locale=_optional_text(locale),
        )
        counts = await self._repository.source_counts(
            workspace_id=workspace_id,
            knowledge_base_ids=tuple(record.id for record in records),
        )
        return KnowledgeCursorPage[KnowledgeBaseSummaryOut](
            items=tuple(
                project_base_summary(
                    record,
                    source_count=counts.get(record.id, (0, 0))[0],
                    ready_source_count=counts.get(record.id, (0, 0))[1],
                )
                for record in records
            ),
            next_cursor=next_cursor,
        )

    async def get_base(self, *, workspace_id: UUID, knowledge_base_id: UUID) -> KnowledgeBaseDetailOut:
        record = await self._require_base(workspace_id=workspace_id, knowledge_base_id=knowledge_base_id)
        policy = await self._require_policy(record=record)
        counts = await self._repository.source_counts(
            workspace_id=workspace_id,
            knowledge_base_ids=(record.id,),
        )
        source_count, ready_count = counts.get(record.id, (0, 0))
        return project_base_detail(
            record,
            policy=policy,
            source_count=source_count,
            ready_source_count=ready_count,
        )

    async def create_base(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        actor_user_id: UUID,
        idempotency_key: str,
        payload: KnowledgeBaseCreateRequest,
    ) -> KnowledgeBaseDetailOut:
        key = _require_idempotency_key(idempotency_key)
        fingerprint = _fingerprint({"workspaceId": str(workspace_id), **payload.model_dump(mode="json")})
        normalized_name = _normalize_name(payload.name)
        async with self.tx() as conn:
            existing = await self._repository.get_base_by_idempotency_key(
                workspace_id=workspace_id,
                idempotency_key=key,
                conn=conn,
            )
            if existing is not None:
                _require_matching_fingerprint(existing.request_fingerprint, fingerprint)
                record = existing
            else:
                if await self._repository.active_base_name_exists(
                    workspace_id=workspace_id,
                    normalized_name=normalized_name,
                    exclude_id=None,
                    conn=conn,
                ):
                    raise Conflict("Knowledge Base name already exists", error="KNOWLEDGE_BASE_NAME_EXISTS")
                record = await self._repository.create_base(
                    values={
                        "workspace_id": workspace_id,
                        "name": payload.name,
                        "normalized_name": normalized_name,
                        "description": payload.description,
                        "default_locale": payload.default_locale,
                        "status": KnowledgeBaseStatus.ACTIVE,
                        "current_policy_revision": 1,
                        "metadata_revision": 1,
                        "created_by_user_id": actor_user_id,
                        "updated_by_user_id": actor_user_id,
                        "request_idempotency_key": key,
                        "request_fingerprint": fingerprint,
                    },
                    conn=conn,
                )
                await self._create_policy(
                    record=record,
                    policy=payload.access_policy,
                    revision=1,
                    actor_user_id=actor_user_id,
                    conn=conn,
                )
                await self._write_activity(
                    event_name=KNOWLEDGE_BASE_CREATED,
                    organization_id=organization_id,
                    workspace_id=workspace_id,
                    actor_user_id=actor_user_id,
                    entity_type="knowledge_base",
                    entity_id=record.id,
                    properties={"status": "active", "policyRevision": 1},
                    conn=conn,
                )
        return await self.get_base(workspace_id=workspace_id, knowledge_base_id=record.id)

    async def update_base(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        knowledge_base_id: UUID,
        actor_user_id: UUID,
        payload: KnowledgeBaseUpdateRequest,
    ) -> KnowledgeBaseDetailOut:
        async with self.tx() as conn:
            record = await self._repository.get_base_for_update(
                workspace_id=workspace_id,
                knowledge_base_id=knowledge_base_id,
                conn=conn,
            )
            if record is None:
                _raise_not_found()
            _require_revision(record.metadata_revision, payload.expected_revision)
            changed = await self._apply_base_update(
                record=record,
                payload=payload,
                actor_user_id=actor_user_id,
                conn=conn,
            )
            await self._repository.save_base(record=record, update_fields=changed, conn=conn)
            await self._write_activity(
                event_name=KNOWLEDGE_BASE_UPDATED,
                organization_id=organization_id,
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                entity_type="knowledge_base",
                entity_id=record.id,
                properties={"fields": changed, "metadataRevision": record.metadata_revision},
                conn=conn,
            )
        return await self.get_base(workspace_id=workspace_id, knowledge_base_id=knowledge_base_id)

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
    ) -> KnowledgeCursorPage[KnowledgeSourceOut]:
        await self._require_base(workspace_id=workspace_id, knowledge_base_id=knowledge_base_id)
        records, next_cursor = await self._repository.list_sources(
            workspace_id=workspace_id,
            knowledge_base_id=knowledge_base_id,
            limit=limit,
            cursor=cursor,
            kind=kind,
            status=status,
            freshness=freshness,
        )
        return KnowledgeCursorPage[KnowledgeSourceOut](
            items=tuple(project_source(record) for record in records),
            next_cursor=next_cursor,
        )

    async def get_source(
        self,
        *,
        workspace_id: UUID,
        knowledge_base_id: UUID,
        source_id: UUID,
    ) -> KnowledgeSourceOut:
        return project_source(
            await self._require_source(
                workspace_id=workspace_id,
                knowledge_base_id=knowledge_base_id,
                source_id=source_id,
            )
        )

    async def create_source(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        knowledge_base_id: UUID,
        actor_user_id: UUID,
        idempotency_key: str,
        payload: KnowledgeSourceCreateRequest,
    ) -> KnowledgeSourceOut:
        if payload.locator.kind not in {KnowledgeSourceKind.MANUAL, KnowledgeSourceKind.URL}:
            raise Conflict(
                "External Knowledge ingestion is not available in this rollout",
                error="KNOWLEDGE_SOURCE_KIND_UNAVAILABLE",
            )
        if payload.locator.kind == KnowledgeSourceKind.URL and not self.settings.knowledge_source_fetch.enabled:
            raise Conflict(
                "URL Knowledge ingestion is disabled by deployment policy",
                error="KNOWLEDGE_SOURCE_KIND_UNAVAILABLE",
            )
        normalized_payload = _normalize_source_create_request(payload)
        key = _require_idempotency_key(idempotency_key)
        fingerprint = _fingerprint({
            "workspaceId": str(workspace_id),
            "knowledgeBaseId": str(knowledge_base_id),
            **normalized_payload.model_dump(mode="json"),
        })
        async with self.tx() as conn:
            base = await self._repository.get_base_for_update(
                workspace_id=workspace_id,
                knowledge_base_id=knowledge_base_id,
                conn=conn,
            )
            if base is None:
                _raise_not_found()
            if base.status != KnowledgeBaseStatus.ACTIVE:
                raise Conflict("Knowledge Base is not active", error="KNOWLEDGE_BASE_NOT_ACTIVE")
            existing = await self._repository.get_source_by_idempotency_key(
                workspace_id=workspace_id,
                idempotency_key=key,
                conn=conn,
            )
            if existing is not None:
                _require_matching_fingerprint(existing.request_fingerprint, fingerprint)
                if existing.knowledge_base_id != knowledge_base_id:
                    raise Conflict("Idempotency key has different scope", error="KNOWLEDGE_IDEMPOTENCY_CONFLICT")
                record = existing
            else:
                record = await self._repository.create_source(
                    values={
                        "workspace_id": workspace_id,
                        "knowledge_base_id": knowledge_base_id,
                        "source_kind": KnowledgeSourceKind(normalized_payload.locator.kind),
                        "display_name": normalized_payload.display_name,
                        "locale": normalized_payload.locale,
                        "status": KnowledgeSourceStatus.PENDING,
                        "locator": normalized_payload.locator.model_dump(mode="json", by_alias=True),
                        "metadata_revision": 1,
                        "created_by_user_id": actor_user_id,
                        "updated_by_user_id": actor_user_id,
                        "request_idempotency_key": key,
                        "request_fingerprint": fingerprint,
                    },
                    conn=conn,
                )
                await self._write_activity(
                    event_name=KNOWLEDGE_SOURCE_CREATED,
                    organization_id=organization_id,
                    workspace_id=workspace_id,
                    actor_user_id=actor_user_id,
                    entity_type="knowledge_source",
                    entity_id=record.id,
                    properties={
                        "kind": normalized_payload.locator.kind,
                        "knowledgeBaseId": str(knowledge_base_id),
                    },
                    conn=conn,
                )
        return project_source(record)

    async def create_source_ingestion(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        knowledge_base_id: UUID,
        source_id: UUID,
        actor_user_id: UUID,
        idempotency_key: str,
        payload: KnowledgeSourceIngestionCreateRequest,
    ) -> KnowledgeSourceIngestionAcceptedOut:
        if not self.settings.knowledge_source_fetch.enabled:
            raise Conflict(
                "URL Knowledge ingestion is disabled by deployment policy",
                error="KNOWLEDGE_SOURCE_KIND_UNAVAILABLE",
            )
        key = _require_idempotency_key(idempotency_key)
        job_result: BackgroundJobCreateResult | None = None
        async with self.tx() as conn:
            source = await self._repository.get_source_for_update(
                workspace_id=workspace_id,
                knowledge_base_id=knowledge_base_id,
                source_id=source_id,
                conn=conn,
            )
            if source is None:
                _raise_not_found()
            if source.source_kind != KnowledgeSourceKind.URL:
                raise Conflict(
                    "Source kind does not support external ingestion", error="KNOWLEDGE_SOURCE_KIND_IMMUTABLE"
                )
            locator = _require_url_locator(source.locator)
            revision = build_url_source_revision(
                source_id=source.id,
                normalized_url=str(locator.url),
                locale=source.locale,
            )
            _require_url_ingestion_mode(source=source, mode=payload.ingestion_mode)
            definition = self._jobs.registry.require(
                job_type=KNOWLEDGE_SOURCE_INGEST_JOB_TYPE,
                job_type_version=KNOWLEDGE_SOURCE_INGEST_JOB_TYPE_VERSION,
            )
            target = KnowledgeSourceIngestJobTarget(
                workspace_id=workspace_id,
                knowledge_base_id=knowledge_base_id,
                source_id=source.id,
                candidate_version_id=None,
                entity_id=source.id,
            )
            input_reference = KnowledgeSourceIngestJobInput(
                source_kind="url",
                ingestion_mode=payload.ingestion_mode,
                source_revision=revision,
                source_url=str(locator.url),
                parser_name="web-text",
            )
            validate_knowledge_source_ingest_target_input(target, input_reference)
            actor_context = self.resolve_actor_context(
                actor_user_id=actor_user_id,
                workspace_id=workspace_id,
                source="workspace-knowledge",
            )
            job_result = await self._jobs.create_job_in_transaction(
                command=BackgroundJobCreate(
                    job_type=definition.job_type,
                    job_type_version=definition.job_type_version,
                    task_name=definition.task_name,
                    workload_class=definition.workload_class,
                    authority_mode=definition.authority_mode,
                    workspace_id=workspace_id,
                    actor_user_id=actor_user_id,
                    target_descriptor=target.model_dump(mode="json", by_alias=True),
                    input_reference=input_reference.model_dump(mode="json", by_alias=True),
                    idempotency_key=f"source:{source.id}:ingestion:{key}",
                    source_revision=revision,
                    correlation_id=actor_context.trace_id or f"knowledge-source:{source.id}",
                    trace_id=actor_context.trace_id,
                    retry_class=definition.retry_class,
                    max_attempts=definition.max_attempts,
                    timeout_seconds=definition.timeout_seconds,
                    lease_seconds=definition.lease_seconds,
                    heartbeat_seconds=definition.heartbeat_seconds,
                    status_key=definition.initial_status_key,
                ),
                conn=conn,
            )
            if job_result.created:
                if source.status in {
                    KnowledgeSourceStatus.FETCHING,
                    KnowledgeSourceStatus.PARSING,
                    KnowledgeSourceStatus.INDEXING,
                }:
                    raise Conflict("Knowledge source ingestion is already active", error="KNOWLEDGE_INGESTION_CONFLICT")
                source.status = KnowledgeSourceStatus.FETCHING
                source.safe_error_code = None
                await self._repository.save_source(
                    record=source,
                    update_fields=("status", "safe_error_code"),
                    conn=conn,
                )
                await self._write_activity(
                    event_name="workspace.knowledge.source.ingestion_requested",
                    organization_id=organization_id,
                    workspace_id=workspace_id,
                    actor_user_id=actor_user_id,
                    entity_type="knowledge_source",
                    entity_id=source.id,
                    properties={"mode": payload.ingestion_mode, "jobId": str(job_result.job.id)},
                    conn=conn,
                )
        if job_result is None:
            raise RuntimeError("Knowledge ingestion transaction did not produce a Job")
        await self._jobs.publish_created_after_commit(job_result)
        return KnowledgeSourceIngestionAcceptedOut(
            source_id=source_id,
            job_id=job_result.job.id,
            ingestion_mode=payload.ingestion_mode,
        )

    async def update_source(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        knowledge_base_id: UUID,
        source_id: UUID,
        actor_user_id: UUID,
        payload: KnowledgeSourceUpdateRequest,
    ) -> KnowledgeSourceOut:
        async with self.tx() as conn:
            record = await self._repository.get_source_for_update(
                workspace_id=workspace_id,
                knowledge_base_id=knowledge_base_id,
                source_id=source_id,
                conn=conn,
            )
            if record is None:
                _raise_not_found()
            _require_revision(record.metadata_revision, payload.expected_revision)
            changed = _apply_source_update(record=record, payload=payload, actor_user_id=actor_user_id)
            await self._repository.save_source(record=record, update_fields=changed, conn=conn)
            await self._write_activity(
                event_name=KNOWLEDGE_SOURCE_UPDATED,
                organization_id=organization_id,
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                entity_type="knowledge_source",
                entity_id=record.id,
                properties={"fields": changed, "metadataRevision": record.metadata_revision},
                conn=conn,
            )
        return project_source(record)

    async def list_versions(
        self,
        *,
        workspace_id: UUID,
        knowledge_base_id: UUID,
        source_id: UUID,
        limit: int,
        cursor: UUID | None,
    ) -> KnowledgeCursorPage[KnowledgeSourceVersionOut]:
        await self._require_source(
            workspace_id=workspace_id,
            knowledge_base_id=knowledge_base_id,
            source_id=source_id,
        )
        records, next_cursor = await self._repository.list_versions(
            workspace_id=workspace_id,
            source_id=source_id,
            limit=limit,
            cursor=cursor,
        )
        return KnowledgeCursorPage[KnowledgeSourceVersionOut](
            items=tuple(project_version(record) for record in records),
            next_cursor=next_cursor,
        )

    async def get_version(
        self,
        *,
        workspace_id: UUID,
        knowledge_base_id: UUID,
        source_id: UUID,
        version_id: UUID,
    ) -> KnowledgeSourceVersionOut:
        await self._require_source(
            workspace_id=workspace_id,
            knowledge_base_id=knowledge_base_id,
            source_id=source_id,
        )
        record = await self._repository.get_version(
            workspace_id=workspace_id,
            source_id=source_id,
            version_id=version_id,
        )
        if record is None:
            _raise_not_found()
        return project_version(record)

    async def create_manual_version(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        knowledge_base_id: UUID,
        source_id: UUID,
        actor_user_id: UUID,
        idempotency_key: str,
        payload: ManualKnowledgeVersionCreateRequest,
    ) -> KnowledgeSourceVersionOut:
        key = _require_idempotency_key(idempotency_key)
        normalized_content = _normalize_manual_content(payload.content)
        normalized_hash = _content_hash(normalized_content)
        fingerprint = _fingerprint({
            "sourceId": str(source_id),
            "contentHash": normalized_hash,
            "title": payload.title,
            "locale": payload.locale,
            "documentMetadata": payload.document_metadata,
        })
        ingestion_job_result: BackgroundJobCreateResult | None = None
        async with self.tx() as conn:
            source = await self._repository.get_source_for_update(
                workspace_id=workspace_id,
                knowledge_base_id=knowledge_base_id,
                source_id=source_id,
                conn=conn,
            )
            if source is None:
                _raise_not_found()
            _require_manual_version_allowed(source)
            record = await self._resolve_existing_version(
                source_id=source.id,
                idempotency_key=key,
                fingerprint=fingerprint,
                normalized_content_hash=normalized_hash,
                conn=conn,
            )
            if record is None:
                record = await self._create_manual_version(
                    source=source,
                    actor_user_id=actor_user_id,
                    idempotency_key=key,
                    fingerprint=fingerprint,
                    normalized_content=normalized_content,
                    normalized_hash=normalized_hash,
                    payload=payload,
                    conn=conn,
                )
                ingestion_job_result = await self._create_manual_ingestion_job(
                    record=record,
                    source=source,
                    knowledge_base_id=knowledge_base_id,
                    actor_user_id=actor_user_id,
                    conn=conn,
                )
                await self._write_activity(
                    event_name=KNOWLEDGE_SOURCE_VERSION_CREATED,
                    organization_id=organization_id,
                    workspace_id=workspace_id,
                    actor_user_id=actor_user_id,
                    entity_type="knowledge_source_version",
                    entity_id=record.id,
                    properties={
                        "knowledgeBaseId": str(knowledge_base_id),
                        "sourceId": str(source_id),
                        "versionNumber": record.version_number,
                        "status": "pending",
                    },
                    conn=conn,
                )
        if ingestion_job_result is not None:
            await self._jobs.publish_created_after_commit(ingestion_job_result)
        hydrated = await self._repository.get_version(
            workspace_id=workspace_id,
            source_id=source_id,
            version_id=record.id,
        )
        if hydrated is None:
            _raise_not_found()
        return project_version(hydrated)

    async def _create_manual_ingestion_job(
        self,
        *,
        record: KnowledgeSourceVersionRecord,
        source: KnowledgeSourceRecord,
        knowledge_base_id: UUID,
        actor_user_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> BackgroundJobCreateResult:
        definition = self._jobs.registry.require(
            job_type=KNOWLEDGE_SOURCE_INGEST_JOB_TYPE,
            job_type_version=KNOWLEDGE_SOURCE_INGEST_JOB_TYPE_VERSION,
        )
        target = KnowledgeSourceIngestJobTarget(
            workspace_id=source.workspace_id,
            knowledge_base_id=knowledge_base_id,
            source_id=source.id,
            candidate_version_id=record.id,
            entity_id=source.id,
        )
        input_reference = KnowledgeSourceIngestJobInput(
            source_kind="manual",
            ingestion_mode="initial",
            source_revision=record.normalized_content_hash,
            normalized_content_hash=record.normalized_content_hash,
            parser_name="manual-markdown",
        )
        validate_knowledge_source_ingest_target_input(target, input_reference)
        actor_context = self.resolve_actor_context(
            actor_user_id=actor_user_id,
            workspace_id=source.workspace_id,
            source="workspace-knowledge",
        )
        correlation_id = actor_context.trace_id or f"knowledge-version:{record.id}"
        result = await self._jobs.create_job_in_transaction(
            command=BackgroundJobCreate(
                job_type=definition.job_type,
                job_type_version=definition.job_type_version,
                task_name=definition.task_name,
                workload_class=definition.workload_class,
                authority_mode=definition.authority_mode,
                workspace_id=source.workspace_id,
                actor_user_id=actor_user_id,
                target_descriptor=target.model_dump(mode="json", by_alias=True),
                input_reference=input_reference.model_dump(mode="json", by_alias=True),
                idempotency_key=f"source:{source.id}:version:{record.id}:ingest:v1",
                source_revision=record.normalized_content_hash,
                correlation_id=correlation_id,
                trace_id=actor_context.trace_id,
                retry_class=definition.retry_class,
                max_attempts=definition.max_attempts,
                timeout_seconds=definition.timeout_seconds,
                lease_seconds=definition.lease_seconds,
                heartbeat_seconds=definition.heartbeat_seconds,
                status_key=definition.initial_status_key,
            ),
            conn=conn,
        )
        await self._repository.bind_version_job_on_create(
            record=record,
            job_id=result.job.id,
            correlation_id=correlation_id,
            conn=conn,
        )
        return result

    async def _apply_base_update(
        self,
        *,
        record: KnowledgeBaseRecord,
        payload: KnowledgeBaseUpdateRequest,
        actor_user_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> tuple[str, ...]:
        changed: list[str] = []
        if payload.name is not None and payload.name != record.name:
            normalized_name = _normalize_name(payload.name)
            if await self._repository.active_base_name_exists(
                workspace_id=record.workspace_id,
                normalized_name=normalized_name,
                exclude_id=record.id,
                conn=conn,
            ):
                raise Conflict("Knowledge Base name already exists", error="KNOWLEDGE_BASE_NAME_EXISTS")
            record.name = payload.name
            record.normalized_name = normalized_name
            changed.extend(("name", "normalized_name"))
        for field_name in ("description", "default_locale", "status"):
            if field_name not in payload.model_fields_set:
                continue
            value = getattr(payload, field_name)
            if value is not None and value != getattr(record, field_name):
                setattr(record, field_name, value)
                changed.append(field_name)
        if payload.access_policy is not None:
            policy_revision = record.current_policy_revision + 1
            await self._create_policy(
                record=record,
                policy=payload.access_policy,
                revision=policy_revision,
                actor_user_id=actor_user_id,
                conn=conn,
            )
            record.current_policy_revision = policy_revision
            changed.append("current_policy_revision")
        record.metadata_revision += 1
        record.updated_by_user_id = actor_user_id
        changed.extend(("metadata_revision", "updated_by_user_id"))
        return tuple(dict.fromkeys(changed))

    async def _create_policy(
        self,
        *,
        record: KnowledgeBaseRecord,
        policy: KnowledgeAccessPolicy,
        revision: int,
        actor_user_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> None:
        await self._repository.create_policy(
            values={
                "knowledge_base_id": record.id,
                "workspace_id": record.workspace_id,
                "policy_revision": revision,
                "visibility": policy.visibility,
                "allowed_project_ids": [str(value) for value in policy.allowed_project_ids],
                "allowed_role_codes": list(policy.allowed_role_codes),
                "allowed_member_ids": [str(value) for value in policy.allowed_member_ids],
                "allowed_agent_definition_ids": [str(value) for value in policy.allowed_agent_definition_ids],
                "created_by_user_id": actor_user_id,
            },
            conn=conn,
        )

    async def _resolve_existing_version(
        self,
        *,
        source_id: UUID,
        idempotency_key: str,
        fingerprint: str,
        normalized_content_hash: str,
        conn: BaseDBAsyncClient,
    ) -> KnowledgeSourceVersionRecord | None:
        existing = await self._repository.get_version_by_idempotency_key(
            source_id=source_id,
            idempotency_key=idempotency_key,
            conn=conn,
        )
        if existing is not None:
            _require_matching_fingerprint(existing.request_fingerprint, fingerprint)
            return existing
        matching_content = await self._repository.get_version_by_content_hash(
            source_id=source_id,
            normalized_content_hash=normalized_content_hash,
            conn=conn,
        )
        if matching_content is not None:
            raise Conflict(
                "An immutable version already exists for this content",
                error="KNOWLEDGE_INGESTION_CONFLICT",
            )
        return None

    async def _create_manual_version(
        self,
        *,
        source: KnowledgeSourceRecord,
        actor_user_id: UUID,
        idempotency_key: str,
        fingerprint: str,
        normalized_content: str,
        normalized_hash: str,
        payload: ManualKnowledgeVersionCreateRequest,
        conn: BaseDBAsyncClient,
    ) -> KnowledgeSourceVersionRecord:
        version_number = await self._repository.next_version_number(source_id=source.id, conn=conn)
        record = await self._repository.create_version(
            values={
                "source_id": source.id,
                "workspace_id": source.workspace_id,
                "version_number": version_number,
                "content_hash": _content_hash(payload.content),
                "normalized_content_hash": normalized_hash,
                "content_text": normalized_content,
                "parser_name": "manual-markdown",
                "parser_version": "1",
                "ingestion_mode": KnowledgeIngestionMode.INITIAL,
                "fetch_provenance": {"kind": "manual"},
                "locale": payload.locale or source.locale,
                "title": payload.title,
                "document_metadata": payload.document_metadata,
                "embedding_provider": self.settings.knowledge_index.embedding_provider,
                "embedding_model": self.settings.knowledge_index.embedding_model,
                "embedding_version": self.settings.knowledge_index.embedding_version,
                "vector_dimensions": self.settings.knowledge_index.vector_dimensions,
                "chunker_name": "knowledge-default",
                "chunker_version": "1",
                "index_schema_version": 1,
                "character_count": len(normalized_content),
                "provenance_actor_user_id": actor_user_id,
                "request_idempotency_key": idempotency_key,
                "request_fingerprint": fingerprint,
            },
            conn=conn,
        )
        await self._repository.create_version_state(
            values={
                "source_version_id": record.id,
                "workspace_id": source.workspace_id,
                "status": KnowledgeVersionStatus.PENDING,
                "progress_stage": "awaiting_ingestion",
                "state_revision": 1,
            },
            conn=conn,
        )
        source.latest_candidate_version_id = record.id
        source.status = KnowledgeSourceStatus.PENDING
        await self._repository.save_source(
            record=source,
            update_fields=("latest_candidate_version_id", "status"),
            conn=conn,
        )
        return record

    async def _require_base(
        self,
        *,
        workspace_id: UUID,
        knowledge_base_id: UUID,
    ) -> KnowledgeBaseRecord:
        record = await self._repository.get_base(
            workspace_id=workspace_id,
            knowledge_base_id=knowledge_base_id,
        )
        if record is None:
            _raise_not_found()
        return record

    async def _require_policy(self, *, record: KnowledgeBaseRecord) -> KnowledgeAccessPolicyRecord:
        policy = await self._repository.get_current_policy(
            workspace_id=record.workspace_id,
            knowledge_base_id=record.id,
            policy_revision=record.current_policy_revision,
        )
        if policy is None:
            raise RuntimeError("KNOWLEDGE_POLICY_INVARIANT_VIOLATION")
        return policy

    async def _require_source(
        self,
        *,
        workspace_id: UUID,
        knowledge_base_id: UUID,
        source_id: UUID,
    ) -> KnowledgeSourceRecord:
        record = await self._repository.get_source(
            workspace_id=workspace_id,
            knowledge_base_id=knowledge_base_id,
            source_id=source_id,
        )
        if record is None:
            _raise_not_found()
        return record

    async def _write_activity(
        self,
        *,
        event_name: str,
        organization_id: UUID,
        workspace_id: UUID,
        actor_user_id: UUID,
        entity_type: str,
        entity_id: UUID,
        properties: dict[str, Any],
        conn: BaseDBAsyncClient,
    ) -> None:
        await self._activity_writer(
            settings=self.settings,
            payload=ActivityAuditPayload(
                event_name=event_name,
                organization_id=organization_id,
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                entity_type=entity_type,
                entity_id=entity_id,
                properties=properties,
            ),
            conn=conn,
        )


KNOWLEDGE_GUIDANCE_DRAFT_SAVED = "workspace.knowledge.guidance.draft_saved"
KNOWLEDGE_GUIDANCE_PUBLISHED = "workspace.knowledge.guidance.published"
KNOWLEDGE_GUIDANCE_RESTORE_PREVIEWED = "workspace.knowledge.guidance.restore_previewed"
KNOWLEDGE_GUIDANCE_REMOVE_PREVIEWED = "workspace.knowledge.guidance.remove_previewed"
KNOWLEDGE_GUIDANCE_RESTORE_APPLIED = "workspace.knowledge.guidance.restore_applied"
KNOWLEDGE_GUIDANCE_REMOVE_APPLIED = "workspace.knowledge.guidance.remove_applied"
KNOWLEDGE_GUIDANCE_REFERENCE_ATTACHED = "workspace.knowledge.guidance.reference_attached"
KNOWLEDGE_GUIDANCE_REFERENCE_DETACHED = "workspace.knowledge.guidance.reference_detached"
KNOWLEDGE_GUIDANCE_LAYER_MISSING = "KNOWLEDGE_GUIDANCE_LAYER_MISSING"


class WorkspaceGuidanceService(BaseService):
    """Own the canonical shared and Project guidance lifecycle.

    Source collections remain optional references. Authored guidance stays in
    immutable revisions and does not reuse a Knowledge Base as a facade.
    """

    def __init__(
        self,
        *,
        repository: WorkspaceGuidanceRepository,
        settings: Settings | None = None,
        activity_writer: ActivityWriter = write_required_activity_event,
    ) -> None:
        super().__init__(settings)
        self._repository = repository
        self._activity_writer = activity_writer

    async def get_workspace_layer(self, *, workspace_id: UUID) -> KnowledgeGuidanceLayerOut:
        async with self.tx() as conn:
            layer = await self._require_existing_layer(
                workspace_id=workspace_id,
                project_id=None,
                for_update=False,
                conn=conn,
            )
            return await self._project_layer(layer=layer, conn=conn)

    async def get_project_layer(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
    ) -> KnowledgeGuidanceLayerOut:
        async with self.tx() as conn:
            layer = await self._require_existing_layer(
                workspace_id=workspace_id,
                project_id=project_id,
                for_update=False,
                conn=conn,
            )
            return await self._project_layer(layer=layer, conn=conn)

    async def list_revision_history(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID | None,
        limit: int,
        cursor: UUID | None,
    ) -> KnowledgeCursorPage[KnowledgeGuidanceRevisionOut]:
        async with self.tx() as conn:
            layer = await self._require_existing_layer(
                workspace_id=workspace_id,
                project_id=project_id,
                for_update=False,
                conn=conn,
            )
            revisions, next_cursor = await self._repository.list_revisions(
                workspace_id=workspace_id,
                guidance_layer_id=layer.id,
                limit=limit,
                cursor=cursor,
                conn=conn,
            )
            return KnowledgeCursorPage(
                items=tuple(project_guidance_revision(revision) for revision in revisions),
                next_cursor=next_cursor,
            )

    async def get_effective_preview(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID | None,
    ) -> KnowledgeGuidanceEffectivePreviewOut:
        async with self.tx() as conn:
            workspace_layer = await self._require_existing_layer(
                workspace_id=workspace_id,
                project_id=None,
                for_update=False,
                conn=conn,
            )
            project_layer = (
                await self._require_existing_layer(
                    workspace_id=workspace_id,
                    project_id=project_id,
                    for_update=False,
                    conn=conn,
                )
                if project_id is not None
                else None
            )
            return project_effective_guidance_preview(
                workspace=await self._project_layer(layer=workspace_layer, conn=conn),
                project=(
                    await self._project_layer(layer=project_layer, conn=conn) if project_layer is not None else None
                ),
            )

    async def save_draft(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        project_id: UUID | None,
        actor_user_id: UUID,
        idempotency_key: str,
        payload: KnowledgeGuidanceDraftSaveRequest,
    ) -> KnowledgeGuidanceLayerOut:
        key = _require_idempotency_key(idempotency_key)
        content = _normalize_guidance_content(payload.content)
        fingerprint = _fingerprint({
            "workspaceId": str(workspace_id),
            "projectId": str(project_id) if project_id is not None else None,
            "contentHash": _content_hash(content),
            "projectMode": payload.project_mode,
            "expectedRevision": payload.expected_revision,
        })
        async with self.tx() as conn:
            layer = await self._require_existing_layer(
                workspace_id=workspace_id,
                project_id=project_id,
                for_update=True,
                conn=conn,
            )
            revision_key = _guidance_revision_key("draft", key)
            existing = await self._repository.get_revision_by_idempotency_key(
                guidance_layer_id=layer.id,
                idempotency_key=revision_key,
                conn=conn,
            )
            if existing is None:
                _require_revision(layer.metadata_revision, payload.expected_revision)
                project_mode = _resolve_guidance_project_mode(
                    layer=layer,
                    project_id=project_id,
                    requested=payload.project_mode,
                )
                revision = await self._repository.create_revision(
                    values={
                        "guidance_layer_id": layer.id,
                        "workspace_id": workspace_id,
                        "revision_number": await self._repository.next_revision_number(
                            guidance_layer_id=layer.id,
                            conn=conn,
                        ),
                        "content": content,
                        "content_hash": _content_hash(content),
                        "status": KnowledgeGuidanceRevisionStatus.DRAFT,
                        "created_by_user_id": actor_user_id,
                        "request_idempotency_key": revision_key,
                        "request_fingerprint": fingerprint,
                    },
                    conn=conn,
                )
                layer.draft_revision_id = revision.id
                layer.project_mode = project_mode
                layer.metadata_revision += 1
                layer.updated_by_user_id = actor_user_id
                await self._repository.save_layer(
                    record=layer,
                    update_fields=(
                        "draft_revision_id",
                        "project_mode",
                        "metadata_revision",
                        "updated_by_user_id",
                    ),
                    conn=conn,
                )
                await self._write_activity(
                    event_name=KNOWLEDGE_GUIDANCE_DRAFT_SAVED,
                    organization_id=organization_id,
                    workspace_id=workspace_id,
                    actor_user_id=actor_user_id,
                    entity_type="knowledge_guidance_layer",
                    entity_id=layer.id,
                    properties={
                        "scope": _guidance_scope_name(project_id),
                        "revisionId": str(revision.id),
                        "revisionNumber": revision.revision_number,
                        "metadataRevision": layer.metadata_revision,
                    },
                    conn=conn,
                )
            else:
                _require_matching_fingerprint(existing.request_fingerprint, fingerprint)
            return await self._project_layer(layer=layer, conn=conn)

    async def publish(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        project_id: UUID | None,
        actor_user_id: UUID,
        idempotency_key: str,
        payload: KnowledgeGuidancePublishRequest,
    ) -> KnowledgeGuidanceLayerOut:
        key = _require_idempotency_key(idempotency_key)
        fingerprint = _fingerprint({
            "workspaceId": str(workspace_id),
            "projectId": str(project_id) if project_id is not None else None,
            "revisionId": str(payload.revision_id) if payload.revision_id is not None else None,
            "expectedRevision": payload.expected_revision,
        })
        async with self.tx() as conn:
            layer = await self._require_existing_layer(
                workspace_id=workspace_id,
                project_id=project_id,
                for_update=True,
                conn=conn,
            )
            command = await self._repository.get_command(
                guidance_layer_id=layer.id,
                kind=KnowledgeGuidanceCommandKind.PUBLISH,
                idempotency_key=key,
                conn=conn,
            )
            if command is not None:
                _require_matching_fingerprint(command.request_fingerprint, fingerprint)
                return _guidance_command_result(command)
            _require_revision(layer.metadata_revision, payload.expected_revision)
            revision_id = payload.revision_id or layer.draft_revision_id
            if revision_id is None:
                raise Conflict("A draft guidance revision is required", error="KNOWLEDGE_GUIDANCE_DRAFT_REQUIRED")
            revision = await self._repository.get_revision_for_update(
                workspace_id=workspace_id,
                guidance_layer_id=layer.id,
                revision_id=revision_id,
                conn=conn,
            )
            if revision is None:
                _raise_not_found()
            if revision.status != KnowledgeGuidanceRevisionStatus.DRAFT:
                raise Conflict("Guidance revision is not publishable", error="KNOWLEDGE_GUIDANCE_REVISION_NOT_DRAFT")
            previous = await self._published_revision_for_update(layer=layer, conn=conn)
            now = datetime.now(UTC)
            revision.status = KnowledgeGuidanceRevisionStatus.PUBLISHED
            revision.published_at = now
            revision.published_by_user_id = actor_user_id
            await self._repository.save_revision(
                record=revision,
                update_fields=("status", "published_at", "published_by_user_id"),
                conn=conn,
            )
            if previous is not None and previous.id != revision.id:
                previous.status = KnowledgeGuidanceRevisionStatus.SUPERSEDED
                await self._repository.save_revision(
                    record=previous,
                    update_fields=("status",),
                    conn=conn,
                )
            layer.published_revision_id = revision.id
            layer.draft_revision_id = None
            layer.removed_at = None
            layer.removed_by_user_id = None
            layer.metadata_revision += 1
            layer.updated_by_user_id = actor_user_id
            await self._repository.save_layer(
                record=layer,
                update_fields=(
                    "published_revision_id",
                    "draft_revision_id",
                    "removed_at",
                    "removed_by_user_id",
                    "metadata_revision",
                    "updated_by_user_id",
                ),
                conn=conn,
            )
            result = await self._project_layer(layer=layer, conn=conn)
            await self._repository.create_command(
                values={
                    "guidance_layer_id": layer.id,
                    "workspace_id": workspace_id,
                    "kind": KnowledgeGuidanceCommandKind.PUBLISH,
                    "request_idempotency_key": key,
                    "request_fingerprint": fingerprint,
                    "result_snapshot": result.model_dump(mode="json", by_alias=True),
                    "actor_user_id": actor_user_id,
                },
                conn=conn,
            )
            await self._write_activity(
                event_name=KNOWLEDGE_GUIDANCE_PUBLISHED,
                organization_id=organization_id,
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                entity_type="knowledge_guidance_layer",
                entity_id=layer.id,
                properties={
                    "scope": _guidance_scope_name(project_id),
                    "revisionId": str(revision.id),
                    "metadataRevision": layer.metadata_revision,
                },
                conn=conn,
            )
            return result

    async def create_restore_preview(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        project_id: UUID | None,
        actor_user_id: UUID,
        idempotency_key: str,
        payload: KnowledgeGuidanceRestorePreviewRequest,
    ) -> KnowledgeGuidancePreviewOut:
        return await self._create_preview(
            workspace_id=workspace_id,
            organization_id=organization_id,
            project_id=project_id,
            actor_user_id=actor_user_id,
            idempotency_key=idempotency_key,
            kind=KnowledgeGuidancePreviewKind.RESTORE,
            expected_revision=payload.expected_revision,
            source_revision_id=payload.source_revision_id,
        )

    async def create_remove_preview(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        project_id: UUID | None,
        actor_user_id: UUID,
        idempotency_key: str,
        payload: KnowledgeGuidanceRemovePreviewRequest,
    ) -> KnowledgeGuidancePreviewOut:
        return await self._create_preview(
            workspace_id=workspace_id,
            organization_id=organization_id,
            project_id=project_id,
            actor_user_id=actor_user_id,
            idempotency_key=idempotency_key,
            kind=KnowledgeGuidancePreviewKind.REMOVE,
            expected_revision=payload.expected_revision,
            source_revision_id=None,
        )

    async def apply_restore_preview(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        project_id: UUID | None,
        preview_id: UUID,
        actor_user_id: UUID,
        idempotency_key: str,
        payload: KnowledgeGuidancePreviewApplyRequest,
    ) -> KnowledgeGuidanceLayerOut:
        return await self._apply_preview(
            workspace_id=workspace_id,
            organization_id=organization_id,
            project_id=project_id,
            preview_id=preview_id,
            actor_user_id=actor_user_id,
            idempotency_key=idempotency_key,
            payload=payload,
            kind=KnowledgeGuidancePreviewKind.RESTORE,
        )

    async def apply_remove_preview(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        project_id: UUID | None,
        preview_id: UUID,
        actor_user_id: UUID,
        idempotency_key: str,
        payload: KnowledgeGuidancePreviewApplyRequest,
    ) -> KnowledgeGuidanceLayerOut:
        return await self._apply_preview(
            workspace_id=workspace_id,
            organization_id=organization_id,
            project_id=project_id,
            preview_id=preview_id,
            actor_user_id=actor_user_id,
            idempotency_key=idempotency_key,
            payload=payload,
            kind=KnowledgeGuidancePreviewKind.REMOVE,
        )

    async def attach_reference(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        project_id: UUID | None,
        actor_user_id: UUID,
        idempotency_key: str,
        payload: KnowledgeGuidanceReferenceAttachRequest,
    ) -> KnowledgeGuidanceLayerOut:
        key = _require_idempotency_key(idempotency_key)
        fingerprint = _fingerprint({
            "workspaceId": str(workspace_id),
            "projectId": str(project_id) if project_id is not None else None,
            "knowledgeBaseId": str(payload.knowledge_base_id),
            "expectedRevision": payload.expected_revision,
        })
        async with self.tx() as conn:
            layer = await self._require_existing_layer(
                workspace_id=workspace_id,
                project_id=project_id,
                for_update=True,
                conn=conn,
            )
            command = await self._repository.get_command(
                guidance_layer_id=layer.id,
                kind=KnowledgeGuidanceCommandKind.REFERENCE_ATTACH,
                idempotency_key=key,
                conn=conn,
            )
            if command is not None:
                _require_matching_fingerprint(command.request_fingerprint, fingerprint)
                return _guidance_command_result(command)
            _require_revision(layer.metadata_revision, payload.expected_revision)
            base = await self._repository.get_knowledge_base(
                workspace_id=workspace_id,
                knowledge_base_id=payload.knowledge_base_id,
                conn=conn,
            )
            if base is None:
                _raise_not_found()
            if base.status != KnowledgeBaseStatus.ACTIVE:
                raise Conflict("Knowledge reference is not active", error="KNOWLEDGE_GUIDANCE_REFERENCE_UNAVAILABLE")
            if await self._repository.get_reference(
                workspace_id=workspace_id,
                guidance_layer_id=layer.id,
                knowledge_base_id=base.id,
                conn=conn,
            ):
                raise Conflict("Knowledge reference is already attached", error="KNOWLEDGE_GUIDANCE_REFERENCE_EXISTS")
            await self._repository.create_reference(
                values={
                    "guidance_layer_id": layer.id,
                    "workspace_id": workspace_id,
                    "knowledge_base_id": base.id,
                    "created_by_user_id": actor_user_id,
                },
                conn=conn,
            )
            return await self._finish_reference_command(
                layer=layer,
                workspace_id=workspace_id,
                organization_id=organization_id,
                project_id=project_id,
                actor_user_id=actor_user_id,
                idempotency_key=key,
                fingerprint=fingerprint,
                kind=KnowledgeGuidanceCommandKind.REFERENCE_ATTACH,
                event_name=KNOWLEDGE_GUIDANCE_REFERENCE_ATTACHED,
                knowledge_base_id=base.id,
                conn=conn,
            )

    async def detach_reference(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        project_id: UUID | None,
        knowledge_base_id: UUID,
        actor_user_id: UUID,
        idempotency_key: str,
        payload: KnowledgeGuidanceReferenceDetachRequest,
    ) -> KnowledgeGuidanceLayerOut:
        key = _require_idempotency_key(idempotency_key)
        fingerprint = _fingerprint({
            "workspaceId": str(workspace_id),
            "projectId": str(project_id) if project_id is not None else None,
            "knowledgeBaseId": str(knowledge_base_id),
            "expectedRevision": payload.expected_revision,
        })
        async with self.tx() as conn:
            layer = await self._require_existing_layer(
                workspace_id=workspace_id,
                project_id=project_id,
                for_update=True,
                conn=conn,
            )
            command = await self._repository.get_command(
                guidance_layer_id=layer.id,
                kind=KnowledgeGuidanceCommandKind.REFERENCE_DETACH,
                idempotency_key=key,
                conn=conn,
            )
            if command is not None:
                _require_matching_fingerprint(command.request_fingerprint, fingerprint)
                return _guidance_command_result(command)
            _require_revision(layer.metadata_revision, payload.expected_revision)
            reference = await self._repository.get_reference(
                workspace_id=workspace_id,
                guidance_layer_id=layer.id,
                knowledge_base_id=knowledge_base_id,
                conn=conn,
            )
            if reference is None:
                _raise_not_found()
            await self._repository.delete_reference(record=reference, conn=conn)
            return await self._finish_reference_command(
                layer=layer,
                workspace_id=workspace_id,
                organization_id=organization_id,
                project_id=project_id,
                actor_user_id=actor_user_id,
                idempotency_key=key,
                fingerprint=fingerprint,
                kind=KnowledgeGuidanceCommandKind.REFERENCE_DETACH,
                event_name=KNOWLEDGE_GUIDANCE_REFERENCE_DETACHED,
                knowledge_base_id=knowledge_base_id,
                conn=conn,
            )

    async def _create_preview(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        project_id: UUID | None,
        actor_user_id: UUID,
        idempotency_key: str,
        kind: KnowledgeGuidancePreviewKind,
        expected_revision: int,
        source_revision_id: UUID | None,
    ) -> KnowledgeGuidancePreviewOut:
        key = _require_idempotency_key(idempotency_key)
        fingerprint = _fingerprint({
            "workspaceId": str(workspace_id),
            "projectId": str(project_id) if project_id is not None else None,
            "kind": str(kind),
            "expectedRevision": expected_revision,
            "sourceRevisionId": str(source_revision_id) if source_revision_id is not None else None,
        })
        async with self.tx() as conn:
            layer = await self._require_existing_layer(
                workspace_id=workspace_id,
                project_id=project_id,
                for_update=True,
                conn=conn,
            )
            preview = await self._repository.get_preview_by_idempotency_key(
                guidance_layer_id=layer.id,
                kind=kind,
                idempotency_key=key,
                conn=conn,
            )
            if preview is None:
                _require_revision(layer.metadata_revision, expected_revision)
                source_revision = None
                if kind == KnowledgeGuidancePreviewKind.RESTORE:
                    if source_revision_id is None:
                        raise RuntimeError("Guidance restore preview requires a source revision")
                    source_revision = await self._repository.get_revision(
                        workspace_id=workspace_id,
                        guidance_layer_id=layer.id,
                        revision_id=source_revision_id,
                        conn=conn,
                    )
                    if source_revision is None:
                        _raise_not_found()
                    if source_revision.status == KnowledgeGuidanceRevisionStatus.DRAFT:
                        raise Conflict(
                            "Only published guidance history can be restored",
                            error="KNOWLEDGE_GUIDANCE_RESTORE_SOURCE_INVALID",
                        )
                reference_count, source_count, ready_source_count = await self._repository.source_counts_for_references(
                    workspace_id=workspace_id,
                    guidance_layer_id=layer.id,
                    conn=conn,
                )
                project_guidance_count = (
                    await self._repository.count_project_layers(workspace_id=workspace_id, conn=conn)
                    if project_id is None
                    else 0
                )
                preview = await self._repository.create_preview(
                    values={
                        "guidance_layer_id": layer.id,
                        "workspace_id": workspace_id,
                        "kind": kind,
                        "status": KnowledgeGuidancePreviewStatus.ACTIVE,
                        "expected_layer_revision": layer.metadata_revision,
                        "preview_revision": 1,
                        "source_revision_id": source_revision.id if source_revision is not None else None,
                        "snapshot": {
                            "referenceCount": reference_count,
                            "sourceCount": source_count,
                            "readySourceCount": ready_source_count,
                            "projectGuidanceCount": project_guidance_count,
                            "sourceContentHash": source_revision.content_hash if source_revision is not None else None,
                        },
                        "request_idempotency_key": key,
                        "request_fingerprint": fingerprint,
                        "actor_user_id": actor_user_id,
                    },
                    conn=conn,
                )
                await self._write_activity(
                    event_name=(
                        KNOWLEDGE_GUIDANCE_RESTORE_PREVIEWED
                        if kind == KnowledgeGuidancePreviewKind.RESTORE
                        else KNOWLEDGE_GUIDANCE_REMOVE_PREVIEWED
                    ),
                    organization_id=organization_id,
                    workspace_id=workspace_id,
                    actor_user_id=actor_user_id,
                    entity_type="knowledge_guidance_preview",
                    entity_id=preview.id,
                    properties={
                        "scope": _guidance_scope_name(project_id),
                        "guidanceLayerId": str(layer.id),
                        "kind": str(kind),
                        "metadataRevision": layer.metadata_revision,
                    },
                    conn=conn,
                )
            else:
                _require_matching_fingerprint(preview.request_fingerprint, fingerprint)
            return _project_guidance_preview(preview=preview, layer=layer)

    async def _apply_preview(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        project_id: UUID | None,
        preview_id: UUID,
        actor_user_id: UUID,
        idempotency_key: str,
        payload: KnowledgeGuidancePreviewApplyRequest,
        kind: KnowledgeGuidancePreviewKind,
    ) -> KnowledgeGuidanceLayerOut:
        key = _require_idempotency_key(idempotency_key)
        fingerprint = _fingerprint({
            "workspaceId": str(workspace_id),
            "projectId": str(project_id) if project_id is not None else None,
            "previewId": str(preview_id),
            "kind": str(kind),
            "expectedGuidanceRevision": payload.expected_guidance_revision,
            "expectedPreviewRevision": payload.expected_preview_revision,
        })
        command_kind = (
            KnowledgeGuidanceCommandKind.RESTORE
            if kind == KnowledgeGuidancePreviewKind.RESTORE
            else KnowledgeGuidanceCommandKind.REMOVE
        )
        async with self.tx() as conn:
            layer = await self._require_existing_layer(
                workspace_id=workspace_id,
                project_id=project_id,
                for_update=True,
                conn=conn,
            )
            command = await self._repository.get_command(
                guidance_layer_id=layer.id,
                kind=command_kind,
                idempotency_key=key,
                conn=conn,
            )
            if command is not None:
                _require_matching_fingerprint(command.request_fingerprint, fingerprint)
                return _guidance_command_result(command)
            _require_revision(layer.metadata_revision, payload.expected_guidance_revision)
            preview = await self._repository.get_preview_for_update(
                workspace_id=workspace_id,
                guidance_layer_id=layer.id,
                preview_id=preview_id,
                conn=conn,
            )
            if preview is None:
                _raise_not_found()
            if preview.kind != kind:
                raise Conflict("Guidance preview kind does not match", error="KNOWLEDGE_GUIDANCE_PREVIEW_INVALID")
            if preview.status != KnowledgeGuidancePreviewStatus.ACTIVE:
                raise Conflict("Guidance preview has already been applied", error="KNOWLEDGE_GUIDANCE_PREVIEW_APPLIED")
            if (
                preview.expected_layer_revision != layer.metadata_revision
                or preview.preview_revision != payload.expected_preview_revision
            ):
                raise Conflict("Guidance preview is stale", error="KNOWLEDGE_GUIDANCE_PREVIEW_STALE")
            await self._apply_preview_effect(
                layer=layer,
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                idempotency_key=key,
                fingerprint=fingerprint,
                kind=kind,
                preview=preview,
                conn=conn,
            )
            now = datetime.now(UTC)
            preview.status = KnowledgeGuidancePreviewStatus.APPLIED
            preview.applied_at = now
            preview.applied_by_user_id = actor_user_id
            await self._repository.save_preview(
                record=preview,
                update_fields=("status", "applied_at", "applied_by_user_id"),
                conn=conn,
            )
            result = await self._project_layer(layer=layer, conn=conn)
            await self._repository.create_command(
                values={
                    "guidance_layer_id": layer.id,
                    "workspace_id": workspace_id,
                    "kind": command_kind,
                    "request_idempotency_key": key,
                    "request_fingerprint": fingerprint,
                    "result_snapshot": result.model_dump(mode="json", by_alias=True),
                    "actor_user_id": actor_user_id,
                },
                conn=conn,
            )
            await self._write_activity(
                event_name=(
                    KNOWLEDGE_GUIDANCE_RESTORE_APPLIED
                    if kind == KnowledgeGuidancePreviewKind.RESTORE
                    else KNOWLEDGE_GUIDANCE_REMOVE_APPLIED
                ),
                organization_id=organization_id,
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                entity_type="knowledge_guidance_layer",
                entity_id=layer.id,
                properties={
                    "scope": _guidance_scope_name(project_id),
                    "previewId": str(preview.id),
                    "metadataRevision": layer.metadata_revision,
                },
                conn=conn,
            )
            return result

    async def _apply_preview_effect(
        self,
        *,
        layer: KnowledgeGuidanceLayerRecord,
        workspace_id: UUID,
        actor_user_id: UUID,
        idempotency_key: str,
        fingerprint: str,
        kind: KnowledgeGuidancePreviewKind,
        preview: KnowledgeGuidancePreviewRecord,
        conn: BaseDBAsyncClient,
    ) -> UUID | None:
        update_fields = ["metadata_revision", "updated_by_user_id"]
        restored_revision_id: UUID | None = None
        if kind == KnowledgeGuidancePreviewKind.RESTORE:
            if preview.source_revision_id is None:
                raise RuntimeError("KNOWLEDGE_GUIDANCE_RESTORE_PREVIEW_INVARIANT_VIOLATION")
            source = await self._repository.get_revision_for_update(
                workspace_id=workspace_id,
                guidance_layer_id=layer.id,
                revision_id=preview.source_revision_id,
                conn=conn,
            )
            if source is None or source.status == KnowledgeGuidanceRevisionStatus.DRAFT:
                raise RuntimeError("KNOWLEDGE_GUIDANCE_RESTORE_SOURCE_INVARIANT_VIOLATION")
            restored = await self._repository.create_revision(
                values={
                    "guidance_layer_id": layer.id,
                    "workspace_id": workspace_id,
                    "revision_number": await self._repository.next_revision_number(
                        guidance_layer_id=layer.id,
                        conn=conn,
                    ),
                    "content": source.content,
                    "content_hash": source.content_hash,
                    "status": KnowledgeGuidanceRevisionStatus.DRAFT,
                    "restored_from_revision_id": source.id,
                    "created_by_user_id": actor_user_id,
                    "request_idempotency_key": _guidance_revision_key("restore", idempotency_key),
                    "request_fingerprint": fingerprint,
                },
                conn=conn,
            )
            layer.draft_revision_id = restored.id
            restored_revision_id = restored.id
            update_fields.append("draft_revision_id")
        else:
            previous = await self._published_revision_for_update(layer=layer, conn=conn)
            if previous is not None:
                previous.status = KnowledgeGuidanceRevisionStatus.SUPERSEDED
                await self._repository.save_revision(
                    record=previous,
                    update_fields=("status",),
                    conn=conn,
                )
            layer.draft_revision_id = None
            layer.published_revision_id = None
            layer.removed_at = datetime.now(UTC)
            layer.removed_by_user_id = actor_user_id
            update_fields.extend(("draft_revision_id", "published_revision_id", "removed_at", "removed_by_user_id"))
        layer.metadata_revision += 1
        layer.updated_by_user_id = actor_user_id
        await self._repository.save_layer(
            record=layer,
            update_fields=tuple(update_fields),
            conn=conn,
        )
        return restored_revision_id

    async def _finish_reference_command(
        self,
        *,
        layer: KnowledgeGuidanceLayerRecord,
        workspace_id: UUID,
        organization_id: UUID,
        project_id: UUID | None,
        actor_user_id: UUID,
        idempotency_key: str,
        fingerprint: str,
        kind: KnowledgeGuidanceCommandKind,
        event_name: str,
        knowledge_base_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> KnowledgeGuidanceLayerOut:
        layer.metadata_revision += 1
        layer.updated_by_user_id = actor_user_id
        await self._repository.save_layer(
            record=layer,
            update_fields=("metadata_revision", "updated_by_user_id"),
            conn=conn,
        )
        result = await self._project_layer(layer=layer, conn=conn)
        await self._repository.create_command(
            values={
                "guidance_layer_id": layer.id,
                "workspace_id": workspace_id,
                "kind": kind,
                "request_idempotency_key": idempotency_key,
                "request_fingerprint": fingerprint,
                "result_snapshot": result.model_dump(mode="json", by_alias=True),
                "actor_user_id": actor_user_id,
            },
            conn=conn,
        )
        await self._write_activity(
            event_name=event_name,
            organization_id=organization_id,
            workspace_id=workspace_id,
            actor_user_id=actor_user_id,
            entity_type="knowledge_guidance_layer",
            entity_id=layer.id,
            properties={
                "scope": _guidance_scope_name(project_id),
                "knowledgeBaseId": str(knowledge_base_id),
                "metadataRevision": layer.metadata_revision,
            },
            conn=conn,
        )
        return result

    async def _require_existing_layer(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID | None,
        for_update: bool,
        conn: BaseDBAsyncClient,
    ) -> KnowledgeGuidanceLayerRecord:
        scope_kind = KnowledgeGuidanceScope.PROJECT if project_id is not None else KnowledgeGuidanceScope.WORKSPACE
        scope_id = project_id or workspace_id
        if project_id is not None and not await self._repository.project_exists(
            workspace_id=workspace_id,
            project_id=project_id,
            conn=conn,
        ):
            _raise_not_found()
        if for_update:
            layer = await self._repository.get_layer_for_update(
                workspace_id=workspace_id,
                scope_kind=scope_kind,
                scope_id=scope_id,
                conn=conn,
            )
        else:
            layer = await self._repository.get_layer(
                workspace_id=workspace_id,
                scope_kind=scope_kind,
                scope_id=scope_id,
                conn=conn,
            )
        if layer is None:
            raise RuntimeError(KNOWLEDGE_GUIDANCE_LAYER_MISSING)
        _validate_guidance_layer_scope(layer=layer, workspace_id=workspace_id, project_id=project_id)
        return layer

    async def _project_layer(
        self,
        *,
        layer: KnowledgeGuidanceLayerRecord,
        conn: BaseDBAsyncClient,
    ) -> KnowledgeGuidanceLayerOut:
        draft = await self._layer_revision(
            layer=layer,
            revision_id=layer.draft_revision_id,
            expected_status=KnowledgeGuidanceRevisionStatus.DRAFT,
            conn=conn,
        )
        published = await self._layer_revision(
            layer=layer,
            revision_id=layer.published_revision_id,
            expected_status=KnowledgeGuidanceRevisionStatus.PUBLISHED,
            conn=conn,
        )
        return project_guidance_layer(
            layer,
            draft=draft,
            published=published,
            references=await self._repository.list_references(
                workspace_id=layer.workspace_id,
                guidance_layer_id=layer.id,
                conn=conn,
            ),
        )

    async def _layer_revision(
        self,
        *,
        layer: KnowledgeGuidanceLayerRecord,
        revision_id: UUID | None,
        expected_status: KnowledgeGuidanceRevisionStatus,
        conn: BaseDBAsyncClient,
    ) -> KnowledgeGuidanceRevisionRecord | None:
        if revision_id is None:
            return None
        revision = await self._repository.get_revision(
            workspace_id=layer.workspace_id,
            guidance_layer_id=layer.id,
            revision_id=revision_id,
            conn=conn,
        )
        if revision is None or revision.status != expected_status:
            raise RuntimeError("KNOWLEDGE_GUIDANCE_LAYER_POINTER_INVARIANT_VIOLATION")
        return revision

    async def _published_revision_for_update(
        self,
        *,
        layer: KnowledgeGuidanceLayerRecord,
        conn: BaseDBAsyncClient,
    ) -> KnowledgeGuidanceRevisionRecord | None:
        if layer.published_revision_id is None:
            return None
        revision = await self._repository.get_revision_for_update(
            workspace_id=layer.workspace_id,
            guidance_layer_id=layer.id,
            revision_id=layer.published_revision_id,
            conn=conn,
        )
        if revision is None or revision.status != KnowledgeGuidanceRevisionStatus.PUBLISHED:
            raise RuntimeError("KNOWLEDGE_GUIDANCE_PUBLISHED_POINTER_INVARIANT_VIOLATION")
        return revision

    async def _write_activity(
        self,
        *,
        event_name: str,
        organization_id: UUID,
        workspace_id: UUID,
        actor_user_id: UUID,
        entity_type: str,
        entity_id: UUID,
        properties: dict[str, Any],
        conn: BaseDBAsyncClient,
    ) -> None:
        await self._activity_writer(
            settings=self.settings,
            payload=ActivityAuditPayload(
                event_name=event_name,
                organization_id=organization_id,
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                entity_type=entity_type,
                entity_id=entity_id,
                properties=properties,
            ),
            conn=conn,
        )


def _normalize_guidance_content(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).replace("\r\n", "\n").replace("\r", "\n").strip()
    if not normalized:
        raise Conflict("Guidance content is required", error="KNOWLEDGE_GUIDANCE_CONTENT_REQUIRED")
    return normalized


def _guidance_revision_key(operation: str, idempotency_key: str) -> str:
    digest = hashlib.sha256(f"{operation}:{idempotency_key}".encode()).hexdigest()
    return f"guidance:{operation}:{digest}"


def _guidance_scope_name(project_id: UUID | None) -> Literal["workspace", "project"]:
    return "project" if project_id is not None else "workspace"


def _resolve_guidance_project_mode(
    *,
    layer: KnowledgeGuidanceLayerRecord,
    project_id: UUID | None,
    requested: Literal["supplement", "override"] | None,
) -> KnowledgeProjectGuidanceMode | None:
    if project_id is None:
        if requested is not None:
            raise Conflict("Workspace guidance cannot define a Project mode", error="KNOWLEDGE_GUIDANCE_SCOPE_INVALID")
        if layer.project_mode is not None:
            raise RuntimeError("KNOWLEDGE_GUIDANCE_WORKSPACE_MODE_INVARIANT_VIOLATION")
        return None
    if requested is not None:
        return KnowledgeProjectGuidanceMode(requested)
    if layer.project_mode is None:
        raise RuntimeError("KNOWLEDGE_GUIDANCE_PROJECT_MODE_INVARIANT_VIOLATION")
    return KnowledgeProjectGuidanceMode(str(layer.project_mode))


def _validate_guidance_layer_scope(
    *,
    layer: KnowledgeGuidanceLayerRecord,
    workspace_id: UUID,
    project_id: UUID | None,
) -> None:
    if project_id is None:
        if (
            layer.workspace_id != workspace_id
            or str(layer.scope_kind) != KnowledgeGuidanceScope.WORKSPACE
            or layer.scope_id != workspace_id
            or layer.project_mode is not None
        ):
            raise RuntimeError("KNOWLEDGE_GUIDANCE_WORKSPACE_LAYER_INVARIANT_VIOLATION")
        return
    if (
        layer.workspace_id != workspace_id
        or str(layer.scope_kind) != KnowledgeGuidanceScope.PROJECT
        or layer.scope_id != project_id
        or layer.project_mode is None
    ):
        raise RuntimeError("KNOWLEDGE_GUIDANCE_PROJECT_LAYER_INVARIANT_VIOLATION")


def _project_guidance_preview(
    *,
    preview: KnowledgeGuidancePreviewRecord,
    layer: KnowledgeGuidanceLayerRecord,
) -> KnowledgeGuidancePreviewOut:
    snapshot = preview.snapshot
    try:
        impact = KnowledgeGuidanceImpactOut(
            reference_count=int(snapshot["referenceCount"]),
            source_count=int(snapshot["sourceCount"]),
            ready_source_count=int(snapshot["readySourceCount"]),
            project_guidance_count=int(snapshot["projectGuidanceCount"]),
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise RuntimeError("KNOWLEDGE_GUIDANCE_PREVIEW_SNAPSHOT_INVARIANT_VIOLATION") from exc
    if preview.kind == KnowledgeGuidancePreviewKind.RESTORE:
        kind: Literal["restore", "remove"] = "restore"
    elif preview.kind == KnowledgeGuidancePreviewKind.REMOVE:
        kind = "remove"
    else:
        raise RuntimeError("KNOWLEDGE_GUIDANCE_PREVIEW_KIND_INVARIANT_VIOLATION")
    return KnowledgeGuidancePreviewOut(
        id=preview.id,
        kind=kind,
        guidance_layer_id=preview.guidance_layer_id,
        expected_guidance_revision=preview.expected_layer_revision,
        preview_revision=preview.preview_revision,
        source_revision_id=preview.source_revision_id,
        can_apply=(
            preview.status == KnowledgeGuidancePreviewStatus.ACTIVE
            and preview.expected_layer_revision == layer.metadata_revision
        ),
        impact=impact,
        created_at=preview.created_at,
    )


def _guidance_command_result(command: KnowledgeGuidanceCommandRecord) -> KnowledgeGuidanceLayerOut:
    return KnowledgeGuidanceLayerOut.model_validate(command.result_snapshot)


def _apply_source_update(
    *,
    record: KnowledgeSourceRecord,
    payload: KnowledgeSourceUpdateRequest,
    actor_user_id: UUID,
) -> tuple[str, ...]:
    changed: list[str] = []
    for field_name in ("display_name", "locale"):
        value = getattr(payload, field_name)
        if value is not None and value != getattr(record, field_name):
            setattr(record, field_name, value)
            changed.append(field_name)
    if payload.enabled is not None:
        next_status = (
            KnowledgeSourceStatus.READY
            if payload.enabled and record.active_ready_version_id is not None
            else KnowledgeSourceStatus.PENDING
            if payload.enabled
            else KnowledgeSourceStatus.DISABLED
        )
        if next_status != record.status:
            record.status = next_status
            changed.append("status")
    record.metadata_revision += 1
    record.updated_by_user_id = actor_user_id
    changed.extend(("metadata_revision", "updated_by_user_id"))
    return tuple(dict.fromkeys(changed))


def _require_manual_version_allowed(source: KnowledgeSourceRecord) -> None:
    if source.source_kind != KnowledgeSourceKind.MANUAL:
        raise Conflict("Source kind is immutable", error="KNOWLEDGE_SOURCE_KIND_IMMUTABLE")
    if source.status in {KnowledgeSourceStatus.DISABLED, KnowledgeSourceStatus.DELETING}:
        raise Conflict("Knowledge Source is not writable", error="KNOWLEDGE_SOURCE_NOT_WRITABLE")


def _normalize_source_create_request(payload: KnowledgeSourceCreateRequest) -> KnowledgeSourceCreateRequest:
    if payload.locator.kind != "url":
        return payload
    locator = _require_url_locator(payload.locator.model_dump(mode="json"))
    return payload.model_copy(update={"locator": locator})


def _require_url_locator(value: object) -> UrlKnowledgeLocator:
    try:
        locator = UrlKnowledgeLocator.model_validate(value)
        normalized_url = normalize_untrusted_http_url(str(locator.url))
        return UrlKnowledgeLocator.model_validate({"kind": "url", "url": normalized_url})
    except (KnowledgeUrlPolicyError, ValueError) as exc:
        raise Conflict("Knowledge source URL is forbidden", error="KNOWLEDGE_SOURCE_URL_FORBIDDEN") from exc


def _require_url_ingestion_mode(
    *,
    source: KnowledgeSourceRecord,
    mode: Literal["initial", "refresh"],
) -> None:
    if source.status in {KnowledgeSourceStatus.DISABLED, KnowledgeSourceStatus.DELETING}:
        raise Conflict("Knowledge Source is not ingestible", error="KNOWLEDGE_SOURCE_NOT_WRITABLE")
    if mode == "initial" and source.active_ready_version_id is not None:
        raise Conflict("Knowledge Source already has an active version", error="KNOWLEDGE_INGESTION_CONFLICT")
    if mode == "refresh" and source.active_ready_version_id is None:
        raise Conflict("Knowledge Source has no active version to refresh", error="KNOWLEDGE_INGESTION_CONFLICT")


def _normalize_name(value: str) -> str:
    return unicodedata.normalize("NFKC", value).strip().casefold()


def _normalize_manual_content(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).replace("\r\n", "\n").replace("\r", "\n").strip()
    if not normalized:
        raise Conflict("Manual Knowledge content is required", error="KNOWLEDGE_CONTENT_REQUIRED")
    return normalized


def _content_hash(value: str) -> str:
    return f"sha256:{hashlib.sha256(value.encode('utf-8')).hexdigest()}"


def _fingerprint(value: dict[str, Any]) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _require_idempotency_key(value: str) -> str:
    key = value.strip()
    if not key or len(key) > 128:
        raise Conflict("Idempotency-Key is required", error="KNOWLEDGE_IDEMPOTENCY_KEY_REQUIRED")
    return key


def _require_matching_fingerprint(actual: str, expected: str) -> None:
    if actual != expected:
        raise Conflict("Idempotency key was reused with different input", error="KNOWLEDGE_IDEMPOTENCY_CONFLICT")


def _require_revision(actual: int, expected: int) -> None:
    if actual != expected:
        raise Conflict(
            "Knowledge metadata revision is stale",
            error="KNOWLEDGE_REVISION_CONFLICT",
            meta={"currentRevision": actual},
        )


def _optional_text(value: str | None) -> str | None:
    normalized = (value or "").strip()
    return normalized or None


def _raise_not_found() -> NoReturn:
    raise NotFound("Knowledge resource not found", error="KNOWLEDGE_NOT_FOUND")
