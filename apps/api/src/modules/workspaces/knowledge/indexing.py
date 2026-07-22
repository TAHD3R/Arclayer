from __future__ import annotations

from typing import Literal, Protocol

from pydantic import ConfigDict, Field, FiniteFloat, model_validator

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.common.types.public_uuid import PublicUUID


class KnowledgeIndexChunk(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    id: PublicUUID
    ordinal: int = Field(ge=0)
    content_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    content_text: str = Field(min_length=1)
    citation_location: JsonObject
    token_count: int = Field(ge=1)
    locale: str = Field(min_length=1, max_length=32)
    metadata: JsonObject
    upstream_acl_tags: tuple[str, ...]


class KnowledgeIndexCandidate(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    workspace_id: PublicUUID
    knowledge_base_id: PublicUUID
    source_id: PublicUUID
    source_version_id: PublicUUID
    ingest_job_id: PublicUUID
    normalized_content_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    chunks: tuple[KnowledgeIndexChunk, ...] = Field(min_length=1)


class KnowledgeIndexScanResult(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    chunk_id: PublicUUID
    status: Literal["clean", "quarantined"]
    scanner_name: str = Field(min_length=1, max_length=64)
    scanner_version: str = Field(min_length=1, max_length=32)
    rule: str | None = Field(default=None, min_length=1, max_length=128)

    @model_validator(mode="after")
    def validate_rule(self) -> KnowledgeIndexScanResult:
        if self.status == "clean" and self.rule is not None:
            raise ValueError("clean Knowledge scan results cannot include a rule")
        if self.status == "quarantined" and self.rule is None:
            raise ValueError("quarantined Knowledge scan results require a rule")
        return self


class KnowledgeVectorIndexDocument(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    id: PublicUUID
    workspace_id: PublicUUID
    knowledge_base_id: PublicUUID
    source_id: PublicUUID
    source_version_id: PublicUUID
    ordinal: int = Field(ge=0)
    content: str = Field(min_length=1)
    content_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    locale: str = Field(min_length=1, max_length=32)
    upstream_acl_tags: tuple[str, ...]
    vector: tuple[FiniteFloat, ...] = Field(min_length=1)


class KnowledgeVectorIndexReceipt(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    index_uid: str = Field(pattern=r"^[A-Za-z0-9_-]+$", min_length=1, max_length=512)
    embedder_name: str = Field(pattern=r"^[A-Za-z0-9_-]+$", min_length=1, max_length=64)
    document_ids: tuple[PublicUUID, ...] = Field(min_length=1)
    provider_task_id: str = Field(min_length=1, max_length=128)


class KnowledgeIndexedChunkWrite(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    id: PublicUUID
    scan: KnowledgeIndexScanResult
    embedding_reference: JsonObject


class KnowledgeIndexActivationWrite(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    job_id: PublicUUID
    workspace_id: PublicUUID
    knowledge_base_id: PublicUUID
    source_id: PublicUUID
    source_version_id: PublicUUID
    ingest_job_id: PublicUUID
    normalized_content_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    embedding_provider: str = Field(min_length=1, max_length=64)
    embedding_model: str = Field(min_length=1, max_length=128)
    embedding_version: str = Field(min_length=1, max_length=64)
    vector_dimensions: int = Field(ge=1)
    index_uid: str = Field(pattern=r"^[A-Za-z0-9_-]+$", min_length=1, max_length=512)
    embedder_name: str = Field(pattern=r"^[A-Za-z0-9_-]+$", min_length=1, max_length=64)
    provider_task_id: str = Field(min_length=1, max_length=128)
    chunks: tuple[KnowledgeIndexedChunkWrite, ...] = Field(min_length=1)


class KnowledgeIndexActivationMarker(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    job_id: PublicUUID
    source_id: PublicUUID
    source_version_id: PublicUUID
    normalized_content_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    chunk_count: int = Field(ge=1)
    vector_dimensions: int = Field(ge=1)
    index_uid: str = Field(pattern=r"^[A-Za-z0-9_-]+$", min_length=1, max_length=512)
    embedder_name: str = Field(pattern=r"^[A-Za-z0-9_-]+$", min_length=1, max_length=64)


class KnowledgePromptInjectionScanner(Protocol):
    def scan(self, chunks: tuple[KnowledgeIndexChunk, ...]) -> tuple[KnowledgeIndexScanResult, ...]: ...


class KnowledgeEmbeddingProvider(Protocol):
    async def embed_documents(
        self,
        *,
        texts: tuple[str, ...],
        model: str,
        dimensions: int,
    ) -> tuple[tuple[float, ...], ...]: ...


class KnowledgeVectorIndex(Protocol):
    async def replace_version(
        self,
        *,
        index_uid: str,
        embedder_name: str,
        vector_dimensions: int,
        documents: tuple[KnowledgeVectorIndexDocument, ...],
    ) -> KnowledgeVectorIndexReceipt: ...
