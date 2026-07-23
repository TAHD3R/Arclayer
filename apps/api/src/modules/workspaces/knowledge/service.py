from __future__ import annotations

import hashlib
import json
import unicodedata
from collections.abc import Awaitable, Callable
from typing import Any, Literal, NoReturn, Protocol
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import Settings, get_settings
from src.core.exceptions import Conflict, NotFound
from src.core.services import BaseService
from src.models.knowledge._enums import (
    KnowledgeBaseStatus,
    KnowledgeIngestionMode,
    KnowledgeSourceKind,
    KnowledgeSourceStatus,
    KnowledgeVersionStatus,
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
    project_source,
    project_version,
)
from src.modules.workspaces.knowledge.repository import WorkspaceKnowledgeRepository
from src.modules.workspaces.knowledge.schema import (
    KnowledgeAccessPolicy,
    KnowledgeBaseCreateRequest,
    KnowledgeBaseDetailOut,
    KnowledgeBaseSummaryOut,
    KnowledgeBaseUpdateRequest,
    KnowledgeCursorPage,
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
    return WorkspaceKnowledgeCapabilitiesOut(
        manual_sources_available=True,
        external_ingestion_available=(
            resolved_settings.knowledge_source_fetch.enabled and resolved_settings.knowledge_index.enabled
        ),
        indexing_available=resolved_settings.knowledge_index.enabled,
        retrieval_available=True,
        immutable_source_versions=True,
        supported_source_kinds=("manual", "file", "url", "connector", "structured_content"),
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
