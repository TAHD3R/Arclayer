from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime
from typing import cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonObject
from src.core.database.errors import is_retryable_postgres_failure
from src.models.knowledge._enums import (
    KnowledgeBaseStatus,
    KnowledgeServingFreshness,
    KnowledgeSourceStatus,
    KnowledgeVersionStatus,
)
from src.models.knowledge.knowledge_base import KnowledgeBaseRecord
from src.models.knowledge.knowledge_chunk import KnowledgeChunkRecord
from src.models.knowledge.knowledge_source import KnowledgeSourceRecord
from src.models.knowledge.knowledge_source_version import (
    KnowledgeSourceVersionRecord,
    KnowledgeSourceVersionStateRecord,
)
from src.modules.jobs.execution_errors import PermanentJobExecutionError, TransientJobExecutionError
from src.modules.tenancy.database import TenantScopedRepository
from src.modules.tenancy.schema import TenantContext
from src.modules.workspaces.knowledge.indexing import (
    KnowledgeIndexActivationMarker,
    KnowledgeIndexActivationWrite,
    KnowledgeIndexCandidate,
    KnowledgeIndexChunk,
)
from src.modules.workspaces.knowledge.indexing_contract import (
    KNOWLEDGE_INDEX_CANCELLED_CODE,
    KNOWLEDGE_INDEX_CONTENT_QUARANTINED_CODE,
    KNOWLEDGE_INDEX_OUTCOME_INVALID_CODE,
    KNOWLEDGE_INDEX_PERSISTENCE_TEMPORARILY_UNAVAILABLE_CODE,
    KNOWLEDGE_INDEX_SOURCE_STALE_CODE,
    KNOWLEDGE_INDEX_TARGET_NOT_FOUND_CODE,
    KNOWLEDGE_SOURCE_INDEX_RETRYABLE_CODES,
    KnowledgeContentQuarantinedMetadata,
    KnowledgeSourceIndexJobInput,
    KnowledgeSourceIndexJobTarget,
)

_SAFE_ERROR_DETAIL_MAX_LENGTH = 1000


class TenantKnowledgeIndexRepository(TenantScopedRepository):
    """Tenant authority for candidate indexing and atomic active-version switches."""

    def __init__(self, tenant_context: TenantContext) -> None:
        super().__init__(tenant_context)

    async def get_outcome_marker(
        self,
        *,
        target: KnowledgeSourceIndexJobTarget,
        job_id: UUID,
    ) -> KnowledgeIndexActivationMarker | None:
        self._require_scope(target.workspace_id)
        async with _translate_persistence_failures():
            async with self.connection() as conn:
                version = await self._get_version(target=target, conn=conn, for_update=False)
                if version is None:
                    raise _target_not_found()
                state = await self._require_version_state(version=version, conn=conn, for_update=False)
                self._require_index_job(state=state, job_id=job_id)
                if state.status != KnowledgeVersionStatus.READY:
                    return None
                chunks = await self._get_chunks(version_id=version.id, conn=conn, for_update=False)
                return _activation_marker(version=version, state=state, chunks=chunks, job_id=job_id)

    async def get_candidate(
        self,
        *,
        target: KnowledgeSourceIndexJobTarget,
        input_reference: KnowledgeSourceIndexJobInput,
        job_id: UUID,
        source_revision: str | None,
    ) -> KnowledgeIndexCandidate:
        self._require_scope(target.workspace_id)
        async with _translate_persistence_failures():
            async with self.connection() as conn:
                base, source, version, state = await self._load_candidate(
                    target=target,
                    conn=conn,
                    for_update=False,
                )
                self._require_executable_candidate(
                    base=base,
                    source=source,
                    version=version,
                    state=state,
                    target=target,
                    input_reference=input_reference,
                    job_id=job_id,
                    source_revision=source_revision,
                )
                chunks = await self._get_chunks(version_id=version.id, conn=conn, for_update=False)
                if len(chunks) != input_reference.chunk_count:
                    raise _outcome_invalid("Knowledge candidate chunk count differs from its index Job")
                return KnowledgeIndexCandidate(
                    workspace_id=target.workspace_id,
                    knowledge_base_id=target.knowledge_base_id,
                    source_id=target.source_id,
                    source_version_id=target.candidate_version_id,
                    ingest_job_id=input_reference.ingest_job_id,
                    normalized_content_hash=version.normalized_content_hash,
                    chunks=tuple(_index_chunk(chunk) for chunk in chunks),
                )

    async def activate(
        self,
        *,
        write: KnowledgeIndexActivationWrite,
    ) -> KnowledgeIndexActivationMarker:
        self._require_scope(write.workspace_id)
        async with _translate_persistence_failures():
            async with self.connection() as conn:
                target = KnowledgeSourceIndexJobTarget(
                    workspace_id=write.workspace_id,
                    knowledge_base_id=write.knowledge_base_id,
                    source_id=write.source_id,
                    candidate_version_id=write.source_version_id,
                    entity_id=write.source_id,
                )
                _base, source, version, state = await self._load_candidate(
                    target=target,
                    conn=conn,
                    for_update=True,
                )
                self._require_activation_candidate(
                    source=source,
                    version=version,
                    state=state,
                    write=write,
                )
                chunks = await self._get_chunks(version_id=version.id, conn=conn, for_update=True)
                if state.status == KnowledgeVersionStatus.READY:
                    return _activation_marker(version=version, state=state, chunks=chunks, job_id=write.job_id)
                _require_activation_chunks(chunks=chunks, write=write)

                previous_active_version_id = source.active_ready_version_id
                if previous_active_version_id is not None and previous_active_version_id != version.id:
                    await (
                        KnowledgeChunkRecord
                        .filter(
                            source_version_id=previous_active_version_id,
                            workspace_id=write.workspace_id,
                        )
                        .using_db(conn)
                        .update(retrieval_eligible=False)
                    )

                indexed_by_id = {chunk.id: chunk for chunk in write.chunks}
                for chunk in chunks:
                    indexed = indexed_by_id[chunk.id]
                    chunk.embedding_reference = indexed.embedding_reference
                    chunk.embedding_provider = write.embedding_provider
                    chunk.embedding_model = write.embedding_model
                    chunk.embedding_version = write.embedding_version
                    chunk.vector_dimensions = write.vector_dimensions
                    chunk.prompt_injection_scan = indexed.scan.model_dump(mode="json", by_alias=True)
                    chunk.retrieval_eligible = True
                await KnowledgeChunkRecord.bulk_update(
                    chunks,
                    fields=(
                        "embedding_reference",
                        "embedding_provider",
                        "embedding_model",
                        "embedding_version",
                        "vector_dimensions",
                        "prompt_injection_scan",
                        "retrieval_eligible",
                    ),
                    using_db=conn,
                )

                now = await _database_time(conn)
                state.status = KnowledgeVersionStatus.READY
                state.progress_stage = "ready"
                state.safe_error_code = None
                state.safe_error_detail = None
                state.state_revision += 1
                await state.save(
                    update_fields=(
                        "status",
                        "progress_stage",
                        "safe_error_code",
                        "safe_error_detail",
                        "state_revision",
                    ),
                    using_db=conn,
                )
                source.active_ready_version_id = version.id
                source.status = KnowledgeSourceStatus.READY
                source.serving_freshness = KnowledgeServingFreshness.CURRENT
                source.last_succeeded_at = now
                source.safe_error_code = None
                await source.save(
                    update_fields=(
                        "active_ready_version_id",
                        "status",
                        "serving_freshness",
                        "last_succeeded_at",
                        "safe_error_code",
                    ),
                    using_db=conn,
                )
                return _activation_marker(version=version, state=state, chunks=chunks, job_id=write.job_id)

    async def cancel(
        self,
        *,
        target: KnowledgeSourceIndexJobTarget,
        job_id: UUID,
    ) -> None:
        await self._project_terminal_state(
            target=target,
            job_id=job_id,
            error_code=KNOWLEDGE_INDEX_CANCELLED_CODE,
            safe_message="Knowledge indexing was cancelled",
            metadata=None,
            progress_stage="cancelled",
        )

    async def project_failure(
        self,
        *,
        target: KnowledgeSourceIndexJobTarget,
        job_id: UUID,
        error_code: str,
        safe_message: str,
        metadata: JsonObject | None,
    ) -> None:
        await self._project_terminal_state(
            target=target,
            job_id=job_id,
            error_code=error_code,
            safe_message=safe_message,
            metadata=metadata,
            progress_stage="quarantined" if error_code == KNOWLEDGE_INDEX_CONTENT_QUARANTINED_CODE else "failed",
        )

    async def _project_terminal_state(
        self,
        *,
        target: KnowledgeSourceIndexJobTarget,
        job_id: UUID,
        error_code: str,
        safe_message: str,
        metadata: JsonObject | None,
        progress_stage: str,
    ) -> None:
        self._require_scope(target.workspace_id)
        async with _translate_persistence_failures():
            async with self.connection() as conn:
                try:
                    _base, source, version, state = await self._load_candidate(
                        target=target,
                        conn=conn,
                        for_update=True,
                    )
                except PermanentJobExecutionError as exc:
                    if exc.code == KNOWLEDGE_INDEX_TARGET_NOT_FOUND_CODE and error_code == exc.code:
                        return
                    raise
                self._require_index_job(state=state, job_id=job_id)
                if state.status == KnowledgeVersionStatus.READY:
                    return
                is_quarantined = error_code == KNOWLEDGE_INDEX_CONTENT_QUARANTINED_CODE
                terminal_status = (
                    KnowledgeVersionStatus.QUARANTINED if is_quarantined else KnowledgeVersionStatus.FAILED
                )
                safe_error_detail = safe_message[:_SAFE_ERROR_DETAIL_MAX_LENGTH]
                has_same_terminal_state = (
                    state.status == terminal_status
                    and state.progress_stage == progress_stage
                    and state.safe_error_code == error_code
                    and state.safe_error_detail == safe_error_detail
                )
                if not has_same_terminal_state:
                    state.status = terminal_status
                    state.progress_stage = progress_stage
                    state.safe_error_code = error_code
                    state.safe_error_detail = safe_error_detail
                    state.state_revision += 1
                    await state.save(
                        update_fields=(
                            "status",
                            "progress_stage",
                            "safe_error_code",
                            "safe_error_detail",
                            "state_revision",
                        ),
                        using_db=conn,
                    )
                if is_quarantined:
                    await _project_quarantine_scan(
                        version=version,
                        metadata=metadata,
                        conn=conn,
                    )
                if source.latest_candidate_version_id != version.id:
                    return
                source.status = KnowledgeSourceStatus.QUARANTINED if is_quarantined else KnowledgeSourceStatus.FAILED
                source.last_failed_at = await _database_time(conn)
                source.safe_error_code = error_code
                if source.active_ready_version_id is not None:
                    source.serving_freshness = KnowledgeServingFreshness.STALE
                await source.save(
                    update_fields=(
                        "status",
                        "last_failed_at",
                        "safe_error_code",
                        "serving_freshness",
                    ),
                    using_db=conn,
                )

    async def _load_candidate(
        self,
        *,
        target: KnowledgeSourceIndexJobTarget,
        conn: BaseDBAsyncClient,
        for_update: bool,
    ) -> tuple[
        KnowledgeBaseRecord,
        KnowledgeSourceRecord,
        KnowledgeSourceVersionRecord,
        KnowledgeSourceVersionStateRecord,
    ]:
        base_query = KnowledgeBaseRecord.filter(
            id=target.knowledge_base_id,
            workspace_id=target.workspace_id,
        ).using_db(conn)
        source_query = KnowledgeSourceRecord.filter(
            id=target.source_id,
            knowledge_base_id=target.knowledge_base_id,
            workspace_id=target.workspace_id,
        ).using_db(conn)
        if for_update:
            base_query = base_query.select_for_update()
            source_query = source_query.select_for_update()
        base = await base_query.first()
        source = await source_query.first()
        version = await self._get_version(target=target, conn=conn, for_update=for_update)
        if base is None or source is None or version is None:
            raise _target_not_found()
        state = await self._require_version_state(version=version, conn=conn, for_update=for_update)
        return base, source, version, state

    @staticmethod
    async def _get_version(
        *,
        target: KnowledgeSourceIndexJobTarget,
        conn: BaseDBAsyncClient,
        for_update: bool,
    ) -> KnowledgeSourceVersionRecord | None:
        query = KnowledgeSourceVersionRecord.filter(
            id=target.candidate_version_id,
            source_id=target.source_id,
            workspace_id=target.workspace_id,
        ).using_db(conn)
        if for_update:
            query = query.select_for_update()
        return await query.first()

    @staticmethod
    async def _require_version_state(
        *,
        version: KnowledgeSourceVersionRecord,
        conn: BaseDBAsyncClient,
        for_update: bool,
    ) -> KnowledgeSourceVersionStateRecord:
        query = KnowledgeSourceVersionStateRecord.filter(
            source_version_id=version.id,
            workspace_id=version.workspace_id,
        ).using_db(conn)
        if for_update:
            query = query.select_for_update()
        state = await query.first()
        if state is None:
            raise _outcome_invalid("Knowledge candidate operational state is missing")
        return state

    @staticmethod
    async def _get_chunks(
        *,
        version_id: UUID,
        conn: BaseDBAsyncClient,
        for_update: bool,
    ) -> list[KnowledgeChunkRecord]:
        query = KnowledgeChunkRecord.filter(source_version_id=version_id).using_db(conn).order_by("ordinal")
        if for_update:
            query = query.select_for_update()
        return await query

    @staticmethod
    def _require_executable_candidate(
        *,
        base: KnowledgeBaseRecord,
        source: KnowledgeSourceRecord,
        version: KnowledgeSourceVersionRecord,
        state: KnowledgeSourceVersionStateRecord,
        target: KnowledgeSourceIndexJobTarget,
        input_reference: KnowledgeSourceIndexJobInput,
        job_id: UUID,
        source_revision: str | None,
    ) -> None:
        TenantKnowledgeIndexRepository._require_index_job(state=state, job_id=job_id)
        if base.status != KnowledgeBaseStatus.ACTIVE:
            raise _source_stale("Knowledge Base is no longer active")
        if source.status in {KnowledgeSourceStatus.DISABLED, KnowledgeSourceStatus.DELETING}:
            raise _source_stale("Knowledge source is no longer indexable")
        if source.latest_candidate_version_id != target.candidate_version_id:
            raise _source_stale("Knowledge candidate was superseded before indexing completed")
        if not _is_executable_index_state(state):
            raise _source_stale("Knowledge candidate is no longer awaiting indexing")
        if (
            version.provenance_job_id != input_reference.ingest_job_id
            or version.normalized_content_hash != input_reference.normalized_content_hash
            or source_revision != input_reference.normalized_content_hash
            or version.chunk_count != input_reference.chunk_count
            or version.embedding_provider != input_reference.embedding_provider
            or version.embedding_model != input_reference.embedding_model
            or version.embedding_version != input_reference.embedding_version
            or version.vector_dimensions != input_reference.vector_dimensions
            or version.index_schema_version != input_reference.index_schema_version
        ):
            raise _source_stale("Knowledge candidate metadata differs from the canonical index Job")

    @staticmethod
    def _require_activation_candidate(
        *,
        source: KnowledgeSourceRecord,
        version: KnowledgeSourceVersionRecord,
        state: KnowledgeSourceVersionStateRecord,
        write: KnowledgeIndexActivationWrite,
    ) -> None:
        TenantKnowledgeIndexRepository._require_index_job(state=state, job_id=write.job_id)
        if source.latest_candidate_version_id != version.id:
            raise _source_stale("Knowledge candidate was superseded before activation")
        if state.status != KnowledgeVersionStatus.READY and not _is_executable_index_state(state):
            raise _source_stale("Knowledge candidate is no longer activatable")
        if (
            version.provenance_job_id != write.ingest_job_id
            or version.normalized_content_hash != write.normalized_content_hash
            or version.embedding_provider != write.embedding_provider
            or version.embedding_model != write.embedding_model
            or version.embedding_version != write.embedding_version
            or version.vector_dimensions != write.vector_dimensions
        ):
            raise _source_stale("Knowledge activation metadata differs from its immutable version")

    @staticmethod
    def _require_index_job(*, state: KnowledgeSourceVersionStateRecord, job_id: UUID) -> None:
        if state.index_job_id != job_id:
            raise _source_stale("Knowledge candidate belongs to a different index Job")

    def _require_scope(self, workspace_id: UUID) -> None:
        context = self.tenant_context
        if context.workspace_id != workspace_id or context.project_id is not None:
            raise _target_not_found()


def _index_chunk(record: KnowledgeChunkRecord) -> KnowledgeIndexChunk:
    if not isinstance(record.content_text, str) or not record.content_text:
        raise _outcome_invalid("Knowledge chunk content is unavailable")
    if record.retrieval_eligible:
        raise _source_stale("Knowledge candidate chunk is already retrieval eligible")
    return KnowledgeIndexChunk(
        id=record.id,
        ordinal=record.ordinal,
        content_hash=record.content_hash,
        content_text=record.content_text,
        citation_location=cast(JsonObject, record.citation_location),
        token_count=record.token_count,
        locale=record.locale,
        metadata=cast(JsonObject, record.metadata),
        upstream_acl_tags=tuple(str(value) for value in cast(list[object], record.upstream_acl_tags)),
    )


def _is_executable_index_state(state: KnowledgeSourceVersionStateRecord) -> bool:
    return state.status == KnowledgeVersionStatus.INDEXING or (
        state.status == KnowledgeVersionStatus.FAILED
        and state.safe_error_code in KNOWLEDGE_SOURCE_INDEX_RETRYABLE_CODES
    )


def _require_activation_chunks(
    *,
    chunks: list[KnowledgeChunkRecord],
    write: KnowledgeIndexActivationWrite,
) -> None:
    expected_ids = tuple(chunk.id for chunk in chunks)
    actual_ids = tuple(chunk.id for chunk in write.chunks)
    if actual_ids != expected_ids or len(chunks) < 1:
        raise _outcome_invalid("Knowledge activation chunks differ from the persisted candidate")
    if any(chunk.scan.chunk_id != chunk.id or chunk.scan.status != "clean" for chunk in write.chunks):
        raise _outcome_invalid("Knowledge activation requires clean security scan results")


def _activation_marker(
    *,
    version: KnowledgeSourceVersionRecord,
    state: KnowledgeSourceVersionStateRecord,
    chunks: list[KnowledgeChunkRecord],
    job_id: UUID,
) -> KnowledgeIndexActivationMarker:
    if state.index_job_id != job_id or state.status != KnowledgeVersionStatus.READY:
        raise _outcome_invalid("Knowledge version is not ready for the canonical index Job")
    if (
        not isinstance(version.chunk_count, int)
        or version.chunk_count < 1
        or len(chunks) != version.chunk_count
        or not isinstance(version.vector_dimensions, int)
        or version.vector_dimensions < 1
        or any(not chunk.retrieval_eligible for chunk in chunks)
    ):
        raise _outcome_invalid("Knowledge ready marker has incompatible chunk state")
    index_uid, embedder_name = _require_consistent_ready_chunks(version=version, chunks=chunks)
    return KnowledgeIndexActivationMarker(
        job_id=job_id,
        source_id=version.source_id,
        source_version_id=version.id,
        normalized_content_hash=version.normalized_content_hash,
        chunk_count=version.chunk_count,
        vector_dimensions=version.vector_dimensions,
        index_uid=index_uid,
        embedder_name=embedder_name,
    )


def _require_consistent_ready_chunks(
    *,
    version: KnowledgeSourceVersionRecord,
    chunks: list[KnowledgeChunkRecord],
) -> tuple[str, str]:
    expected_provider_task_id: str | None = None
    expected_index_uid: str | None = None
    expected_embedder_name: str | None = None
    for chunk in chunks:
        reference = chunk.embedding_reference
        scan = chunk.prompt_injection_scan
        if not isinstance(reference, dict) or not isinstance(scan, dict):
            raise _outcome_invalid("Knowledge ready chunk is missing index or scan evidence")
        provider_task_id = reference.get("providerTaskId")
        index_uid = reference.get("indexUid")
        embedder_name = reference.get("embedderName")
        if (
            reference.get("backend") != "meilisearch"
            or reference.get("documentId") != str(chunk.id)
            or not isinstance(provider_task_id, str)
            or not provider_task_id
            or not isinstance(index_uid, str)
            or not index_uid
            or not isinstance(embedder_name, str)
            or not embedder_name
            or scan.get("status") != "clean"
            or chunk.embedding_provider != version.embedding_provider
            or chunk.embedding_model != version.embedding_model
            or chunk.embedding_version != version.embedding_version
            or chunk.vector_dimensions != version.vector_dimensions
        ):
            raise _outcome_invalid("Knowledge ready chunk evidence conflicts with its immutable version")
        if expected_provider_task_id is None:
            expected_provider_task_id = provider_task_id
            expected_index_uid = index_uid
            expected_embedder_name = embedder_name
        elif (
            provider_task_id != expected_provider_task_id
            or index_uid != expected_index_uid
            or embedder_name != expected_embedder_name
        ):
            raise _outcome_invalid("Knowledge ready chunks do not share one canonical index receipt")
    if expected_index_uid is None or expected_embedder_name is None:
        raise _outcome_invalid("Knowledge ready marker is missing indexed chunks")
    return expected_index_uid, expected_embedder_name


async def _project_quarantine_scan(
    *,
    version: KnowledgeSourceVersionRecord,
    metadata: JsonObject | None,
    conn: BaseDBAsyncClient,
) -> None:
    evidence = KnowledgeContentQuarantinedMetadata.model_validate(metadata)
    chunk = (
        await KnowledgeChunkRecord
        .filter(
            id=evidence.chunk_id,
            source_version_id=version.id,
            workspace_id=version.workspace_id,
        )
        .using_db(conn)
        .select_for_update()
        .first()
    )
    if chunk is None:
        raise _outcome_invalid("Knowledge quarantine evidence does not belong to the candidate")
    scan = {
        "chunkId": str(evidence.chunk_id),
        "status": "quarantined",
        "scannerName": evidence.scanner_name,
        "scannerVersion": evidence.scanner_version,
        "rule": evidence.rule,
    }
    if chunk.prompt_injection_scan != scan or chunk.retrieval_eligible:
        chunk.prompt_injection_scan = scan
        chunk.retrieval_eligible = False
        await chunk.save(
            update_fields=("prompt_injection_scan", "retrieval_eligible"),
            using_db=conn,
        )


@asynccontextmanager
async def _translate_persistence_failures() -> AsyncIterator[None]:
    try:
        yield
    except (PermanentJobExecutionError, TransientJobExecutionError):
        raise
    except Exception as exc:
        if is_retryable_postgres_failure(exc):
            raise TransientJobExecutionError(
                code=KNOWLEDGE_INDEX_PERSISTENCE_TEMPORARILY_UNAVAILABLE_CODE,
                safe_message="Knowledge index persistence is temporarily unavailable",
            ) from exc
        raise


async def _database_time(conn: BaseDBAsyncClient) -> datetime:
    rows = await conn.execute_query_dict("SELECT clock_timestamp() AS database_time")
    if len(rows) != 1 or not isinstance(rows[0].get("database_time"), datetime):
        raise RuntimeError("PostgreSQL clock_timestamp() did not return one datetime")
    return cast(datetime, rows[0]["database_time"])


def _target_not_found() -> PermanentJobExecutionError:
    return PermanentJobExecutionError(
        code=KNOWLEDGE_INDEX_TARGET_NOT_FOUND_CODE,
        safe_message="The Knowledge index target does not exist in this workspace",
    )


def _source_stale(message: str) -> PermanentJobExecutionError:
    return PermanentJobExecutionError(
        code=KNOWLEDGE_INDEX_SOURCE_STALE_CODE,
        safe_message=message,
    )


def _outcome_invalid(message: str) -> PermanentJobExecutionError:
    return PermanentJobExecutionError(
        code=KNOWLEDGE_INDEX_OUTCOME_INVALID_CODE,
        safe_message=message,
    )
