from __future__ import annotations

import re
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Literal, NoReturn
from urllib.parse import urljoin

import httpx
from pydantic import ConfigDict, Field, model_validator

from src.common.schemas import BaseSchema
from src.modules.workspaces.knowledge.source_fetch_content import (
    normalize_text_document,
    read_bounded_http_document,
)
from src.modules.workspaces.knowledge.source_fetch_errors import (
    KNOWLEDGE_SOURCE_FETCH_CONFIGURATION_INVALID,
    KNOWLEDGE_SOURCE_FETCH_FAILED,
    KNOWLEDGE_SOURCE_FETCH_TEMPORARILY_UNAVAILABLE,
    KNOWLEDGE_SOURCE_URL_FORBIDDEN,
    KnowledgeSourceFetchError,
)
from src.modules.workspaces.knowledge.untrusted_http_transport import VettedAsyncHttpTransport
from src.modules.workspaces.knowledge.untrusted_url import (
    KnowledgeUrlPolicyError,
    PublicAddressResolver,
    SystemPublicAddressResolver,
    normalize_untrusted_http_url,
    url_host_and_port,
)

_REDIRECT_STATUSES = frozenset({301, 302, 303, 307, 308})
_TRANSIENT_STATUSES = frozenset({408, 425, 429, 500, 502, 503, 504})
_SAFE_ETAG = re.compile(r'^(?:W/)?"[\x21\x23-\x7e]{1,256}"$')

type Clock = Callable[[], datetime]


class KnowledgeSourceFetchPolicy(BaseSchema):
    """Named resource limits for fetching one untrusted Knowledge document."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    enabled: bool = True
    max_redirects: int = Field(default=5, ge=0, le=10)
    max_compressed_bytes: int = Field(default=10 * 1024 * 1024, ge=1)
    max_decompressed_bytes: int = Field(default=25 * 1024 * 1024, ge=1)
    connect_timeout_seconds: float = Field(default=10, gt=0, le=60)
    read_timeout_seconds: float = Field(default=30, gt=0, le=300)
    user_agent: str = Field(default="Arclayer-Knowledge-Ingest/1", min_length=1, max_length=128)

    @model_validator(mode="after")
    def _require_decompressed_capacity(self) -> KnowledgeSourceFetchPolicy:
        if self.max_decompressed_bytes < self.max_compressed_bytes:
            raise ValueError("maxDecompressedBytes must be at least maxCompressedBytes")
        return self


class KnowledgeHttpResolution(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    url: str = Field(min_length=1)
    addresses: tuple[str, ...] = Field(min_length=1)


class FetchedHttpKnowledgeDocument(BaseSchema):
    """Immutable bytes/text evidence returned by the untrusted fetch boundary."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    requested_url: str = Field(min_length=1)
    final_url: str = Field(min_length=1)
    redirect_chain: tuple[str, ...]
    resolutions: tuple[KnowledgeHttpResolution, ...] = Field(min_length=1)
    mime_type: Literal["text/html", "application/xhtml+xml", "text/markdown", "text/plain"]
    charset: Literal["utf-8", "us-ascii"]
    content: str = Field(min_length=1)
    source_content_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    normalized_content_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    compressed_bytes: int = Field(ge=1)
    decompressed_bytes: int = Field(ge=1)
    etag: str | None = Field(default=None, max_length=260)
    last_modified: str | None = Field(default=None, max_length=128)
    fetched_at: datetime


class UntrustedHttpKnowledgeFetcher:
    """Fetch one public textual document without redirects or DNS escaping policy."""

    def __init__(
        self,
        *,
        policy: KnowledgeSourceFetchPolicy,
        resolver: PublicAddressResolver | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
        clock: Clock | None = None,
    ) -> None:
        self._policy = policy
        self._resolver = resolver or SystemPublicAddressResolver()
        self._transport = transport
        self._clock = clock or (lambda: datetime.now(UTC))

    async def fetch(self, url: str) -> FetchedHttpKnowledgeDocument:
        if not self._policy.enabled:
            raise KnowledgeSourceFetchError(
                code=KNOWLEDGE_SOURCE_FETCH_CONFIGURATION_INVALID,
                safe_message="Knowledge URL ingestion is disabled by deployment policy",
                transient=False,
            )
        requested_url = self._normalize_url(url)
        transport = self._transport or VettedAsyncHttpTransport(resolver=self._resolver)
        timeout = httpx.Timeout(
            connect=self._policy.connect_timeout_seconds,
            read=self._policy.read_timeout_seconds,
            write=self._policy.connect_timeout_seconds,
            pool=self._policy.connect_timeout_seconds,
        )
        async with httpx.AsyncClient(
            transport=transport,
            timeout=timeout,
            follow_redirects=False,
            trust_env=False,
        ) as client:
            return await self._fetch_redirect_chain(client=client, requested_url=requested_url)

    async def _fetch_redirect_chain(
        self,
        *,
        client: httpx.AsyncClient,
        requested_url: str,
    ) -> FetchedHttpKnowledgeDocument:
        current_url = requested_url
        redirect_chain: list[str] = []
        resolutions: list[KnowledgeHttpResolution] = []
        for redirect_count in range(self._policy.max_redirects + 1):
            resolutions.append(await self._resolve(current_url))
            try:
                async with client.stream(
                    "GET",
                    current_url,
                    headers={
                        "Accept": "text/html,application/xhtml+xml,text/markdown,text/plain;q=0.9",
                        "Accept-Encoding": "gzip, deflate, identity",
                        "User-Agent": self._policy.user_agent,
                    },
                ) as response:
                    if response.status_code in _REDIRECT_STATUSES:
                        if redirect_count >= self._policy.max_redirects:
                            self._raise_permanent(
                                KNOWLEDGE_SOURCE_FETCH_FAILED,
                                "Knowledge source exceeded the redirect limit",
                            )
                        location = response.headers.get("location")
                        if location is None:
                            self._raise_permanent(
                                KNOWLEDGE_SOURCE_FETCH_FAILED,
                                "Knowledge source redirect is missing a destination",
                            )
                        redirect_chain.append(current_url)
                        current_url = self._normalize_url(urljoin(current_url, location))
                        continue
                    self._require_success_status(response)
                    return await self._read_document(
                        response=response,
                        requested_url=requested_url,
                        final_url=current_url,
                        redirect_chain=tuple(redirect_chain),
                        resolutions=tuple(resolutions),
                    )
            except KnowledgeSourceFetchError:
                raise
            except httpx.TimeoutException as exc:
                raise KnowledgeSourceFetchError(
                    code=KNOWLEDGE_SOURCE_FETCH_TEMPORARILY_UNAVAILABLE,
                    safe_message="Knowledge source request timed out",
                    transient=True,
                ) from exc
            except httpx.NetworkError as exc:
                raise KnowledgeSourceFetchError(
                    code=KNOWLEDGE_SOURCE_FETCH_TEMPORARILY_UNAVAILABLE,
                    safe_message="Knowledge source network is temporarily unavailable",
                    transient=True,
                ) from exc
            except httpx.HTTPError as exc:
                raise KnowledgeSourceFetchError(
                    code=KNOWLEDGE_SOURCE_FETCH_FAILED,
                    safe_message="Knowledge source returned an invalid HTTP response",
                    transient=False,
                ) from exc
        raise AssertionError("redirect loop must terminate with a result or typed error")

    async def _resolve(self, url: str) -> KnowledgeHttpResolution:
        host, port = url_host_and_port(url)
        try:
            addresses = await self._resolver.resolve(host=host, port=port)
        except KnowledgeUrlPolicyError as exc:
            raise KnowledgeSourceFetchError(
                code=KNOWLEDGE_SOURCE_URL_FORBIDDEN,
                safe_message="Knowledge source URL targets a forbidden network",
                transient=False,
            ) from exc
        return KnowledgeHttpResolution(url=url, addresses=addresses)

    async def _read_document(
        self,
        *,
        response: httpx.Response,
        requested_url: str,
        final_url: str,
        redirect_chain: tuple[str, ...],
        resolutions: tuple[KnowledgeHttpResolution, ...],
    ) -> FetchedHttpKnowledgeDocument:
        decoded = await read_bounded_http_document(
            response=response,
            max_compressed_bytes=self._policy.max_compressed_bytes,
            max_decompressed_bytes=self._policy.max_decompressed_bytes,
        )
        normalized = normalize_text_document(decoded)
        return FetchedHttpKnowledgeDocument(
            requested_url=requested_url,
            final_url=final_url,
            redirect_chain=redirect_chain,
            resolutions=resolutions,
            mime_type=decoded.mime_type,
            charset=decoded.charset,
            content=normalized.content,
            source_content_hash=decoded.content_hash,
            normalized_content_hash=normalized.normalized_content_hash,
            compressed_bytes=decoded.compressed_bytes,
            decompressed_bytes=len(decoded.content_bytes),
            etag=_safe_etag(response.headers.get("etag")),
            last_modified=_safe_header(response.headers.get("last-modified"), max_length=128),
            fetched_at=self._clock(),
        )

    def _require_success_status(self, response: httpx.Response) -> None:
        if response.status_code == 200:
            return
        if response.status_code in _TRANSIENT_STATUSES:
            raise KnowledgeSourceFetchError(
                code=KNOWLEDGE_SOURCE_FETCH_TEMPORARILY_UNAVAILABLE,
                safe_message="Knowledge source is temporarily unavailable",
                transient=True,
                retry_after_seconds=_retry_after_seconds(response.headers.get("retry-after")),
            )
        self._raise_permanent(
            KNOWLEDGE_SOURCE_FETCH_FAILED,
            "Knowledge source request was rejected",
        )

    @staticmethod
    def _normalize_url(url: str) -> str:
        try:
            return normalize_untrusted_http_url(url)
        except KnowledgeUrlPolicyError as exc:
            raise KnowledgeSourceFetchError(
                code=KNOWLEDGE_SOURCE_URL_FORBIDDEN,
                safe_message="Knowledge source URL is forbidden",
                transient=False,
            ) from exc

    @staticmethod
    def _raise_permanent(code: str, message: str) -> NoReturn:
        raise KnowledgeSourceFetchError(code=code, safe_message=message, transient=False)


def _safe_etag(value: str | None) -> str | None:
    return value if value is not None and _SAFE_ETAG.fullmatch(value) else None


def _safe_header(value: str | None, *, max_length: int) -> str | None:
    if (
        value is None
        or len(value) > max_length
        or any((ord(character) < 32 and character != "\t") or ord(character) == 127 for character in value)
    ):
        return None
    return value


def _retry_after_seconds(value: str | None) -> float | None:
    if value is None:
        return None
    try:
        seconds = int(value)
    except ValueError:
        return None
    return float(seconds) if 0 <= seconds <= 3600 else None
