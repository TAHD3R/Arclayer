from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime
from typing import cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonObject
from src.config import Settings, get_settings
from src.core.database.errors import is_retryable_postgres_failure
from src.models.knowledge._enums import (
    KnowledgeBaseStatus,
    KnowledgeServingFreshness,
    KnowledgeSourceKind,
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
from src.modules.jobs.hashing import hash_json
from src.modules.tenancy.database import TenantScopedRepository
from src.modules.tenancy.schema import TenantContext
from src.modules.workspaces.knowledge.ingestion import (
    KnowledgeIngestionDocument,
    KnowledgeIngestionOutcomeMarker,
    KnowledgeIngestionWrite,
    KnowledgeParsedCandidateMarker,
    KnowledgeUrlSourceReference,
)
from src.modules.workspaces.knowledge.ingestion_contract import (
    KNOWLEDGE_INGESTION_CANCELLED_CODE,
    KNOWLEDGE_INGESTION_OUTCOME_INVALID_CODE,
    KNOWLEDGE_INGESTION_PERSISTENCE_TEMPORARILY_UNAVAILABLE_CODE,
    KNOWLEDGE_INGESTION_SOURCE_STALE_CODE,
    KNOWLEDGE_INGESTION_TARGET_NOT_FOUND_CODE,
    KnowledgeSourceIngestJobInput,
    KnowledgeSourceIngestJobTarget,
)
from src.modules.workspaces.knowledge.schema import UrlKnowledgeLocator
from src.modules.workspaces.knowledge.source_revision import build_url_source_revision
from src.modules.workspaces.knowledge.untrusted_url import (
    KnowledgeUrlPolicyError,
    normalize_untrusted_http_url,
)

_SAFE_ERROR_DETAIL_MAX_LENGTH = 1000


class TenantKnowledgeIngestionRepository(TenantScopedRepository):
    """Tenant-routed source, chunk, and operational-state authority for ingestion."""

    def __init__(self, tenant_context: TenantContext, settings: Settings | None = None) -> None:
        super().__init__(tenant_context)
        self._settings = settings or get_settings()

    async def get_outcome_marker(
        self,
        *,
        target: KnowledgeSourceIngestJobTarget,
        job_id: UUID,
    ) -> KnowledgeIngestionOutcomeMarker | None:
        self._require_scope(target.workspace_id)
        async with _translate_persistence_failures():
            async with self.connection() as conn:
                version = await self._get_target_or_job_version(
                    target=target,
                    job_id=job_id,
                    conn=conn,
                    for_update=False,
                )
                if version is None:
                    if target.candidate_version_id is None:
                        return None
                    raise _target_not_found()
                self._require_job(version=version, job_id=job_id)
                state = await self._require_version_state(
                    version=version,
                    conn=conn,
                    for_update=False,
                )
                if state.status not in {KnowledgeVersionStatus.INDEXING, KnowledgeVersionStatus.READY}:
                    return None
                return _outcome_marker_from_version(version=version, state=state, job_id=job_id)

    async def get_document(
        self,
        *,
        target: KnowledgeSourceIngestJobTarget,
        input_reference: KnowledgeSourceIngestJobInput,
        job_id: UUID,
        source_revision: str | None,
    ) -> KnowledgeIngestionDocument:
        self._require_scope(target.workspace_id)
        async with _translate_persistence_failures():
            async with self.connection() as conn:
                base, source, version = await self._load_candidate(target=target, conn=conn)
                self._require_executable_candidate(
                    base=base,
                    source=source,
                    version=version,
                    target=target,
                    input_reference=input_reference,
                    job_id=job_id,
                    source_revision=source_revision,
                )
                content = version.content_text
                if not isinstance(content, str) or not content:
                    raise _outcome_invalid("The immutable manual Knowledge content is unavailable")
                return KnowledgeIngestionDocument(
                    workspace_id=target.workspace_id,
                    knowledge_base_id=target.knowledge_base_id,
                    source_id=target.source_id,
                    source_version_id=target.candidate_version_id,
                    provenance_job_id=job_id,
                    source_kind="manual",
                    ingestion_mode=input_reference.ingestion_mode,
                    source_revision=input_reference.source_revision,
                    source_content_hash=version.content_hash,
                    normalized_content_hash=version.normalized_content_hash,
                    parser_name="manual-markdown",
                    parser_version="1",
                    chunker_name=input_reference.chunker_name,
                    chunker_version=input_reference.chunker_version,
                    index_schema_version=input_reference.index_schema_version,
                    locale=version.locale,
                    title=version.title,
                    content=content,
                    fetch_provenance=cast(JsonObject, version.fetch_provenance),
                    document_metadata=cast(JsonObject, version.document_metadata),
                )

    async def get_url_source_reference(
        self,
        *,
        target: KnowledgeSourceIngestJobTarget,
        input_reference: KnowledgeSourceIngestJobInput,
        source_revision: str | None,
    ) -> KnowledgeUrlSourceReference:
        self._require_scope(target.workspace_id)
        if target.candidate_version_id is not None or input_reference.source_kind != "url":
            raise _outcome_invalid("URL ingestion cannot bind a pre-existing candidate")
        async with _translate_persistence_failures():
            async with self.connection() as conn:
                base, source = await self._load_base_source(target=target, conn=conn)
                if base.status != KnowledgeBaseStatus.ACTIVE:
                    raise _source_stale("Knowledge Base is no longer active")
                if source.source_kind != KnowledgeSourceKind.URL:
                    raise _source_stale("Knowledge source kind differs from the ingestion contract")
                if source.status in {KnowledgeSourceStatus.DISABLED, KnowledgeSourceStatus.DELETING}:
                    raise _source_stale("Knowledge source is no longer ingestible")
                try:
                    locator = UrlKnowledgeLocator.model_validate(source.locator)
                    normalized_url = normalize_untrusted_http_url(str(locator.url))
                except (KnowledgeUrlPolicyError, ValueError) as exc:
                    raise _source_stale("Knowledge source URL is no longer valid") from exc
                expected_revision = build_url_source_revision(
                    source_id=source.id,
                    normalized_url=normalized_url,
                    locale=source.locale,
                )
                if (
                    source_revision != input_reference.source_revision
                    or input_reference.source_revision != expected_revision
                    or input_reference.source_url != normalized_url
                ):
                    raise _source_stale("Knowledge source URL changed after Job creation")
                return KnowledgeUrlSourceReference(
                    workspace_id=source.workspace_id,
                    knowledge_base_id=source.knowledge_base_id,
                    source_id=source.id,
                    normalized_url=normalized_url,
                    source_revision=expected_revision,
                    locale=source.locale,
                    display_name=source.display_name,
                )

    async def commit_parsed(
        self,
        *,
        write: KnowledgeIngestionWrite,
        conn: BaseDBAsyncClient | None = None,
    ) -> KnowledgeParsedCandidateMarker:
        self._require_scope(write.workspace_id)
        async with _translate_persistence_failures():
            async with self.connection(conn) as active_conn:
                if write.source_version_id is None:
                    source, version = await self._resolve_or_create_url_candidate(
                        write=write,
                        conn=active_conn,
                    )
                else:
                    target = KnowledgeSourceIngestJobTarget(
                        workspace_id=write.workspace_id,
                        knowledge_base_id=write.knowledge_base_id,
                        source_id=write.source_id,
                        candidate_version_id=write.source_version_id,
                        entity_id=write.source_id,
                    )
                    _base, source, version = await self._load_candidate(
                        target=target,
                        conn=active_conn,
                        for_update=True,
                    )
                self._require_job(version=version, job_id=write.job_id)
                if version.normalized_content_hash != write.normalized_content_hash:
                    raise _source_stale("Knowledge content changed after Job creation")
                state = await self._require_version_state(
                    version=version,
                    conn=active_conn,
                    for_update=True,
                )
                if state.status in {KnowledgeVersionStatus.INDEXING, KnowledgeVersionStatus.READY}:
                    marker = _parsed_marker_from_version(
                        version=version,
                        state=state,
                        job_id=write.job_id,
                    )
                    _require_matching_marker(marker=marker, write=write)
                    return marker
                if state.status not in {
                    KnowledgeVersionStatus.PENDING,
                    KnowledgeVersionStatus.PARSING,
                    KnowledgeVersionStatus.FAILED,
                }:
                    raise _source_stale("Knowledge candidate is no longer ingestible")
                if source.latest_candidate_version_id != version.id:
                    raise _source_stale("Knowledge candidate was superseded before ingestion completed")
                if await KnowledgeChunkRecord.filter(source_version_id=version.id).using_db(active_conn).exists():
                    raise _outcome_invalid("Knowledge candidate has chunks without a completed ingestion marker")

                await KnowledgeChunkRecord.bulk_create(
                    [
                        KnowledgeChunkRecord(
                            source_version_id=version.id,
                            workspace_id=write.workspace_id,
                            ordinal=chunk.ordinal,
                            content_hash=chunk.content_hash,
                            content_text=chunk.content_text,
                            citation_location=chunk.citation_location,
                            token_count=chunk.token_count,
                            locale=chunk.locale,
                            metadata=chunk.metadata,
                            upstream_acl_tags=[],
                            prompt_injection_scan=chunk.prompt_injection_scan,
                            retrieval_eligible=False,
                        )
                        for chunk in write.chunks
                    ],
                    using_db=active_conn,
                )
                token_count = sum(chunk.token_count for chunk in write.chunks)
                version.chunk_count = len(write.chunks)
                version.token_count = token_count
                await version.save(update_fields=("chunk_count", "token_count"), using_db=active_conn)
                state.status = KnowledgeVersionStatus.INDEXING
                state.progress_stage = "awaiting_index"
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
                    using_db=active_conn,
                )
                source.status = KnowledgeSourceStatus.INDEXING
                source.last_attempted_at = await _database_time(active_conn)
                source.safe_error_code = None
                await source.save(
                    update_fields=("status", "last_attempted_at", "safe_error_code"),
                    using_db=active_conn,
                )
                return _parsed_marker_from_version(
                    version=version,
                    state=state,
                    job_id=write.job_id,
                )

    async def bind_index_job(
        self,
        *,
        marker: KnowledgeParsedCandidateMarker,
        index_job_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> KnowledgeIngestionOutcomeMarker:
        self._require_scope(marker.workspace_id)
        async with _translate_persistence_failures():
            version = (
                await KnowledgeSourceVersionRecord
                .filter(
                    id=marker.source_version_id,
                    source_id=marker.source_id,
                    workspace_id=self.tenant_context.workspace_id,
                )
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if version is None:
                raise _target_not_found()
            state = await self._require_version_state(version=version, conn=conn, for_update=True)
            if state.status not in {KnowledgeVersionStatus.INDEXING, KnowledgeVersionStatus.READY}:
                raise _source_stale("Knowledge candidate is no longer awaiting its index Job")
            if state.index_job_id is not None and state.index_job_id != index_job_id:
                raise _outcome_invalid("Knowledge candidate is already bound to a different index Job")
            if state.index_job_id is None:
                state.index_job_id = index_job_id
                state.state_revision += 1
                await state.save(update_fields=("index_job_id", "state_revision"), using_db=conn)
            return _outcome_marker_from_version(version=version, state=state, job_id=marker.ingest_job_id)

    async def cancel(
        self,
        *,
        target: KnowledgeSourceIngestJobTarget,
        job_id: UUID,
    ) -> None:
        self._require_scope(target.workspace_id)
        async with _translate_persistence_failures():
            async with self.connection() as conn:
                if target.candidate_version_id is None:
                    version = await self._get_target_or_job_version(
                        target=target,
                        job_id=job_id,
                        conn=conn,
                        for_update=True,
                    )
                    if version is None:
                        _base, source = await self._load_base_source(target=target, conn=conn, for_update=True)
                        await self._project_source_only_failure(
                            source=source,
                            error_code=KNOWLEDGE_INGESTION_CANCELLED_CODE,
                            conn=conn,
                        )
                        return
                    _base, source = await self._load_base_source(target=target, conn=conn, for_update=True)
                else:
                    _base, source, version = await self._load_candidate(
                        target=target,
                        conn=conn,
                        for_update=True,
                    )
                self._require_job(version=version, job_id=job_id)
                state = await self._require_version_state(
                    version=version,
                    conn=conn,
                    for_update=True,
                )
                if state.status in {KnowledgeVersionStatus.INDEXING, KnowledgeVersionStatus.READY}:
                    return
                state.status = KnowledgeVersionStatus.FAILED
                state.progress_stage = "cancelled"
                state.safe_error_code = KNOWLEDGE_INGESTION_CANCELLED_CODE
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
                if source.latest_candidate_version_id == version.id:
                    source.status = KnowledgeSourceStatus.FAILED
                    source.last_failed_at = await _database_time(conn)
                    source.safe_error_code = KNOWLEDGE_INGESTION_CANCELLED_CODE
                    await source.save(
                        update_fields=("status", "last_failed_at", "safe_error_code"),
                        using_db=conn,
                    )

    async def project_failure(
        self,
        *,
        target: KnowledgeSourceIngestJobTarget,
        job_id: UUID,
        error_code: str,
        safe_message: str,
    ) -> None:
        self._require_scope(target.workspace_id)
        async with _translate_persistence_failures():
            async with self.connection() as conn:
                try:
                    if target.candidate_version_id is None:
                        version = await self._get_target_or_job_version(
                            target=target,
                            job_id=job_id,
                            conn=conn,
                            for_update=True,
                        )
                        _base, source = await self._load_base_source(target=target, conn=conn, for_update=True)
                        if version is None:
                            await self._project_source_only_failure(
                                source=source,
                                error_code=error_code,
                                conn=conn,
                            )
                            return
                    else:
                        _base, source, version = await self._load_candidate(
                            target=target,
                            conn=conn,
                            for_update=True,
                        )
                except PermanentJobExecutionError as exc:
                    if (
                        exc.code == KNOWLEDGE_INGESTION_TARGET_NOT_FOUND_CODE
                        and error_code == KNOWLEDGE_INGESTION_TARGET_NOT_FOUND_CODE
                    ):
                        return
                    raise
                if version.provenance_job_id != job_id:
                    if error_code == KNOWLEDGE_INGESTION_SOURCE_STALE_CODE:
                        return
                    raise _source_stale("Knowledge candidate belongs to a different ingestion Job")
                state = await self._require_version_state(
                    version=version,
                    conn=conn,
                    for_update=True,
                )
                if state.status in {KnowledgeVersionStatus.INDEXING, KnowledgeVersionStatus.READY}:
                    return

                safe_error_detail = safe_message[:_SAFE_ERROR_DETAIL_MAX_LENGTH]
                has_same_failure = (
                    state.status == KnowledgeVersionStatus.FAILED
                    and state.progress_stage == "failed"
                    and state.safe_error_code == error_code
                    and state.safe_error_detail == safe_error_detail
                )
                if not has_same_failure:
                    state.status = KnowledgeVersionStatus.FAILED
                    state.progress_stage = "failed"
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

                if source.latest_candidate_version_id != version.id:
                    return
                source.status = KnowledgeSourceStatus.FAILED
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

    async def _resolve_or_create_url_candidate(
        self,
        *,
        write: KnowledgeIngestionWrite,
        conn: BaseDBAsyncClient,
    ) -> tuple[KnowledgeSourceRecord, KnowledgeSourceVersionRecord]:
        if write.source_kind != "url":
            raise _outcome_invalid("External ingestion write has an unsupported source kind")
        target = KnowledgeSourceIngestJobTarget(
            workspace_id=write.workspace_id,
            knowledge_base_id=write.knowledge_base_id,
            source_id=write.source_id,
            candidate_version_id=None,
            entity_id=write.source_id,
        )
        base, source = await self._load_base_source(target=target, conn=conn, for_update=True)
        if base.status != KnowledgeBaseStatus.ACTIVE or source.source_kind != KnowledgeSourceKind.URL:
            raise _source_stale("Knowledge URL source is no longer ingestible")
        if source.status in {KnowledgeSourceStatus.DISABLED, KnowledgeSourceStatus.DELETING}:
            raise _source_stale("Knowledge URL source is no longer ingestible")
        existing = (
            await KnowledgeSourceVersionRecord
            .filter(
                workspace_id=write.workspace_id,
                source_id=write.source_id,
                provenance_job_id=write.job_id,
            )
            .using_db(conn)
            .select_for_update()
            .first()
        )
        if existing is not None:
            self._require_url_version_matches_write(version=existing, write=write)
            return source, existing
        latest = (
            await KnowledgeSourceVersionRecord
            .filter(workspace_id=write.workspace_id, source_id=write.source_id)
            .using_db(conn)
            .order_by("-version_number")
            .first()
        )
        profile = self._settings.knowledge_index
        version = await KnowledgeSourceVersionRecord.create(
            using_db=conn,
            source_id=source.id,
            workspace_id=write.workspace_id,
            version_number=1 if latest is None else latest.version_number + 1,
            content_hash=write.source_content_hash,
            normalized_content_hash=write.normalized_content_hash,
            content_text=write.content_text,
            parser_name=write.parser_name,
            parser_version=write.parser_version,
            ingestion_mode=write.ingestion_mode,
            fetch_provenance=write.fetch_provenance,
            locale=write.locale,
            title=write.title,
            document_metadata=write.document_metadata,
            embedding_provider=profile.embedding_provider,
            embedding_model=profile.embedding_model,
            embedding_version=profile.embedding_version,
            vector_dimensions=profile.vector_dimensions,
            chunker_name=write.chunker_name,
            chunker_version=write.chunker_version,
            index_schema_version=write.index_schema_version,
            character_count=len(write.content_text),
            provenance_actor_user_id=write.actor_user_id,
            provenance_job_id=write.job_id,
            correlation_id=f"knowledge-ingest:{write.job_id}",
            request_idempotency_key=f"job:{write.job_id}",
            request_fingerprint=hash_json({
                "sourceId": str(write.source_id),
                "sourceRevision": write.source_revision,
                "normalizedContentHash": write.normalized_content_hash,
                "parserName": write.parser_name,
                "parserVersion": write.parser_version,
                "chunkerName": write.chunker_name,
                "chunkerVersion": write.chunker_version,
                "indexSchemaVersion": write.index_schema_version,
            }),
        )
        await KnowledgeSourceVersionStateRecord.create(
            using_db=conn,
            source_version_id=version.id,
            workspace_id=write.workspace_id,
            status=KnowledgeVersionStatus.PARSING,
            progress_stage="persisting",
            state_revision=1,
        )
        source.latest_candidate_version_id = version.id
        source.status = KnowledgeSourceStatus.PARSING
        source.last_attempted_at = await _database_time(conn)
        source.safe_error_code = None
        await source.save(
            update_fields=(
                "latest_candidate_version_id",
                "status",
                "last_attempted_at",
                "safe_error_code",
            ),
            using_db=conn,
        )
        return source, version

    @staticmethod
    def _require_url_version_matches_write(
        *,
        version: KnowledgeSourceVersionRecord,
        write: KnowledgeIngestionWrite,
    ) -> None:
        if (
            version.content_hash != write.source_content_hash
            or version.normalized_content_hash != write.normalized_content_hash
            or version.parser_name != write.parser_name
            or version.parser_version != write.parser_version
            or str(version.ingestion_mode) != write.ingestion_mode
            or version.chunker_name != write.chunker_name
            or version.chunker_version != write.chunker_version
            or version.index_schema_version != write.index_schema_version
        ):
            raise _outcome_invalid("Stored Knowledge URL candidate conflicts with the canonical Job")

    @staticmethod
    async def _project_source_only_failure(
        *,
        source: KnowledgeSourceRecord,
        error_code: str,
        conn: BaseDBAsyncClient,
    ) -> None:
        if source.status not in {
            KnowledgeSourceStatus.PENDING,
            KnowledgeSourceStatus.FETCHING,
            KnowledgeSourceStatus.PARSING,
            KnowledgeSourceStatus.FAILED,
        }:
            return
        source.status = KnowledgeSourceStatus.FAILED
        source.last_failed_at = await _database_time(conn)
        source.safe_error_code = error_code
        if source.active_ready_version_id is not None:
            source.serving_freshness = KnowledgeServingFreshness.STALE
        await source.save(
            update_fields=("status", "last_failed_at", "safe_error_code", "serving_freshness"),
            using_db=conn,
        )

    async def _load_candidate(
        self,
        *,
        target: KnowledgeSourceIngestJobTarget,
        conn: BaseDBAsyncClient,
        for_update: bool = False,
    ) -> tuple[KnowledgeBaseRecord, KnowledgeSourceRecord, KnowledgeSourceVersionRecord]:
        base, source = await self._load_base_source(
            target=target,
            conn=conn,
            for_update=for_update,
        )
        version = await self._get_version(target=target, conn=conn, for_update=for_update)
        if version is None:
            raise _target_not_found()
        return base, source, version

    @staticmethod
    async def _load_base_source(
        *,
        target: KnowledgeSourceIngestJobTarget,
        conn: BaseDBAsyncClient,
        for_update: bool = False,
    ) -> tuple[KnowledgeBaseRecord, KnowledgeSourceRecord]:
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
        if base is None or source is None:
            raise _target_not_found()
        return base, source

    @staticmethod
    async def _get_version(
        *,
        target: KnowledgeSourceIngestJobTarget,
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
    async def _get_target_or_job_version(
        *,
        target: KnowledgeSourceIngestJobTarget,
        job_id: UUID,
        conn: BaseDBAsyncClient,
        for_update: bool,
    ) -> KnowledgeSourceVersionRecord | None:
        query = KnowledgeSourceVersionRecord.filter(
            source_id=target.source_id,
            workspace_id=target.workspace_id,
        ).using_db(conn)
        if target.candidate_version_id is None:
            query = query.filter(provenance_job_id=job_id)
        else:
            query = query.filter(id=target.candidate_version_id)
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
    def _require_executable_candidate(
        *,
        base: KnowledgeBaseRecord,
        source: KnowledgeSourceRecord,
        version: KnowledgeSourceVersionRecord,
        target: KnowledgeSourceIngestJobTarget,
        input_reference: KnowledgeSourceIngestJobInput,
        job_id: UUID,
        source_revision: str | None,
    ) -> None:
        TenantKnowledgeIngestionRepository._require_job(version=version, job_id=job_id)
        if base.status != KnowledgeBaseStatus.ACTIVE:
            raise _source_stale("Knowledge Base is no longer active")
        if source.source_kind != KnowledgeSourceKind.MANUAL:
            raise _source_stale("Knowledge source kind differs from the ingestion contract")
        if source.status in {KnowledgeSourceStatus.DISABLED, KnowledgeSourceStatus.DELETING}:
            raise _source_stale("Knowledge source is no longer ingestible")
        if source.latest_candidate_version_id != target.candidate_version_id:
            raise _source_stale("Knowledge candidate was superseded before execution")
        expected = input_reference
        if (
            version.normalized_content_hash != expected.normalized_content_hash
            or source_revision != expected.normalized_content_hash
            or str(version.ingestion_mode) != expected.ingestion_mode
            or version.parser_name != expected.parser_name
            or version.parser_version != expected.parser_version
            or version.chunker_name != expected.chunker_name
            or version.chunker_version != expected.chunker_version
            or version.index_schema_version != expected.index_schema_version
        ):
            raise _source_stale("Knowledge candidate metadata differs from the canonical Job")

    @staticmethod
    def _require_job(*, version: KnowledgeSourceVersionRecord, job_id: UUID) -> None:
        if version.provenance_job_id != job_id:
            raise _source_stale("Knowledge candidate belongs to a different ingestion Job")

    def _require_scope(self, workspace_id: UUID) -> None:
        context = self.tenant_context
        if context.workspace_id != workspace_id or context.project_id is not None:
            raise _target_not_found()


def _parsed_marker_from_version(
    *,
    version: KnowledgeSourceVersionRecord,
    state: KnowledgeSourceVersionStateRecord,
    job_id: UUID,
) -> KnowledgeParsedCandidateMarker:
    chunk_count = version.chunk_count
    token_count = version.token_count
    if not isinstance(chunk_count, int) or chunk_count < 1 or not isinstance(token_count, int) or token_count < 1:
        raise _outcome_invalid("Knowledge ingestion marker is missing measured chunk counts")
    if (
        not version.embedding_provider
        or not version.embedding_model
        or not version.embedding_version
        or not isinstance(version.vector_dimensions, int)
        or version.vector_dimensions < 1
        or not version.correlation_id
    ):
        raise _outcome_invalid("Knowledge candidate is missing its immutable index profile")
    return KnowledgeParsedCandidateMarker(
        ingest_job_id=job_id,
        index_job_id=state.index_job_id,
        workspace_id=version.workspace_id,
        source_id=version.source_id,
        source_version_id=version.id,
        normalized_content_hash=version.normalized_content_hash,
        chunk_count=chunk_count,
        token_count=token_count,
        embedding_provider=version.embedding_provider,
        embedding_model=version.embedding_model,
        embedding_version=version.embedding_version,
        vector_dimensions=version.vector_dimensions,
        index_schema_version=version.index_schema_version,
        correlation_id=version.correlation_id,
    )


def _outcome_marker_from_version(
    *,
    version: KnowledgeSourceVersionRecord,
    state: KnowledgeSourceVersionStateRecord,
    job_id: UUID,
) -> KnowledgeIngestionOutcomeMarker:
    parsed = _parsed_marker_from_version(version=version, state=state, job_id=job_id)
    if parsed.index_job_id is None:
        raise _outcome_invalid("Knowledge candidate is missing its durable index Job handoff")
    return KnowledgeIngestionOutcomeMarker(
        job_id=parsed.ingest_job_id,
        source_id=parsed.source_id,
        source_version_id=parsed.source_version_id,
        normalized_content_hash=parsed.normalized_content_hash,
        chunk_count=parsed.chunk_count,
        token_count=parsed.token_count,
        index_job_id=parsed.index_job_id,
    )


def _require_matching_marker(
    *,
    marker: KnowledgeParsedCandidateMarker,
    write: KnowledgeIngestionWrite,
) -> None:
    if (
        marker.ingest_job_id != write.job_id
        or marker.source_id != write.source_id
        or marker.source_version_id != write.source_version_id
        or marker.normalized_content_hash != write.normalized_content_hash
        or marker.chunk_count != len(write.chunks)
        or marker.token_count != sum(chunk.token_count for chunk in write.chunks)
    ):
        raise _outcome_invalid("Stored Knowledge ingestion marker conflicts with the canonical Job")


async def _database_time(conn: BaseDBAsyncClient) -> datetime:
    rows = await conn.execute_query_dict("SELECT clock_timestamp() AS database_time")
    if len(rows) != 1 or not isinstance(rows[0].get("database_time"), datetime):
        raise RuntimeError("PostgreSQL clock_timestamp() did not return one datetime")
    return cast(datetime, rows[0]["database_time"])


def _target_not_found() -> PermanentJobExecutionError:
    return PermanentJobExecutionError(
        code=KNOWLEDGE_INGESTION_TARGET_NOT_FOUND_CODE,
        safe_message="The Knowledge ingestion target is no longer available",
    )


def _source_stale(message: str) -> PermanentJobExecutionError:
    return PermanentJobExecutionError(
        code=KNOWLEDGE_INGESTION_SOURCE_STALE_CODE,
        safe_message=message,
    )


def _outcome_invalid(message: str) -> PermanentJobExecutionError:
    return PermanentJobExecutionError(
        code=KNOWLEDGE_INGESTION_OUTCOME_INVALID_CODE,
        safe_message=message,
    )


@asynccontextmanager
async def _translate_persistence_failures() -> AsyncIterator[None]:
    try:
        yield
    except Exception as exc:
        if not is_retryable_postgres_failure(exc):
            raise
        raise TransientJobExecutionError(
            code=KNOWLEDGE_INGESTION_PERSISTENCE_TEMPORARILY_UNAVAILABLE_CODE,
            safe_message="Knowledge ingestion persistence is temporarily unavailable",
        ) from exc
