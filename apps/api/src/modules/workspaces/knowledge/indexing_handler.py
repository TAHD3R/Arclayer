from __future__ import annotations

import math
from collections.abc import Callable
from typing import Protocol
from uuid import UUID

from src.common.types.json_types import JsonObject
from src.modules.jobs.execution_errors import PermanentJobExecutionError
from src.modules.jobs.execution_registry import JobExecutionContext, JobHandlerTerminalError
from src.modules.jobs.execution_schema import JobProgressUpdate
from src.modules.workspaces.knowledge.indexing import (
    KnowledgeEmbeddingProvider,
    KnowledgeIndexActivationMarker,
    KnowledgeIndexActivationWrite,
    KnowledgeIndexCandidate,
    KnowledgeIndexedChunkWrite,
    KnowledgeIndexScanResult,
    KnowledgePromptInjectionScanner,
    KnowledgeVectorIndex,
    KnowledgeVectorIndexDocument,
)
from src.modules.workspaces.knowledge.indexing_contract import (
    KNOWLEDGE_INDEX_CONTENT_QUARANTINED_CODE,
    KNOWLEDGE_INDEX_EMBEDDING_RESPONSE_INVALID_CODE,
    KNOWLEDGE_INDEX_OUTCOME_INVALID_CODE,
    KnowledgeContentQuarantinedMetadata,
    KnowledgeIndexReference,
    KnowledgeSourceIndexJobInput,
    KnowledgeSourceIndexJobResult,
    KnowledgeSourceIndexJobTarget,
)

_INDEX_PROGRESS_TOTAL = 4


class KnowledgeIndexStore(Protocol):
    async def get_outcome_marker(
        self,
        *,
        target: KnowledgeSourceIndexJobTarget,
        job_id: UUID,
    ) -> KnowledgeIndexActivationMarker | None: ...

    async def get_candidate(
        self,
        *,
        target: KnowledgeSourceIndexJobTarget,
        input_reference: KnowledgeSourceIndexJobInput,
        job_id: UUID,
        source_revision: str | None,
    ) -> KnowledgeIndexCandidate: ...

    async def activate(
        self,
        *,
        write: KnowledgeIndexActivationWrite,
    ) -> KnowledgeIndexActivationMarker: ...

    async def cancel(
        self,
        *,
        target: KnowledgeSourceIndexJobTarget,
        job_id: UUID,
    ) -> None: ...

    async def project_failure(
        self,
        *,
        target: KnowledgeSourceIndexJobTarget,
        job_id: UUID,
        error_code: str,
        safe_message: str,
        metadata: JsonObject | None,
    ) -> None: ...


class KnowledgeSourceIndexJobHandler:
    """Scan, embed, index, and atomically activate one immutable candidate."""

    def __init__(
        self,
        *,
        store_factory: Callable[[], KnowledgeIndexStore],
        scanner: KnowledgePromptInjectionScanner,
        embedder: KnowledgeEmbeddingProvider,
        vector_index: KnowledgeVectorIndex,
    ) -> None:
        self._store_factory = store_factory
        self._scanner = scanner
        self._embedder = embedder
        self._vector_index = vector_index

    async def reconcile(
        self,
        *,
        context: JobExecutionContext[KnowledgeSourceIndexJobTarget, KnowledgeSourceIndexJobInput],
    ) -> KnowledgeSourceIndexJobResult | None:
        marker = await self._store_factory().get_outcome_marker(
            target=context.target,
            job_id=context.lease.job_id,
        )
        return None if marker is None else _result(marker=marker, context=context)

    async def execute(
        self,
        *,
        context: JobExecutionContext[KnowledgeSourceIndexJobTarget, KnowledgeSourceIndexJobInput],
    ) -> KnowledgeSourceIndexJobResult:
        await context.report_progress(_progress(phase="scanning", completed=0))
        store = self._store_factory()
        candidate = await store.get_candidate(
            target=context.target,
            input_reference=context.input_reference,
            job_id=context.lease.job_id,
            source_revision=context.source_revision,
        )
        scans = self._scanner.scan(candidate.chunks)
        _validate_scans(candidate=candidate, scans=scans)

        await context.report_progress(_progress(phase="embedding", completed=1))
        vectors = await self._embedder.embed_documents(
            texts=tuple(chunk.content_text for chunk in candidate.chunks),
            model=context.input_reference.embedding_model,
            dimensions=context.input_reference.vector_dimensions,
        )
        _validate_vectors(
            vectors=vectors,
            expected_count=len(candidate.chunks),
            expected_dimensions=context.input_reference.vector_dimensions,
        )
        await context.checkpoint()

        await context.report_progress(_progress(phase="indexing", completed=2))
        documents = tuple(
            KnowledgeVectorIndexDocument(
                id=chunk.id,
                workspace_id=candidate.workspace_id,
                knowledge_base_id=candidate.knowledge_base_id,
                source_id=candidate.source_id,
                source_version_id=candidate.source_version_id,
                ordinal=chunk.ordinal,
                content=chunk.content_text,
                content_hash=chunk.content_hash,
                locale=chunk.locale,
                upstream_acl_tags=chunk.upstream_acl_tags,
                vector=vector,
            )
            for chunk, vector in zip(candidate.chunks, vectors, strict=True)
        )
        receipt = await self._vector_index.replace_version(
            index_uid=context.input_reference.index_uid,
            embedder_name=context.input_reference.embedder_name,
            vector_dimensions=context.input_reference.vector_dimensions,
            documents=documents,
        )
        _validate_receipt(
            receipt_index_uid=receipt.index_uid,
            receipt_embedder_name=receipt.embedder_name,
            receipt_document_ids=receipt.document_ids,
            expected_index_uid=context.input_reference.index_uid,
            expected_embedder_name=context.input_reference.embedder_name,
            expected_document_ids=tuple(document.id for document in documents),
        )

        await context.report_progress(_progress(phase="activating", completed=3))
        scan_by_chunk_id = {scan.chunk_id: scan for scan in scans}
        write = KnowledgeIndexActivationWrite(
            job_id=context.lease.job_id,
            workspace_id=candidate.workspace_id,
            knowledge_base_id=candidate.knowledge_base_id,
            source_id=candidate.source_id,
            source_version_id=candidate.source_version_id,
            ingest_job_id=candidate.ingest_job_id,
            normalized_content_hash=candidate.normalized_content_hash,
            embedding_provider=context.input_reference.embedding_provider,
            embedding_model=context.input_reference.embedding_model,
            embedding_version=context.input_reference.embedding_version,
            vector_dimensions=context.input_reference.vector_dimensions,
            index_uid=receipt.index_uid,
            embedder_name=receipt.embedder_name,
            provider_task_id=receipt.provider_task_id,
            chunks=tuple(
                KnowledgeIndexedChunkWrite(
                    id=document.id,
                    scan=scan_by_chunk_id[document.id],
                    embedding_reference={
                        "backend": "meilisearch",
                        "indexUid": receipt.index_uid,
                        "documentId": str(document.id),
                        "embedderName": receipt.embedder_name,
                        "providerTaskId": receipt.provider_task_id,
                    },
                )
                for document in documents
            ),
        )
        marker = await context.run_fenced_domain_commit(lambda: store.activate(write=write))
        result = _result(marker=marker, context=context)
        await context.report_progress(_progress(phase="activating", completed=_INDEX_PROGRESS_TOTAL))
        return result

    async def cancel(
        self,
        *,
        context: JobExecutionContext[KnowledgeSourceIndexJobTarget, KnowledgeSourceIndexJobInput],
    ) -> None:
        store = self._store_factory()
        await context.run_fenced_domain_commit(lambda: store.cancel(target=context.target, job_id=context.lease.job_id))

    async def project_failure(
        self,
        *,
        context: JobExecutionContext[KnowledgeSourceIndexJobTarget, KnowledgeSourceIndexJobInput],
        error: JobHandlerTerminalError,
    ) -> None:
        store = self._store_factory()
        await context.run_fenced_domain_commit(
            lambda: store.project_failure(
                target=context.target,
                job_id=context.lease.job_id,
                error_code=error.code,
                safe_message=error.safe_message,
                metadata=error.metadata,
            )
        )


def _validate_scans(
    *,
    candidate: KnowledgeIndexCandidate,
    scans: tuple[KnowledgeIndexScanResult, ...],
) -> None:
    expected_ids = tuple(chunk.id for chunk in candidate.chunks)
    actual_ids = tuple(scan.chunk_id for scan in scans)
    if actual_ids != expected_ids:
        raise PermanentJobExecutionError(
            code=KNOWLEDGE_INDEX_OUTCOME_INVALID_CODE,
            safe_message="Knowledge security scan results do not match the candidate chunks",
        )
    quarantined = next((scan for scan in scans if scan.status == "quarantined"), None)
    if quarantined is not None:
        rule = quarantined.rule
        if rule is None:
            raise PermanentJobExecutionError(
                code=KNOWLEDGE_INDEX_OUTCOME_INVALID_CODE,
                safe_message="Knowledge quarantine scan is missing its matched rule",
            )
        raise PermanentJobExecutionError(
            code=KNOWLEDGE_INDEX_CONTENT_QUARANTINED_CODE,
            safe_message=f"Knowledge content matched security rule {rule}",
            metadata=KnowledgeContentQuarantinedMetadata(
                chunk_id=quarantined.chunk_id,
                rule=rule,
                scanner_name=quarantined.scanner_name,
                scanner_version=quarantined.scanner_version,
            ).model_dump(mode="json", by_alias=True),
        )


def _validate_vectors(
    *,
    vectors: tuple[tuple[float, ...], ...],
    expected_count: int,
    expected_dimensions: int,
) -> None:
    if len(vectors) != expected_count or any(
        len(vector) != expected_dimensions or any(not math.isfinite(value) for value in vector) for vector in vectors
    ):
        raise PermanentJobExecutionError(
            code=KNOWLEDGE_INDEX_EMBEDDING_RESPONSE_INVALID_CODE,
            safe_message="Embedding provider returned an incompatible Knowledge vector batch",
        )


def _validate_receipt(
    *,
    receipt_index_uid: str,
    receipt_embedder_name: str,
    receipt_document_ids: tuple[UUID, ...],
    expected_index_uid: str,
    expected_embedder_name: str,
    expected_document_ids: tuple[UUID, ...],
) -> None:
    if (
        receipt_index_uid != expected_index_uid
        or receipt_embedder_name != expected_embedder_name
        or receipt_document_ids != expected_document_ids
    ):
        raise PermanentJobExecutionError(
            code=KNOWLEDGE_INDEX_OUTCOME_INVALID_CODE,
            safe_message="Vector index receipt does not match the Knowledge candidate",
        )


def _result(
    *,
    marker: KnowledgeIndexActivationMarker,
    context: JobExecutionContext[KnowledgeSourceIndexJobTarget, KnowledgeSourceIndexJobInput],
) -> KnowledgeSourceIndexJobResult:
    if (
        marker.job_id != context.lease.job_id
        or marker.source_id != context.target.source_id
        or marker.source_version_id != context.target.candidate_version_id
        or marker.normalized_content_hash != context.input_reference.normalized_content_hash
        or marker.chunk_count != context.input_reference.chunk_count
        or marker.vector_dimensions != context.input_reference.vector_dimensions
        or marker.index_uid != context.input_reference.index_uid
        or marker.embedder_name != context.input_reference.embedder_name
    ):
        raise PermanentJobExecutionError(
            code=KNOWLEDGE_INDEX_OUTCOME_INVALID_CODE,
            safe_message="The stored Knowledge index outcome conflicts with the canonical Job",
        )
    return KnowledgeSourceIndexJobResult(
        source_id=marker.source_id,
        source_version_id=marker.source_version_id,
        normalized_content_hash=marker.normalized_content_hash,
        chunk_count=marker.chunk_count,
        vector_dimensions=marker.vector_dimensions,
        index_reference=KnowledgeIndexReference(
            index_uid=marker.index_uid,
            embedder_name=marker.embedder_name,
        ),
        outcome_job_id=marker.job_id,
    )


def _progress(*, phase: str, completed: int) -> JobProgressUpdate:
    return JobProgressUpdate(
        phase=phase,
        status_key=f"WORKSPACE_KNOWLEDGE_INDEX_STATUS_{phase.upper()}",
        progress_completed=completed,
        progress_total=_INDEX_PROGRESS_TOTAL,
    )
