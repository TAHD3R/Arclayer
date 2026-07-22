from __future__ import annotations

import hashlib
import re
from typing import Literal, Protocol

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.common.types.public_uuid import PublicUUID

_MARKDOWN_HEADING = re.compile(
    r"^(?P<marks>#{1,6})[ \t]+(?P<title>.+?)[ \t]*#*[ \t]*$",
    re.MULTILINE,
)
_LEXICAL_TOKEN = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff]|[^\W_]+|[^\w\s]", re.UNICODE)


def _pending_prompt_injection_scan() -> JsonObject:
    return {"status": "pending"}


class KnowledgeIngestionParseError(ValueError):
    """Manual content differs from its immutable ingestion contract."""


class KnowledgeIngestionDocument(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    workspace_id: PublicUUID
    knowledge_base_id: PublicUUID
    source_id: PublicUUID
    source_version_id: PublicUUID | None = None
    provenance_job_id: PublicUUID
    source_kind: Literal["manual", "url"]
    ingestion_mode: Literal["initial", "refresh", "reparse"]
    source_revision: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    source_content_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    normalized_content_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    parser_name: Literal["manual-markdown", "web-text"]
    parser_version: Literal["1"] = "1"
    chunker_name: Literal["knowledge-default"] = "knowledge-default"
    chunker_version: Literal["1"] = "1"
    index_schema_version: Literal[1] = 1
    locale: str = Field(min_length=2, max_length=32)
    title: str | None = Field(default=None, max_length=256)
    content: str = Field(min_length=1)
    fetch_provenance: JsonObject = Field(default_factory=dict)
    document_metadata: JsonObject = Field(default_factory=dict)


class KnowledgeUrlSourceReference(BaseSchema):
    """Validated tenant source identity read immediately before an external fetch."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    workspace_id: PublicUUID
    knowledge_base_id: PublicUUID
    source_id: PublicUUID
    normalized_url: str = Field(min_length=1, max_length=4096)
    source_revision: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    locale: str = Field(min_length=2, max_length=32)
    display_name: str = Field(min_length=1, max_length=160)


class KnowledgeChunkDraft(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    ordinal: int = Field(ge=0)
    content_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    content_text: str = Field(min_length=1)
    citation_location: JsonObject
    token_count: int = Field(ge=1)
    locale: str = Field(min_length=2, max_length=32)
    metadata: JsonObject = Field(default_factory=dict)
    prompt_injection_scan: JsonObject = Field(default_factory=_pending_prompt_injection_scan)
    retrieval_eligible: Literal[False] = False


class KnowledgeIngestionWrite(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    job_id: PublicUUID
    actor_user_id: PublicUUID
    workspace_id: PublicUUID
    knowledge_base_id: PublicUUID
    source_id: PublicUUID
    source_version_id: PublicUUID | None = None
    source_kind: Literal["manual", "url"]
    ingestion_mode: Literal["initial", "refresh", "reparse"]
    source_revision: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    source_content_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    normalized_content_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    content_text: str = Field(min_length=1)
    parser_name: Literal["manual-markdown", "web-text"]
    parser_version: Literal["1"] = "1"
    chunker_name: Literal["knowledge-default"] = "knowledge-default"
    chunker_version: Literal["1"] = "1"
    index_schema_version: Literal[1] = 1
    fetch_provenance: JsonObject = Field(default_factory=dict)
    locale: str = Field(min_length=2, max_length=32)
    title: str | None = Field(default=None, max_length=256)
    document_metadata: JsonObject = Field(default_factory=dict)
    chunks: tuple[KnowledgeChunkDraft, ...] = Field(min_length=1)


class KnowledgeIngestionOutcomeMarker(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    job_id: PublicUUID
    source_id: PublicUUID
    source_version_id: PublicUUID
    normalized_content_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    chunk_count: int = Field(ge=1)
    token_count: int = Field(ge=1)
    index_job_id: PublicUUID


class KnowledgeParsedCandidateMarker(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    ingest_job_id: PublicUUID
    index_job_id: PublicUUID | None
    workspace_id: PublicUUID
    source_id: PublicUUID
    source_version_id: PublicUUID
    normalized_content_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    chunk_count: int = Field(ge=1)
    token_count: int = Field(ge=1)
    embedding_provider: str = Field(min_length=1, max_length=64)
    embedding_model: str = Field(min_length=1, max_length=128)
    embedding_version: str = Field(min_length=1, max_length=64)
    vector_dimensions: int = Field(ge=1)
    index_schema_version: int = Field(ge=1)
    correlation_id: str = Field(min_length=1, max_length=128)


class KnowledgeDocumentParser(Protocol):
    def parse(self, document: KnowledgeIngestionDocument) -> tuple[KnowledgeChunkDraft, ...]: ...


class ManualMarkdownKnowledgeParser:
    """Deterministic heading-section parser for immutable manual Markdown."""

    def parse(self, document: KnowledgeIngestionDocument) -> tuple[KnowledgeChunkDraft, ...]:
        if _content_hash(document.content) != document.normalized_content_hash:
            raise KnowledgeIngestionParseError("Manual Knowledge content hash differs from its immutable version")

        matches = tuple(_MARKDOWN_HEADING.finditer(document.content))
        spans: list[tuple[int, int, tuple[str, ...]]] = []
        if not matches:
            spans.append((0, len(document.content), ()))
        else:
            if document.content[: matches[0].start()].strip():
                spans.append((0, matches[0].start(), ()))
            section_path: tuple[str, ...] = ()
            for index, match in enumerate(matches):
                level = len(match.group("marks"))
                title = match.group("title").strip().rstrip("#").rstrip()
                section_path = (*section_path[: level - 1], title)
                end = matches[index + 1].start() if index + 1 < len(matches) else len(document.content)
                spans.append((match.start(), end, section_path))

        chunks = tuple(
            self._chunk(document=document, ordinal=ordinal, start=start, end=end, section_path=path)
            for ordinal, (start, end, path) in enumerate(spans)
        )
        if not chunks:
            raise KnowledgeIngestionParseError("Manual Knowledge content produced no chunks")
        return chunks

    @staticmethod
    def _chunk(
        *,
        document: KnowledgeIngestionDocument,
        ordinal: int,
        start: int,
        end: int,
        section_path: tuple[str, ...],
    ) -> KnowledgeChunkDraft:
        trimmed_start, trimmed_end = _trimmed_span(document.content, start=start, end=end)
        content = document.content[trimmed_start:trimmed_end]
        token_count = len(_LEXICAL_TOKEN.findall(content))
        if not content or token_count < 1:
            raise KnowledgeIngestionParseError("Manual Knowledge section produced an empty chunk")
        citation_location: JsonObject = {
            "kind": "text",
            "startCharacter": trimmed_start,
            "endCharacter": trimmed_end,
            "startLine": document.content.count("\n", 0, trimmed_start) + 1,
            "endLine": document.content.count("\n", 0, trimmed_end) + 1,
            "sectionPath": list(section_path),
        }
        return KnowledgeChunkDraft(
            ordinal=ordinal,
            content_hash=_content_hash(content),
            content_text=content,
            citation_location=citation_location,
            token_count=token_count,
            locale=document.locale,
            metadata={"document": document.document_metadata},
        )


def _trimmed_span(value: str, *, start: int, end: int) -> tuple[int, int]:
    while start < end and value[start].isspace():
        start += 1
    while end > start and value[end - 1].isspace():
        end -= 1
    return start, end


def _content_hash(value: str) -> str:
    return f"sha256:{hashlib.sha256(value.encode('utf-8')).hexdigest()}"
