from __future__ import annotations

import hashlib
from types import SimpleNamespace
from typing import cast
from uuid import UUID, uuid4

from src.modules.jobs.execution_errors import TransientJobExecutionError
from src.modules.jobs.execution_registry import JobExecutionContext
from src.modules.workspaces.knowledge.ingestion import (
    KnowledgeIngestionDocument,
    KnowledgeIngestionOutcomeMarker,
    KnowledgeIngestionWrite,
    ManualMarkdownKnowledgeParser,
)
from src.modules.workspaces.knowledge.ingestion_contract import (
    KnowledgeSourceIngestJobInput,
    KnowledgeSourceIngestJobTarget,
)
from src.modules.workspaces.knowledge.ingestion_handler import KnowledgeSourceIngestJobHandler


class _Context:
    def __init__(self, *, target: KnowledgeSourceIngestJobTarget, content_hash: str) -> None:
        self.lease = SimpleNamespace(job_id=uuid4(), attempt_id=uuid4(), attempt_number=1)
        self.target = target
        self.input_reference = KnowledgeSourceIngestJobInput(
            source_kind="manual",
            ingestion_mode="initial",
            source_revision=content_hash,
            normalized_content_hash=content_hash,
            parser_name="manual-markdown",
        )
        self.actor_user_id = uuid4()
        self.source_revision = self.input_reference.source_revision
        self.request_fingerprint = "f" * 64
        self.progress = []
        self.fenced_commits = 0

    def idempotency_key(self, *, step: str) -> str:
        assert step == "persist-parsed-chunks"
        return "d" * 64

    async def checkpoint(self):  # type: ignore[no-untyped-def]
        return SimpleNamespace(cancellation_requested=False)

    async def report_progress(self, update):  # type: ignore[no-untyped-def]
        self.progress.append(update)
        return SimpleNamespace(cancellation_requested=False)

    async def run_fenced_domain_commit(self, operation):  # type: ignore[no-untyped-def]
        self.fenced_commits += 1
        return await operation()


class _Repository:
    def __init__(self, *, document: KnowledgeIngestionDocument) -> None:
        self.document = document
        self.index_job_id = uuid4()
        self.writes: list[KnowledgeIngestionWrite] = []
        self.failures: list[tuple[KnowledgeSourceIngestJobTarget, UUID, str, str]] = []
        self.cancellations: list[tuple[KnowledgeSourceIngestJobTarget, UUID]] = []

    async def get_outcome_marker(self, *, target, job_id):  # type: ignore[no-untyped-def]
        _ = target, job_id
        return None

    async def get_document(self, *, target, input_reference, job_id, source_revision):  # type: ignore[no-untyped-def]
        assert target.candidate_version_id == self.document.source_version_id
        assert input_reference.normalized_content_hash == self.document.normalized_content_hash
        assert job_id == self.document.provenance_job_id
        assert source_revision == self.document.normalized_content_hash
        return self.document

    async def commit_parsed(self, *, write: KnowledgeIngestionWrite) -> KnowledgeIngestionOutcomeMarker:
        self.writes.append(write)
        assert write.source_version_id is not None
        return KnowledgeIngestionOutcomeMarker(
            job_id=write.job_id,
            source_id=write.source_id,
            source_version_id=write.source_version_id,
            normalized_content_hash=write.normalized_content_hash,
            chunk_count=len(write.chunks),
            token_count=sum(chunk.token_count for chunk in write.chunks),
            index_job_id=self.index_job_id,
        )

    async def cancel(self, *, target, job_id):  # type: ignore[no-untyped-def]
        self.cancellations.append((target, job_id))

    async def project_failure(self, *, target, job_id, error_code, safe_message):  # type: ignore[no-untyped-def]
        self.failures.append((target, job_id, error_code, safe_message))


async def test_handler_parses_manual_markdown_and_commits_chunks_once() -> None:
    workspace_id = uuid4()
    base_id = uuid4()
    source_id = uuid4()
    version_id = uuid4()
    content = "# Product\n\nApproved positioning.\n\n## Audience\n\nTeams building sites."
    content_hash = f"sha256:{hashlib.sha256(content.encode('utf-8')).hexdigest()}"
    target = KnowledgeSourceIngestJobTarget(
        workspace_id=workspace_id,
        knowledge_base_id=base_id,
        source_id=source_id,
        candidate_version_id=version_id,
        entity_id=source_id,
    )
    context = _Context(target=target, content_hash=content_hash)
    document = KnowledgeIngestionDocument(
        workspace_id=workspace_id,
        knowledge_base_id=base_id,
        source_id=source_id,
        source_version_id=version_id,
        provenance_job_id=cast(UUID, context.lease.job_id),
        source_kind="manual",
        ingestion_mode="initial",
        source_revision=content_hash,
        source_content_hash=content_hash,
        normalized_content_hash=content_hash,
        parser_name="manual-markdown",
        locale="en-US",
        title="Product truth",
        content=content,
        document_metadata={"owner": "Product"},
    )
    repository = _Repository(document=document)
    handler = KnowledgeSourceIngestJobHandler(
        repository_factory=lambda: repository,
        parser=ManualMarkdownKnowledgeParser(),
    )

    result = await handler.execute(
        context=cast(
            JobExecutionContext[KnowledgeSourceIngestJobTarget, KnowledgeSourceIngestJobInput],
            context,
        )
    )

    assert result.status == "awaiting_index"
    assert result.outcome_job_id == context.lease.job_id
    assert result.index_job_id == repository.index_job_id
    assert result.chunk_count == 2
    assert result.token_count > 0
    assert context.fenced_commits == 1
    assert [update.phase for update in context.progress] == [
        "parsing",
        "chunking",
        "persisting",
        "persisting",
    ]
    assert len(repository.writes) == 1
    assert [chunk.content_text for chunk in repository.writes[0].chunks] == [
        "# Product\n\nApproved positioning.",
        "## Audience\n\nTeams building sites.",
    ]
    assert [chunk.citation_location["sectionPath"] for chunk in repository.writes[0].chunks] == [
        ["Product"],
        ["Product", "Audience"],
    ]
    assert all(chunk.retrieval_eligible is False for chunk in repository.writes[0].chunks)


async def test_handler_projects_domain_failure_without_changing_retry_classification() -> None:
    workspace_id = uuid4()
    source_id = uuid4()
    version_id = uuid4()
    content = "# Product\n\nApproved positioning."
    content_hash = f"sha256:{hashlib.sha256(content.encode('utf-8')).hexdigest()}"
    target = KnowledgeSourceIngestJobTarget(
        workspace_id=workspace_id,
        knowledge_base_id=uuid4(),
        source_id=source_id,
        candidate_version_id=version_id,
        entity_id=source_id,
    )
    context = _Context(target=target, content_hash=content_hash)
    repository = _Repository(
        document=KnowledgeIngestionDocument(
            workspace_id=workspace_id,
            knowledge_base_id=target.knowledge_base_id,
            source_id=source_id,
            source_version_id=version_id,
            provenance_job_id=cast(UUID, context.lease.job_id),
            source_kind="manual",
            ingestion_mode="initial",
            source_revision=content_hash,
            source_content_hash=content_hash,
            normalized_content_hash=content_hash,
            parser_name="manual-markdown",
            locale="en-US",
            content=content,
        )
    )
    handler = KnowledgeSourceIngestJobHandler(
        repository_factory=lambda: repository,
        parser=ManualMarkdownKnowledgeParser(),
    )
    error = TransientJobExecutionError(
        code="KNOWLEDGE_INGESTION_PERSISTENCE_TEMPORARILY_UNAVAILABLE",
        safe_message="Knowledge persistence is temporarily unavailable",
    )

    handled = await handler.project_failure(
        context=cast(
            JobExecutionContext[KnowledgeSourceIngestJobTarget, KnowledgeSourceIngestJobInput],
            context,
        ),
        error=error,
    )

    assert handled is None
    assert repository.failures == [
        (
            target,
            context.lease.job_id,
            error.code,
            error.safe_message,
        )
    ]
    assert context.fenced_commits == 1


async def test_handler_projects_cancellation_through_the_job_fence() -> None:
    workspace_id = uuid4()
    source_id = uuid4()
    version_id = uuid4()
    content = "# Product\n\nApproved positioning."
    content_hash = f"sha256:{hashlib.sha256(content.encode('utf-8')).hexdigest()}"
    target = KnowledgeSourceIngestJobTarget(
        workspace_id=workspace_id,
        knowledge_base_id=uuid4(),
        source_id=source_id,
        candidate_version_id=version_id,
        entity_id=source_id,
    )
    context = _Context(target=target, content_hash=content_hash)
    repository = _Repository(
        document=KnowledgeIngestionDocument(
            workspace_id=workspace_id,
            knowledge_base_id=target.knowledge_base_id,
            source_id=source_id,
            source_version_id=version_id,
            provenance_job_id=cast(UUID, context.lease.job_id),
            source_kind="manual",
            ingestion_mode="initial",
            source_revision=content_hash,
            source_content_hash=content_hash,
            normalized_content_hash=content_hash,
            parser_name="manual-markdown",
            locale="en-US",
            content=content,
        )
    )
    handler = KnowledgeSourceIngestJobHandler(
        repository_factory=lambda: repository,
        parser=ManualMarkdownKnowledgeParser(),
    )

    await handler.cancel(
        context=cast(
            JobExecutionContext[KnowledgeSourceIngestJobTarget, KnowledgeSourceIngestJobInput],
            context,
        )
    )

    assert repository.cancellations == [(target, context.lease.job_id)]
    assert context.fenced_commits == 1
