from __future__ import annotations

import hashlib
import re
import zlib
from email.message import Message
from typing import Literal, NoReturn, Protocol, cast

import httpx
from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.modules.workspaces.knowledge.source_fetch_errors import (
    KNOWLEDGE_SOURCE_FETCH_FAILED,
    KNOWLEDGE_SOURCE_FORMAT_UNSUPPORTED,
    KNOWLEDGE_SOURCE_RESPONSE_TOO_LARGE,
    KnowledgeSourceFetchError,
)

_SUPPORTED_MIME_TYPES = frozenset({
    "text/html",
    "application/xhtml+xml",
    "text/markdown",
    "text/plain",
})

type SupportedMimeType = Literal["text/html", "application/xhtml+xml", "text/markdown", "text/plain"]
type SupportedCharset = Literal["utf-8", "us-ascii"]
type SupportedContentEncoding = Literal["identity", "gzip", "deflate"]


class _Decompressor(Protocol):
    def decompress(self, data: bytes) -> bytes: ...

    def flush(self) -> bytes: ...


class DecodedHttpDocument(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    mime_type: SupportedMimeType
    charset: SupportedCharset
    content_bytes: bytes = Field(min_length=1)
    content_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    compressed_bytes: int = Field(ge=1)


class NormalizedTextDocument(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    content: str = Field(min_length=1)
    normalized_content_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")


async def read_bounded_http_document(
    *,
    response: httpx.Response,
    max_compressed_bytes: int,
    max_decompressed_bytes: int,
) -> DecodedHttpDocument:
    mime_type, charset = _require_supported_content_type(response.headers.get("content-type"))
    content_length = _optional_content_length(response.headers.get("content-length"))
    if content_length is not None and content_length > max_compressed_bytes:
        _raise_body_limit("compressed")
    encoding = _require_supported_content_encoding(response.headers.get("content-encoding"))
    compressed_bytes, content_bytes = await _read_bounded_body(
        response=response,
        encoding=encoding,
        max_compressed_bytes=max_compressed_bytes,
        max_decompressed_bytes=max_decompressed_bytes,
    )
    return DecodedHttpDocument(
        mime_type=mime_type,
        charset=charset,
        content_bytes=content_bytes,
        content_hash=_hash_bytes(content_bytes),
        compressed_bytes=compressed_bytes,
    )


def normalize_text_document(document: DecodedHttpDocument) -> NormalizedTextDocument:
    try:
        text = document.content_bytes.decode(document.charset)
    except UnicodeDecodeError as exc:
        raise KnowledgeSourceFetchError(
            code=KNOWLEDGE_SOURCE_FORMAT_UNSUPPORTED,
            safe_message="Knowledge source text does not match its declared character encoding",
            transient=False,
        ) from exc
    normalized = text.replace("\r\n", "\n").replace("\r", "\n").strip()
    if not normalized:
        raise KnowledgeSourceFetchError(
            code=KNOWLEDGE_SOURCE_FORMAT_UNSUPPORTED,
            safe_message="Knowledge source text is empty",
            transient=False,
        )
    _require_textual_payload(normalized, mime_type=document.mime_type)
    return NormalizedTextDocument(
        content=normalized,
        normalized_content_hash=_hash_bytes(normalized.encode("utf-8")),
    )


async def _read_bounded_body(
    *,
    response: httpx.Response,
    encoding: SupportedContentEncoding,
    max_compressed_bytes: int,
    max_decompressed_bytes: int,
) -> tuple[int, bytes]:
    decompressor = _decompressor(encoding)
    decoded_parts: list[bytes] = []
    compressed_size = 0
    decompressed_size = 0
    try:
        async for chunk in response.aiter_raw():
            compressed_size += len(chunk)
            if compressed_size > max_compressed_bytes:
                _raise_body_limit("compressed")
            decoded = chunk if decompressor is None else decompressor.decompress(chunk)
            decompressed_size += len(decoded)
            if decompressed_size > max_decompressed_bytes:
                _raise_body_limit("decompressed")
            decoded_parts.append(decoded)
        if decompressor is not None:
            tail = decompressor.flush()
            decompressed_size += len(tail)
            if decompressed_size > max_decompressed_bytes:
                _raise_body_limit("decompressed")
            decoded_parts.append(tail)
    except zlib.error as exc:
        raise KnowledgeSourceFetchError(
            code=KNOWLEDGE_SOURCE_FORMAT_UNSUPPORTED,
            safe_message="Knowledge source response compression is invalid",
            transient=False,
        ) from exc
    decoded = b"".join(decoded_parts)
    if compressed_size == 0 or not decoded:
        raise KnowledgeSourceFetchError(
            code=KNOWLEDGE_SOURCE_FORMAT_UNSUPPORTED,
            safe_message="Knowledge source response is empty",
            transient=False,
        )
    return compressed_size, decoded


def _decompressor(encoding: SupportedContentEncoding) -> _Decompressor | None:
    if encoding == "identity":
        return None
    if encoding == "gzip":
        return cast(_Decompressor, zlib.decompressobj(16 + zlib.MAX_WBITS))
    return cast(_Decompressor, zlib.decompressobj())


def _require_supported_content_type(value: str | None) -> tuple[SupportedMimeType, SupportedCharset]:
    if value is None:
        raise KnowledgeSourceFetchError(
            code=KNOWLEDGE_SOURCE_FORMAT_UNSUPPORTED,
            safe_message="Knowledge source response is missing a Content-Type",
            transient=False,
        )
    message = Message()
    message["content-type"] = value
    mime_type = message.get_content_type().lower()
    if mime_type not in _SUPPORTED_MIME_TYPES:
        raise KnowledgeSourceFetchError(
            code=KNOWLEDGE_SOURCE_FORMAT_UNSUPPORTED,
            safe_message="Knowledge source response format is unsupported",
            transient=False,
        )
    raw_charset = message.get_param("charset")
    if raw_charset is not None and not isinstance(raw_charset, str):
        raise KnowledgeSourceFetchError(
            code=KNOWLEDGE_SOURCE_FORMAT_UNSUPPORTED,
            safe_message="Knowledge source character encoding is invalid",
            transient=False,
        )
    charset = (raw_charset or "utf-8").strip().lower()
    if charset not in {"utf-8", "us-ascii"}:
        raise KnowledgeSourceFetchError(
            code=KNOWLEDGE_SOURCE_FORMAT_UNSUPPORTED,
            safe_message="Knowledge source character encoding is unsupported",
            transient=False,
        )
    return cast(SupportedMimeType, mime_type), cast(SupportedCharset, charset)


def _require_supported_content_encoding(value: str | None) -> SupportedContentEncoding:
    encoding = (value or "identity").strip().lower()
    if encoding not in {"identity", "gzip", "deflate"}:
        raise KnowledgeSourceFetchError(
            code=KNOWLEDGE_SOURCE_FORMAT_UNSUPPORTED,
            safe_message="Knowledge source response compression is unsupported",
            transient=False,
        )
    return cast(SupportedContentEncoding, encoding)


def _optional_content_length(value: str | None) -> int | None:
    if value is None:
        return None
    try:
        length = int(value)
    except ValueError as exc:
        raise KnowledgeSourceFetchError(
            code=KNOWLEDGE_SOURCE_FETCH_FAILED,
            safe_message="Knowledge source returned an invalid Content-Length",
            transient=False,
        ) from exc
    if length < 0:
        raise KnowledgeSourceFetchError(
            code=KNOWLEDGE_SOURCE_FETCH_FAILED,
            safe_message="Knowledge source returned an invalid Content-Length",
            transient=False,
        )
    return length


def _require_textual_payload(value: str, *, mime_type: str) -> None:
    controls = sum(1 for character in value if ord(character) < 32 and character not in "\n\t")
    if "\x00" in value or controls > max(4, len(value) // 100):
        raise KnowledgeSourceFetchError(
            code=KNOWLEDGE_SOURCE_FORMAT_UNSUPPORTED,
            safe_message="Knowledge source response is not textual content",
            transient=False,
        )
    if mime_type in {"text/html", "application/xhtml+xml"} and not re.search(r"<[^>]+>", value):
        raise KnowledgeSourceFetchError(
            code=KNOWLEDGE_SOURCE_FORMAT_UNSUPPORTED,
            safe_message="Knowledge source HTML response does not contain markup",
            transient=False,
        )


def _raise_body_limit(kind: str) -> NoReturn:
    raise KnowledgeSourceFetchError(
        code=KNOWLEDGE_SOURCE_RESPONSE_TOO_LARGE,
        safe_message=f"Knowledge source response exceeds the {kind} byte limit",
        transient=False,
    )


def _hash_bytes(value: bytes) -> str:
    return f"sha256:{hashlib.sha256(value).hexdigest()}"
