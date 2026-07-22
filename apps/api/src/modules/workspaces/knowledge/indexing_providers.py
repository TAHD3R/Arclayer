from __future__ import annotations

import asyncio
from collections.abc import Sequence
from typing import Any, cast

import httpx

from src.modules.jobs.execution_errors import PermanentJobExecutionError, TransientJobExecutionError
from src.modules.projects.agents.prompt_injection import detect_prompt_injection
from src.modules.workspaces.knowledge.indexing import (
    KnowledgeIndexChunk,
    KnowledgeIndexScanResult,
    KnowledgeVectorIndexDocument,
    KnowledgeVectorIndexReceipt,
)
from src.modules.workspaces.knowledge.indexing_contract import (
    KNOWLEDGE_INDEX_EMBEDDING_RESPONSE_INVALID_CODE,
    KNOWLEDGE_INDEX_EMBEDDING_TEMPORARILY_UNAVAILABLE_CODE,
    KNOWLEDGE_INDEX_OUTCOME_INVALID_CODE,
    KNOWLEDGE_INDEX_PROVIDER_CONFIGURATION_INVALID_CODE,
    KNOWLEDGE_INDEX_PROVIDER_TEMPORARILY_UNAVAILABLE_CODE,
)

_SEARCHABLE_ATTRIBUTES = ["content"]
_FILTERABLE_ATTRIBUTES = [
    "workspaceId",
    "knowledgeBaseId",
    "sourceId",
    "sourceVersionId",
    "locale",
    "upstreamAclTags",
]
_DISPLAYED_ATTRIBUTES = [
    "id",
    "workspaceId",
    "knowledgeBaseId",
    "sourceId",
    "sourceVersionId",
    "ordinal",
    "contentHash",
    "locale",
    "upstreamAclTags",
]


class RuleBasedKnowledgePromptInjectionScanner:
    """Knowledge-specific projection over the shared deterministic rule detector."""

    scanner_name = "knowledge-rules"
    scanner_version = "1"

    def scan(self, chunks: tuple[KnowledgeIndexChunk, ...]) -> tuple[KnowledgeIndexScanResult, ...]:
        return tuple(self._scan_chunk(chunk) for chunk in chunks)

    def _scan_chunk(self, chunk: KnowledgeIndexChunk) -> KnowledgeIndexScanResult:
        finding = detect_prompt_injection(
            chunk.content_text,
            source=f"knowledge.chunk[{chunk.ordinal}]",
        )
        if finding is None:
            return KnowledgeIndexScanResult(
                chunk_id=chunk.id,
                status="clean",
                scanner_name=self.scanner_name,
                scanner_version=self.scanner_version,
            )
        return KnowledgeIndexScanResult(
            chunk_id=chunk.id,
            status="quarantined",
            scanner_name=self.scanner_name,
            scanner_version=self.scanner_version,
            rule=finding.rule,
        )


class LiteLLMKnowledgeEmbeddingProvider:
    def __init__(
        self,
        *,
        base_url: str,
        api_key: str | None,
        timeout_seconds: float,
        transport: httpx.AsyncBaseTransport | None = None,
        enabled: bool = True,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._timeout_seconds = timeout_seconds
        self._transport = transport
        self._enabled = enabled

    async def embed_documents(
        self,
        *,
        texts: tuple[str, ...],
        model: str,
        dimensions: int,
    ) -> tuple[tuple[float, ...], ...]:
        if not self._enabled:
            raise PermanentJobExecutionError(
                code=KNOWLEDGE_INDEX_PROVIDER_CONFIGURATION_INVALID_CODE,
                safe_message="Workspace Knowledge indexing is not enabled",
            )
        payload = await self._post_embeddings({
            "input": list(texts),
            "model": model,
            "encoding_format": "float",
            "dimensions": dimensions,
        })
        return _parse_embedding_response(payload=payload, expected_count=len(texts))

    async def _post_embeddings(self, payload: dict[str, Any]) -> dict[str, Any]:
        headers = {"Authorization": f"Bearer {self._api_key}"} if self._api_key else {}
        try:
            async with httpx.AsyncClient(
                timeout=self._timeout_seconds,
                transport=self._transport,
            ) as client:
                response = await client.post(
                    f"{self._base_url}/embeddings",
                    headers=headers,
                    json=payload,
                )
        except httpx.HTTPError as exc:
            raise TransientJobExecutionError(
                code=KNOWLEDGE_INDEX_EMBEDDING_TEMPORARILY_UNAVAILABLE_CODE,
                safe_message="Knowledge embedding provider is temporarily unavailable",
            ) from exc
        if response.status_code == 429 or response.status_code >= 500:
            raise TransientJobExecutionError(
                code=KNOWLEDGE_INDEX_EMBEDDING_TEMPORARILY_UNAVAILABLE_CODE,
                safe_message="Knowledge embedding provider is temporarily unavailable",
            )
        if response.status_code >= 400:
            raise PermanentJobExecutionError(
                code=KNOWLEDGE_INDEX_PROVIDER_CONFIGURATION_INVALID_CODE,
                safe_message="Knowledge embedding provider rejected the configured request",
            )
        return _require_json_object(
            response=response,
            error_code=KNOWLEDGE_INDEX_EMBEDDING_RESPONSE_INVALID_CODE,
            safe_message="Knowledge embedding provider returned an invalid response",
        )


class MeilisearchKnowledgeVectorIndex:
    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        timeout_seconds: float,
        poll_interval_seconds: float,
        transport: httpx.AsyncBaseTransport | None = None,
        enabled: bool = True,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._timeout_seconds = timeout_seconds
        self._poll_interval_seconds = poll_interval_seconds
        self._transport = transport
        self._enabled = enabled

    async def replace_version(
        self,
        *,
        index_uid: str,
        embedder_name: str,
        vector_dimensions: int,
        documents: tuple[KnowledgeVectorIndexDocument, ...],
    ) -> KnowledgeVectorIndexReceipt:
        if not self._enabled:
            raise PermanentJobExecutionError(
                code=KNOWLEDGE_INDEX_PROVIDER_CONFIGURATION_INVALID_CODE,
                safe_message="Workspace Knowledge indexing is not enabled",
            )
        create_task_id = await self._submit(
            "put",
            f"/indexes/{index_uid}",
            json={"uid": index_uid, "primaryKey": "id"},
        )
        await self._wait_for_task(create_task_id)

        settings_task_id = await self._submit(
            "patch",
            f"/indexes/{index_uid}/settings",
            json={
                "searchableAttributes": _SEARCHABLE_ATTRIBUTES,
                "filterableAttributes": _FILTERABLE_ATTRIBUTES,
                "displayedAttributes": _DISPLAYED_ATTRIBUTES,
                "embedders": {
                    embedder_name: {
                        "source": "userProvided",
                        "dimensions": vector_dimensions,
                    }
                },
            },
        )
        await self._wait_for_task(settings_task_id)

        documents_task_id = await self._submit(
            "post",
            f"/indexes/{index_uid}/documents",
            params={"primaryKey": "id"},
            json=[_document_payload(document=document, embedder_name=embedder_name) for document in documents],
        )
        await self._wait_for_task(documents_task_id)
        return KnowledgeVectorIndexReceipt(
            index_uid=index_uid,
            embedder_name=embedder_name,
            document_ids=tuple(document.id for document in documents),
            provider_task_id=documents_task_id,
        )

    async def _submit(self, method: str, path: str, **kwargs: Any) -> str:
        payload = await self._request(method, path, **kwargs)
        task_uid = payload.get("taskUid")
        if isinstance(task_uid, bool) or not isinstance(task_uid, int | str):
            raise PermanentJobExecutionError(
                code=KNOWLEDGE_INDEX_OUTCOME_INVALID_CODE,
                safe_message="Knowledge vector index did not return a task reference",
            )
        return str(task_uid)

    async def _wait_for_task(self, task_id: str) -> None:
        while True:
            payload = await self._request("get", f"/tasks/{task_id}")
            status = payload.get("status")
            if status == "succeeded":
                return
            if status in {"enqueued", "processing"}:
                await asyncio.sleep(self._poll_interval_seconds)
                continue
            if status == "failed":
                error = payload.get("error")
                error_type = error.get("type") if isinstance(error, dict) else None
                if error_type == "internal":
                    raise TransientJobExecutionError(
                        code=KNOWLEDGE_INDEX_PROVIDER_TEMPORARILY_UNAVAILABLE_CODE,
                        safe_message="Knowledge vector index task failed temporarily",
                    )
                raise PermanentJobExecutionError(
                    code=KNOWLEDGE_INDEX_PROVIDER_CONFIGURATION_INVALID_CODE,
                    safe_message="Knowledge vector index rejected the configured task",
                )
            raise PermanentJobExecutionError(
                code=KNOWLEDGE_INDEX_OUTCOME_INVALID_CODE,
                safe_message="Knowledge vector index returned an invalid task status",
            )

    async def _request(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        headers = {"Authorization": f"Bearer {self._api_key}"} if self._api_key else {}
        try:
            async with httpx.AsyncClient(
                timeout=self._timeout_seconds,
                transport=self._transport,
            ) as client:
                response = await client.request(
                    method,
                    f"{self._base_url}{path}",
                    headers=headers,
                    **kwargs,
                )
        except httpx.HTTPError as exc:
            raise TransientJobExecutionError(
                code=KNOWLEDGE_INDEX_PROVIDER_TEMPORARILY_UNAVAILABLE_CODE,
                safe_message="Knowledge vector index is temporarily unavailable",
            ) from exc
        if response.status_code == 429 or response.status_code >= 500:
            raise TransientJobExecutionError(
                code=KNOWLEDGE_INDEX_PROVIDER_TEMPORARILY_UNAVAILABLE_CODE,
                safe_message="Knowledge vector index is temporarily unavailable",
            )
        if response.status_code >= 400:
            raise PermanentJobExecutionError(
                code=KNOWLEDGE_INDEX_PROVIDER_CONFIGURATION_INVALID_CODE,
                safe_message="Knowledge vector index rejected the configured request",
            )
        return _require_json_object(
            response=response,
            error_code=KNOWLEDGE_INDEX_OUTCOME_INVALID_CODE,
            safe_message="Knowledge vector index returned an invalid response",
        )


def _parse_embedding_response(
    *,
    payload: dict[str, Any],
    expected_count: int,
) -> tuple[tuple[float, ...], ...]:
    data = payload.get("data")
    if not isinstance(data, Sequence) or isinstance(data, str | bytes | bytearray):
        raise _invalid_embedding_response()
    indexed_vectors: dict[int, tuple[float, ...]] = {}
    for item in data:
        if not isinstance(item, dict):
            raise _invalid_embedding_response()
        index = item.get("index")
        embedding = item.get("embedding")
        if isinstance(index, bool) or not isinstance(index, int) or not isinstance(embedding, list):
            raise _invalid_embedding_response()
        if index in indexed_vectors or any(
            isinstance(value, bool) or not isinstance(value, int | float) for value in embedding
        ):
            raise _invalid_embedding_response()
        indexed_vectors[index] = tuple(float(value) for value in embedding)
    if set(indexed_vectors) != set(range(expected_count)):
        raise _invalid_embedding_response()
    return tuple(indexed_vectors[index] for index in range(expected_count))


def _document_payload(
    *,
    document: KnowledgeVectorIndexDocument,
    embedder_name: str,
) -> dict[str, Any]:
    return {
        "id": str(document.id),
        "workspaceId": str(document.workspace_id),
        "knowledgeBaseId": str(document.knowledge_base_id),
        "sourceId": str(document.source_id),
        "sourceVersionId": str(document.source_version_id),
        "ordinal": document.ordinal,
        "content": document.content,
        "contentHash": document.content_hash,
        "locale": document.locale,
        "upstreamAclTags": list(document.upstream_acl_tags),
        "_vectors": {
            embedder_name: {
                "embeddings": list(document.vector),
                "regenerate": False,
            }
        },
    }


def _require_json_object(
    *,
    response: httpx.Response,
    error_code: str,
    safe_message: str,
) -> dict[str, Any]:
    try:
        payload = response.json()
    except ValueError as exc:
        raise PermanentJobExecutionError(code=error_code, safe_message=safe_message) from exc
    if not isinstance(payload, dict):
        raise PermanentJobExecutionError(code=error_code, safe_message=safe_message)
    return cast(dict[str, Any], payload)


def _invalid_embedding_response() -> PermanentJobExecutionError:
    return PermanentJobExecutionError(
        code=KNOWLEDGE_INDEX_EMBEDDING_RESPONSE_INVALID_CODE,
        safe_message="Knowledge embedding provider returned an invalid vector batch",
    )
