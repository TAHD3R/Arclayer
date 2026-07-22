from __future__ import annotations

from typing import Literal
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonObject
from src.config import Settings
from src.modules.jobs.execution_errors import PermanentJobExecutionError, TransientJobExecutionError
from src.modules.jobs.schema import BackgroundJobCreate, BackgroundJobCreateResult
from src.modules.jobs.service import BackgroundJobService
from src.modules.workspaces.knowledge.indexing_contract import (
    KNOWLEDGE_SOURCE_INDEX_JOB_TYPE,
    KNOWLEDGE_SOURCE_INDEX_JOB_TYPE_VERSION,
    KnowledgeSourceIndexJobInput,
    KnowledgeSourceIndexJobTarget,
    validate_knowledge_source_index_target_input,
)
from src.modules.workspaces.knowledge.ingestion import (
    KnowledgeIngestionDocument,
    KnowledgeIngestionOutcomeMarker,
    KnowledgeIngestionWrite,
    KnowledgeParsedCandidateMarker,
)
from src.modules.workspaces.knowledge.ingestion_contract import (
    KNOWLEDGE_INGESTION_OUTCOME_INVALID_CODE,
    KnowledgeSourceIngestJobInput,
    KnowledgeSourceIngestJobTarget,
)
from src.modules.workspaces.knowledge.ingestion_repository import TenantKnowledgeIngestionRepository
from src.modules.workspaces.knowledge.source_fetch import UntrustedHttpKnowledgeFetcher
from src.modules.workspaces.knowledge.source_fetch_errors import KnowledgeSourceFetchError
from src.modules.workspaces.knowledge.web_document import normalize_fetched_web_document


class TenantKnowledgeIngestionCoordinator:
    """Atomically persists parsed chunks and their durable index Job handoff."""

    def __init__(
        self,
        *,
        settings: Settings,
        repository: TenantKnowledgeIngestionRepository,
        jobs: BackgroundJobService,
        url_fetcher: UntrustedHttpKnowledgeFetcher,
    ) -> None:
        self._settings = settings
        self._repository = repository
        self._jobs = jobs
        self._url_fetcher = url_fetcher

    async def get_outcome_marker(
        self,
        *,
        target: KnowledgeSourceIngestJobTarget,
        job_id: UUID,
    ) -> KnowledgeIngestionOutcomeMarker | None:
        return await self._repository.get_outcome_marker(target=target, job_id=job_id)

    async def get_document(
        self,
        *,
        target: KnowledgeSourceIngestJobTarget,
        input_reference: KnowledgeSourceIngestJobInput,
        job_id: UUID,
        source_revision: str | None,
    ) -> KnowledgeIngestionDocument:
        if input_reference.source_kind == "manual":
            return await self._repository.get_document(
                target=target,
                input_reference=input_reference,
                job_id=job_id,
                source_revision=source_revision,
            )
        reference = await self._repository.get_url_source_reference(
            target=target,
            input_reference=input_reference,
            source_revision=source_revision,
        )
        try:
            fetched = await self._url_fetcher.fetch(reference.normalized_url)
            normalized = normalize_fetched_web_document(fetched)
        except KnowledgeSourceFetchError as exc:
            if exc.transient:
                raise TransientJobExecutionError(
                    code=exc.code,
                    safe_message=exc.safe_message,
                    provider_retry_after_seconds=exc.retry_after_seconds,
                ) from exc
            raise PermanentJobExecutionError(
                code=exc.code,
                safe_message=exc.safe_message,
            ) from exc
        provenance: JsonObject = {
            "kind": "url",
            "requestedUrl": fetched.requested_url,
            "finalUrl": fetched.final_url,
            "redirectChain": list(fetched.redirect_chain),
            "resolutions": [item.model_dump(mode="json") for item in fetched.resolutions],
            "mimeType": fetched.mime_type,
            "charset": fetched.charset,
            "compressedBytes": fetched.compressed_bytes,
            "decompressedBytes": fetched.decompressed_bytes,
            "etag": fetched.etag,
            "lastModified": fetched.last_modified,
            "fetchedAt": fetched.fetched_at.isoformat(),
        }
        metadata: JsonObject = {
            "sourceUri": fetched.final_url,
            "mimeType": fetched.mime_type,
        }
        return KnowledgeIngestionDocument(
            workspace_id=reference.workspace_id,
            knowledge_base_id=reference.knowledge_base_id,
            source_id=reference.source_id,
            source_version_id=None,
            provenance_job_id=job_id,
            source_kind="url",
            ingestion_mode=input_reference.ingestion_mode,
            source_revision=reference.source_revision,
            source_content_hash=fetched.source_content_hash,
            normalized_content_hash=normalized.normalized_content_hash,
            parser_name="web-text",
            parser_version="1",
            chunker_name=input_reference.chunker_name,
            chunker_version=input_reference.chunker_version,
            index_schema_version=input_reference.index_schema_version,
            locale=reference.locale,
            title=normalized.title or reference.display_name,
            content=normalized.content,
            fetch_provenance=provenance,
            document_metadata=metadata,
        )

    async def commit_parsed(
        self,
        *,
        write: KnowledgeIngestionWrite,
    ) -> KnowledgeIngestionOutcomeMarker:
        created_job: BackgroundJobCreateResult | None = None
        async with self._repository.connection() as conn:
            marker = await self._repository.commit_parsed(write=write, conn=conn)
            if marker.index_job_id is not None:
                return await self._repository.bind_index_job(
                    marker=marker,
                    index_job_id=marker.index_job_id,
                    conn=conn,
                )
            created_job = await self._create_index_job(write=write, marker=marker, conn=conn)
            outcome = await self._repository.bind_index_job(
                marker=marker,
                index_job_id=created_job.job.id,
                conn=conn,
            )
        await self._jobs.publish_created_after_commit(created_job)
        return outcome

    async def cancel(
        self,
        *,
        target: KnowledgeSourceIngestJobTarget,
        job_id: UUID,
    ) -> None:
        await self._repository.cancel(target=target, job_id=job_id)

    async def project_failure(
        self,
        *,
        target: KnowledgeSourceIngestJobTarget,
        job_id: UUID,
        error_code: str,
        safe_message: str,
    ) -> None:
        await self._repository.project_failure(
            target=target,
            job_id=job_id,
            error_code=error_code,
            safe_message=safe_message,
        )

    async def _create_index_job(
        self,
        *,
        write: KnowledgeIngestionWrite,
        marker: KnowledgeParsedCandidateMarker,
        conn: BaseDBAsyncClient,
    ) -> BackgroundJobCreateResult:
        definition = self._jobs.registry.require(
            job_type=KNOWLEDGE_SOURCE_INDEX_JOB_TYPE,
            job_type_version=KNOWLEDGE_SOURCE_INDEX_JOB_TYPE_VERSION,
        )
        target = KnowledgeSourceIndexJobTarget(
            workspace_id=write.workspace_id,
            knowledge_base_id=write.knowledge_base_id,
            source_id=write.source_id,
            candidate_version_id=marker.source_version_id,
            entity_id=write.source_id,
        )
        profile = self._settings.knowledge_index
        embedding_provider, index_schema_version = _require_supported_index_profile(marker)
        input_reference = KnowledgeSourceIndexJobInput(
            ingest_job_id=write.job_id,
            normalized_content_hash=write.normalized_content_hash,
            chunk_count=marker.chunk_count,
            embedding_provider=embedding_provider,
            embedding_model=marker.embedding_model,
            embedding_version=marker.embedding_version,
            vector_dimensions=marker.vector_dimensions,
            index_backend=profile.index_backend,
            index_uid=f"{profile.index_prefix}_{write.workspace_id.hex}",
            embedder_name=profile.embedder_name,
            index_schema_version=index_schema_version,
        )
        validate_knowledge_source_index_target_input(target, input_reference)
        return await self._jobs.create_job_in_transaction(
            command=BackgroundJobCreate(
                job_type=definition.job_type,
                job_type_version=definition.job_type_version,
                task_name=definition.task_name,
                workload_class=definition.workload_class,
                authority_mode=definition.authority_mode,
                workspace_id=write.workspace_id,
                actor_user_id=write.actor_user_id,
                target_descriptor=target.model_dump(mode="json", by_alias=True),
                input_reference=input_reference.model_dump(mode="json", by_alias=True),
                idempotency_key=(f"source:{write.source_id}:version:{marker.source_version_id}:index:v1"),
                source_revision=write.normalized_content_hash,
                correlation_id=marker.correlation_id,
                retry_class=definition.retry_class,
                max_attempts=definition.max_attempts,
                timeout_seconds=definition.timeout_seconds,
                lease_seconds=definition.lease_seconds,
                heartbeat_seconds=definition.heartbeat_seconds,
                status_key=definition.initial_status_key,
            ),
            conn=conn,
        )


def _require_supported_index_profile(
    marker: KnowledgeParsedCandidateMarker,
) -> tuple[Literal["litellm"], Literal[1]]:
    if marker.embedding_provider != "litellm" or marker.index_schema_version != 1:
        raise PermanentJobExecutionError(
            code=KNOWLEDGE_INGESTION_OUTCOME_INVALID_CODE,
            safe_message="Knowledge candidate uses an unsupported immutable index profile",
        )
    return "litellm", 1
