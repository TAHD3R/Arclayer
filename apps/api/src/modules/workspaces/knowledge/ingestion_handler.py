from __future__ import annotations

from collections.abc import Callable
from typing import Protocol
from uuid import UUID

from src.modules.jobs.execution_errors import PermanentJobExecutionError
from src.modules.jobs.execution_registry import JobExecutionContext, JobHandlerTerminalError
from src.modules.jobs.execution_schema import JobProgressUpdate
from src.modules.workspaces.knowledge.ingestion import (
    KnowledgeDocumentParser,
    KnowledgeIngestionDocument,
    KnowledgeIngestionOutcomeMarker,
    KnowledgeIngestionParseError,
    KnowledgeIngestionWrite,
)
from src.modules.workspaces.knowledge.ingestion_contract import (
    KNOWLEDGE_INGESTION_CONTENT_INVALID_CODE,
    KNOWLEDGE_INGESTION_OUTCOME_INVALID_CODE,
    KnowledgeSourceIngestJobInput,
    KnowledgeSourceIngestJobResult,
    KnowledgeSourceIngestJobTarget,
)

_INGEST_PROGRESS_TOTAL = 3


class KnowledgeIngestionStore(Protocol):
    async def get_outcome_marker(
        self,
        *,
        target: KnowledgeSourceIngestJobTarget,
        job_id: UUID,
    ) -> KnowledgeIngestionOutcomeMarker | None: ...

    async def get_document(
        self,
        *,
        target: KnowledgeSourceIngestJobTarget,
        input_reference: KnowledgeSourceIngestJobInput,
        job_id: UUID,
        source_revision: str | None,
    ) -> KnowledgeIngestionDocument: ...

    async def commit_parsed(
        self,
        *,
        write: KnowledgeIngestionWrite,
    ) -> KnowledgeIngestionOutcomeMarker: ...

    async def cancel(
        self,
        *,
        target: KnowledgeSourceIngestJobTarget,
        job_id: UUID,
    ) -> None: ...

    async def project_failure(
        self,
        *,
        target: KnowledgeSourceIngestJobTarget,
        job_id: UUID,
        error_code: str,
        safe_message: str,
    ) -> None: ...


class KnowledgeSourceIngestJobHandler:
    """Parse one immutable manual version and persist chunks behind the Job fence."""

    def __init__(
        self,
        *,
        repository_factory: Callable[[], KnowledgeIngestionStore],
        parser: KnowledgeDocumentParser,
    ) -> None:
        self._repository_factory = repository_factory
        self._parser = parser

    async def reconcile(
        self,
        *,
        context: JobExecutionContext[KnowledgeSourceIngestJobTarget, KnowledgeSourceIngestJobInput],
    ) -> KnowledgeSourceIngestJobResult | None:
        marker = await self._repository_factory().get_outcome_marker(
            target=context.target,
            job_id=context.lease.job_id,
        )
        return None if marker is None else _result(marker=marker, context=context)

    async def execute(
        self,
        *,
        context: JobExecutionContext[KnowledgeSourceIngestJobTarget, KnowledgeSourceIngestJobInput],
    ) -> KnowledgeSourceIngestJobResult:
        await context.report_progress(_progress(phase="parsing", completed=0))
        repository = self._repository_factory()
        document = await repository.get_document(
            target=context.target,
            input_reference=context.input_reference,
            job_id=context.lease.job_id,
            source_revision=context.source_revision,
        )
        try:
            chunks = self._parser.parse(document)
        except KnowledgeIngestionParseError as exc:
            raise PermanentJobExecutionError(
                code=KNOWLEDGE_INGESTION_CONTENT_INVALID_CODE,
                safe_message=str(exc),
            ) from exc
        await context.report_progress(_progress(phase="chunking", completed=1))
        await context.checkpoint()
        await context.report_progress(_progress(phase="persisting", completed=2))
        write = KnowledgeIngestionWrite(
            job_id=context.lease.job_id,
            actor_user_id=_require_actor_user_id(context.actor_user_id),
            workspace_id=context.target.workspace_id,
            knowledge_base_id=context.target.knowledge_base_id,
            source_id=context.target.source_id,
            source_version_id=document.source_version_id,
            source_kind=document.source_kind,
            ingestion_mode=document.ingestion_mode,
            source_revision=document.source_revision,
            source_content_hash=document.source_content_hash,
            normalized_content_hash=document.normalized_content_hash,
            content_text=document.content,
            parser_name=document.parser_name,
            parser_version=document.parser_version,
            chunker_name=document.chunker_name,
            chunker_version=document.chunker_version,
            index_schema_version=document.index_schema_version,
            fetch_provenance=document.fetch_provenance,
            locale=document.locale,
            title=document.title,
            document_metadata=document.document_metadata,
            chunks=chunks,
        )
        marker = await context.run_fenced_domain_commit(lambda: repository.commit_parsed(write=write))
        result = _result(marker=marker, context=context)
        await context.report_progress(_progress(phase="persisting", completed=_INGEST_PROGRESS_TOTAL))
        return result

    async def cancel(
        self,
        *,
        context: JobExecutionContext[KnowledgeSourceIngestJobTarget, KnowledgeSourceIngestJobInput],
    ) -> None:
        repository = self._repository_factory()
        await context.run_fenced_domain_commit(
            lambda: repository.cancel(
                target=context.target,
                job_id=context.lease.job_id,
            )
        )

    async def project_failure(
        self,
        *,
        context: JobExecutionContext[KnowledgeSourceIngestJobTarget, KnowledgeSourceIngestJobInput],
        error: JobHandlerTerminalError,
    ) -> None:
        repository = self._repository_factory()
        await context.run_fenced_domain_commit(
            lambda: repository.project_failure(
                target=context.target,
                job_id=context.lease.job_id,
                error_code=error.code,
                safe_message=error.safe_message,
            )
        )


def _result(
    *,
    marker: KnowledgeIngestionOutcomeMarker,
    context: JobExecutionContext[KnowledgeSourceIngestJobTarget, KnowledgeSourceIngestJobInput],
) -> KnowledgeSourceIngestJobResult:
    if (
        marker.job_id != context.lease.job_id
        or marker.source_id != context.target.source_id
        or (
            context.target.candidate_version_id is not None
            and marker.source_version_id != context.target.candidate_version_id
        )
        or (
            context.input_reference.normalized_content_hash is not None
            and marker.normalized_content_hash != context.input_reference.normalized_content_hash
        )
    ):
        raise PermanentJobExecutionError(
            code=KNOWLEDGE_INGESTION_OUTCOME_INVALID_CODE,
            safe_message="The stored Knowledge ingestion outcome conflicts with the canonical Job",
        )
    return KnowledgeSourceIngestJobResult(
        source_id=marker.source_id,
        source_version_id=marker.source_version_id,
        normalized_content_hash=marker.normalized_content_hash,
        chunk_count=marker.chunk_count,
        token_count=marker.token_count,
        outcome_job_id=marker.job_id,
        index_job_id=marker.index_job_id,
    )


def _progress(*, phase: str, completed: int) -> JobProgressUpdate:
    return JobProgressUpdate(
        phase=phase,
        status_key=f"WORKSPACE_KNOWLEDGE_INGESTION_STATUS_{phase.upper()}",
        progress_completed=completed,
        progress_total=_INGEST_PROGRESS_TOTAL,
    )


def _require_actor_user_id(actor_user_id: UUID | None) -> UUID:
    if actor_user_id is None:
        raise PermanentJobExecutionError(
            code=KNOWLEDGE_INGESTION_OUTCOME_INVALID_CODE,
            safe_message="Knowledge ingestion Job is missing its actor authority",
        )
    return actor_user_id
