from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from uuid import uuid4

import pytest

from src.modules.jobs.execution_errors import PermanentJobExecutionError
from src.modules.jobs.execution_registry import JobExecutionContext
from src.modules.workspaces.knowledge.indexing import (
    KnowledgeIndexActivationMarker,
    KnowledgeIndexActivationWrite,
    KnowledgeIndexCandidate,
    KnowledgeIndexChunk,
    KnowledgeIndexScanResult,
    KnowledgeVectorIndexReceipt,
)
from src.modules.workspaces.knowledge.indexing_contract import (
    KNOWLEDGE_INDEX_CONTENT_QUARANTINED_CODE,
    KNOWLEDGE_INDEX_EMBEDDING_RESPONSE_INVALID_CODE,
    KnowledgeSourceIndexJobInput,
    KnowledgeSourceIndexJobTarget,
)
from src.modules.workspaces.knowledge.indexing_handler import KnowledgeSourceIndexJobHandler


class _Context:
    def __init__(self, *, target: KnowledgeSourceIndexJobTarget, input_reference: KnowledgeSourceIndexJobInput) -> None:
        self.lease = SimpleNamespace(job_id=uuid4(), attempt_id=uuid4(), attempt_number=1)
        self.target = target
        self.input_reference = input_reference
        self.actor_user_id = uuid4()
        self.source_revision = input_reference.normalized_content_hash
        self.request_fingerprint = "f" * 64
        self.progress = []
        self.fenced_commits = 0

    def idempotency_key(self, *, step: str) -> str:
        assert step == "activate-indexed-version"
        return "d" * 64

    async def checkpoint(self):  # type: ignore[no-untyped-def]
        return SimpleNamespace(cancellation_requested=False)

    async def report_progress(self, update):  # type: ignore[no-untyped-def]
        self.progress.append(update)
        return SimpleNamespace(cancellation_requested=False)

    async def run_fenced_domain_commit(self, operation):  # type: ignore[no-untyped-def]
        self.fenced_commits += 1
        return await operation()


class _Store:
    def __init__(self, candidate: KnowledgeIndexCandidate) -> None:
        self.candidate = candidate
        self.activations: list[KnowledgeIndexActivationWrite] = []
        self.failures = []
        self.cancellations = []

    async def get_outcome_marker(self, *, target, job_id):  # type: ignore[no-untyped-def]
        _ = target, job_id
        return None

    async def get_candidate(self, *, target, input_reference, job_id, source_revision):  # type: ignore[no-untyped-def]
        assert target.candidate_version_id == self.candidate.source_version_id
        assert input_reference.normalized_content_hash == self.candidate.normalized_content_hash
        assert source_revision == self.candidate.normalized_content_hash
        return self.candidate

    async def activate(self, *, write: KnowledgeIndexActivationWrite) -> KnowledgeIndexActivationMarker:
        self.activations.append(write)
        return KnowledgeIndexActivationMarker(
            job_id=write.job_id,
            source_id=write.source_id,
            source_version_id=write.source_version_id,
            normalized_content_hash=write.normalized_content_hash,
            chunk_count=len(write.chunks),
            vector_dimensions=write.vector_dimensions,
            index_uid=write.index_uid,
            embedder_name=write.embedder_name,
        )

    async def cancel(self, *, target, job_id):  # type: ignore[no-untyped-def]
        self.cancellations.append((target, job_id))

    async def project_failure(self, *, target, job_id, error_code, safe_message, metadata):  # type: ignore[no-untyped-def]
        self.failures.append((target, job_id, error_code, safe_message, metadata))


class _Scanner:
    def __init__(self, results: tuple[KnowledgeIndexScanResult, ...]) -> None:
        self.results = results

    def scan(self, chunks: tuple[KnowledgeIndexChunk, ...]) -> tuple[KnowledgeIndexScanResult, ...]:
        assert len(chunks) == len(self.results)
        return self.results


class _Embedder:
    def __init__(self, vectors: tuple[tuple[float, ...], ...]) -> None:
        self.vectors = vectors
        self.calls = 0

    async def embed_documents(self, *, texts, model, dimensions):  # type: ignore[no-untyped-def]
        assert model == "text-embedding-3-small"
        assert dimensions == 3
        assert texts
        self.calls += 1
        return self.vectors


class _Index:
    def __init__(self) -> None:
        self.calls = 0

    async def replace_version(self, *, index_uid, embedder_name, vector_dimensions, documents):  # type: ignore[no-untyped-def]
        self.calls += 1
        return KnowledgeVectorIndexReceipt(
            index_uid=index_uid,
            embedder_name=embedder_name,
            document_ids=tuple(document.id for document in documents),
            provider_task_id="42",
        )


def _fixture() -> tuple[_Context, KnowledgeIndexCandidate]:
    workspace_id = uuid4()
    source_id = uuid4()
    version_id = uuid4()
    ingest_job_id = uuid4()
    chunks = (
        KnowledgeIndexChunk(
            id=uuid4(),
            ordinal=0,
            content_hash=f"sha256:{'b' * 64}",
            content_text="# Product\n\nApproved positioning.",
            citation_location={"sectionPath": ["Product"]},
            token_count=4,
            locale="en-US",
            metadata={},
            upstream_acl_tags=(),
        ),
        KnowledgeIndexChunk(
            id=uuid4(),
            ordinal=1,
            content_hash=f"sha256:{'c' * 64}",
            content_text="## Audience\n\nTeams building sites.",
            citation_location={"sectionPath": ["Product", "Audience"]},
            token_count=5,
            locale="en-US",
            metadata={},
            upstream_acl_tags=(),
        ),
    )
    input_reference = KnowledgeSourceIndexJobInput(
        ingest_job_id=ingest_job_id,
        normalized_content_hash=f"sha256:{'a' * 64}",
        chunk_count=len(chunks),
        embedding_model="text-embedding-3-small",
        embedding_version="2026-01",
        vector_dimensions=3,
        index_uid=f"arclayer_knowledge_{workspace_id.hex}",
        embedder_name="knowledge-default",
    )
    target = KnowledgeSourceIndexJobTarget(
        workspace_id=workspace_id,
        knowledge_base_id=uuid4(),
        source_id=source_id,
        candidate_version_id=version_id,
        entity_id=source_id,
    )
    candidate = KnowledgeIndexCandidate(
        workspace_id=workspace_id,
        knowledge_base_id=target.knowledge_base_id,
        source_id=source_id,
        source_version_id=version_id,
        ingest_job_id=ingest_job_id,
        normalized_content_hash=input_reference.normalized_content_hash,
        chunks=chunks,
    )
    return _Context(target=target, input_reference=input_reference), candidate


async def test_handler_indexes_clean_chunks_and_activates_once() -> None:
    context, candidate = _fixture()
    scans = tuple(
        KnowledgeIndexScanResult(chunk_id=chunk.id, status="clean", scanner_name="knowledge-rules", scanner_version="1")
        for chunk in candidate.chunks
    )
    store = _Store(candidate)
    embedder = _Embedder(((0.1, 0.2, 0.3), (0.4, 0.5, 0.6)))
    index = _Index()
    handler = KnowledgeSourceIndexJobHandler(
        store_factory=lambda: store,
        scanner=_Scanner(scans),
        embedder=embedder,
        vector_index=index,
    )

    result = await handler.execute(
        context=cast(
            JobExecutionContext[KnowledgeSourceIndexJobTarget, KnowledgeSourceIndexJobInput],
            context,
        )
    )

    assert result.status == "ready"
    assert result.outcome_job_id == context.lease.job_id
    assert result.chunk_count == 2
    assert context.fenced_commits == 1
    assert [update.phase for update in context.progress] == [
        "scanning",
        "embedding",
        "indexing",
        "activating",
        "activating",
    ]
    assert embedder.calls == index.calls == 1
    assert len(store.activations) == 1
    assert all(chunk.scan.status == "clean" for chunk in store.activations[0].chunks)


async def test_handler_quarantines_suspicious_content_before_provider_writes() -> None:
    context, candidate = _fixture()
    scans = (
        KnowledgeIndexScanResult(
            chunk_id=candidate.chunks[0].id,
            status="quarantined",
            scanner_name="knowledge-rules",
            scanner_version="1",
            rule="ignore_instructions",
        ),
        KnowledgeIndexScanResult(
            chunk_id=candidate.chunks[1].id,
            status="clean",
            scanner_name="knowledge-rules",
            scanner_version="1",
        ),
    )
    embedder = _Embedder(((0.1, 0.2, 0.3), (0.4, 0.5, 0.6)))
    index = _Index()
    handler = KnowledgeSourceIndexJobHandler(
        store_factory=lambda: _Store(candidate),
        scanner=_Scanner(scans),
        embedder=embedder,
        vector_index=index,
    )

    with pytest.raises(PermanentJobExecutionError) as raised:
        await handler.execute(context=cast(JobExecutionContext, context))

    assert raised.value.code == KNOWLEDGE_INDEX_CONTENT_QUARANTINED_CODE
    assert embedder.calls == index.calls == 0
    assert context.fenced_commits == 0


async def test_handler_rejects_embedding_dimension_mismatch_before_index_write() -> None:
    context, candidate = _fixture()
    scans = tuple(
        KnowledgeIndexScanResult(chunk_id=chunk.id, status="clean", scanner_name="knowledge-rules", scanner_version="1")
        for chunk in candidate.chunks
    )
    embedder = _Embedder(((0.1, 0.2), (0.4, 0.5)))
    index = _Index()
    handler = KnowledgeSourceIndexJobHandler(
        store_factory=lambda: _Store(candidate),
        scanner=_Scanner(scans),
        embedder=embedder,
        vector_index=index,
    )

    with pytest.raises(PermanentJobExecutionError) as raised:
        await handler.execute(context=cast(JobExecutionContext, context))

    assert raised.value.code == KNOWLEDGE_INDEX_EMBEDDING_RESPONSE_INVALID_CODE
    assert index.calls == 0
    assert context.fenced_commits == 0


async def test_handler_projects_quarantine_metadata_through_the_job_fence() -> None:
    context, candidate = _fixture()
    store = _Store(candidate)
    handler = KnowledgeSourceIndexJobHandler(
        store_factory=lambda: store,
        scanner=_Scanner(()),
        embedder=_Embedder(()),
        vector_index=_Index(),
    )
    error = PermanentJobExecutionError(
        code=KNOWLEDGE_INDEX_CONTENT_QUARANTINED_CODE,
        safe_message="Knowledge content matched security rule ignore_instructions",
        metadata={
            "chunkId": str(candidate.chunks[0].id),
            "rule": "ignore_instructions",
            "scannerName": "knowledge-rules",
            "scannerVersion": "1",
        },
    )

    handled = await handler.project_failure(
        context=cast(JobExecutionContext, context),
        error=error,
    )

    assert handled is None
    assert store.failures == [
        (
            context.target,
            context.lease.job_id,
            error.code,
            error.safe_message,
            error.metadata,
        )
    ]
    assert context.fenced_commits == 1


async def test_handler_projects_cancellation_through_the_job_fence() -> None:
    context, candidate = _fixture()
    store = _Store(candidate)
    handler = KnowledgeSourceIndexJobHandler(
        store_factory=lambda: store,
        scanner=_Scanner(()),
        embedder=_Embedder(()),
        vector_index=_Index(),
    )

    await handler.cancel(context=cast(JobExecutionContext, context))

    assert store.cancellations == [(context.target, context.lease.job_id)]
    assert context.fenced_commits == 1
