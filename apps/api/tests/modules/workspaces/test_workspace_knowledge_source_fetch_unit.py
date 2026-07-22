from __future__ import annotations

import asyncio
import gzip
from datetime import UTC, datetime
from typing import cast

import httpx
import pytest

from src.modules.workspaces.knowledge.source_fetch import (
    FetchedHttpKnowledgeDocument,
    KnowledgeHttpResolution,
    KnowledgeSourceFetchPolicy,
    UntrustedHttpKnowledgeFetcher,
)
from src.modules.workspaces.knowledge.source_fetch_errors import (
    KNOWLEDGE_SOURCE_FETCH_CONFIGURATION_INVALID,
    KNOWLEDGE_SOURCE_FETCH_TEMPORARILY_UNAVAILABLE,
    KNOWLEDGE_SOURCE_FORMAT_UNSUPPORTED,
    KNOWLEDGE_SOURCE_RESPONSE_TOO_LARGE,
    KNOWLEDGE_SOURCE_URL_FORBIDDEN,
    KnowledgeSourceFetchError,
)
from src.modules.workspaces.knowledge.untrusted_http_transport import VettedAsyncNetworkBackend
from src.modules.workspaces.knowledge.untrusted_url import (
    KnowledgeUrlPolicyError,
    SystemPublicAddressResolver,
    normalize_untrusted_http_url,
)
from src.modules.workspaces.knowledge.web_document import normalize_fetched_web_document


class _Resolver:
    def __init__(self, answers: dict[str, tuple[str, ...]]) -> None:
        self.answers = answers
        self.calls: list[tuple[str, int]] = []

    async def resolve(self, *, host: str, port: int) -> tuple[str, ...]:
        self.calls.append((host, port))
        answers = self.answers[host]
        for address in answers:
            await SystemPublicAddressResolver(resolver=lambda _host, _port, address=address: _answer(address)).resolve(
                host=host, port=port
            )
        return answers


async def _answer(value: str) -> tuple[str, ...]:
    return (value,)


def _policy(**updates: object) -> KnowledgeSourceFetchPolicy:
    return KnowledgeSourceFetchPolicy().model_copy(update=updates)


def _fetched_html(content: str) -> FetchedHttpKnowledgeDocument:
    return FetchedHttpKnowledgeDocument(
        requested_url="https://docs.example.com/start",
        final_url="https://docs.example.com/start",
        redirect_chain=(),
        resolutions=(
            KnowledgeHttpResolution(
                url="https://docs.example.com/start",
                addresses=("93.184.216.34",),
            ),
        ),
        mime_type="text/html",
        charset="utf-8",
        content=content,
        source_content_hash="sha256:" + "a" * 64,
        normalized_content_hash="sha256:" + "b" * 64,
        compressed_bytes=len(content.encode()),
        decompressed_bytes=len(content.encode()),
        fetched_at=datetime(2026, 7, 20, 8, 30, tzinfo=UTC),
    )


@pytest.mark.parametrize(
    "url",
    (
        "http://127.0.0.1/private",
        "http://169.254.169.254/latest/meta-data",
        "http://[::1]/private",
        "http://2130706433/private",
        "file:///etc/passwd",
        "https://user:secret@example.com/private",
    ),
)
def test_untrusted_url_normalization_rejects_unsafe_targets(url: str) -> None:
    with pytest.raises(KnowledgeUrlPolicyError):
        normalize_untrusted_http_url(url)


@pytest.mark.asyncio
async def test_public_resolver_rejects_mixed_public_and_private_dns_answers() -> None:
    async def resolve(_host: str, _port: int) -> tuple[str, ...]:
        return ("93.184.216.34", "10.0.0.7")

    resolver = SystemPublicAddressResolver(resolver=resolve)

    with pytest.raises(KnowledgeUrlPolicyError, match="forbidden network"):
        await resolver.resolve(host="example.com", port=443)


@pytest.mark.asyncio
async def test_network_backend_connects_to_vetted_ip_without_second_hostname_lookup(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    resolver = _Resolver({"docs.example.com": ("93.184.216.34",)})
    opened: list[tuple[str, int]] = []

    class Writer:
        closed = False

        def get_extra_info(self, _name: str) -> None:
            return None

        def close(self) -> None:
            self.closed = True

        async def wait_closed(self) -> None:
            return None

    writer = Writer()

    async def open_connection(
        *,
        host: str,
        port: int,
        local_addr: tuple[str, int] | None,
    ) -> tuple[asyncio.StreamReader, asyncio.StreamWriter]:
        assert local_addr is None
        opened.append((host, port))
        return asyncio.StreamReader(), cast(asyncio.StreamWriter, writer)

    monkeypatch.setattr(asyncio, "open_connection", open_connection)
    backend = VettedAsyncNetworkBackend(resolver)

    stream = await backend.connect_tcp("docs.example.com", 443, timeout=1)
    await stream.aclose()

    assert resolver.calls == [("docs.example.com", 443)]
    assert opened == [("93.184.216.34", 443)]
    assert writer.closed is True


@pytest.mark.asyncio
async def test_fetcher_revalidates_every_redirect_and_returns_immutable_evidence() -> None:
    resolver = _Resolver({
        "docs.example.com": ("93.184.216.34",),
        "cdn.example.com": ("93.184.216.35",),
    })

    def respond(request: httpx.Request) -> httpx.Response:
        if request.url.host == "docs.example.com":
            return httpx.Response(302, headers={"location": "https://cdn.example.com/guide.md"})
        return httpx.Response(
            200,
            headers={"content-type": "text/markdown; charset=utf-8", "etag": '"revision-1"'},
            stream=httpx.ByteStream(b"# Guide\r\n\r\nSecure content.\r\n"),
        )

    fetched_at = datetime(2026, 7, 20, 8, 30, tzinfo=UTC)
    fetcher = UntrustedHttpKnowledgeFetcher(
        policy=_policy(),
        resolver=resolver,
        transport=httpx.MockTransport(respond),
        clock=lambda: fetched_at,
    )

    document = await fetcher.fetch("HTTPS://docs.example.com:443/start")

    assert resolver.calls == [("docs.example.com", 443), ("cdn.example.com", 443)]
    assert document.requested_url == "https://docs.example.com/start"
    assert document.final_url == "https://cdn.example.com/guide.md"
    assert document.redirect_chain == ("https://docs.example.com/start",)
    assert document.content == "# Guide\n\nSecure content."
    assert document.mime_type == "text/markdown"
    assert document.etag == '"revision-1"'
    assert document.fetched_at == fetched_at
    assert document.source_content_hash.startswith("sha256:")
    assert document.normalized_content_hash.startswith("sha256:")


@pytest.mark.asyncio
async def test_fetcher_denies_private_redirect_before_second_request() -> None:
    resolver = _Resolver({
        "docs.example.com": ("93.184.216.34",),
        "metadata.internal": ("169.254.169.254",),
    })
    requests: list[str] = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(str(request.url))
        return httpx.Response(302, headers={"location": "http://metadata.internal/latest"})

    fetcher = UntrustedHttpKnowledgeFetcher(
        policy=_policy(),
        resolver=resolver,
        transport=httpx.MockTransport(respond),
    )

    with pytest.raises(KnowledgeSourceFetchError) as raised:
        await fetcher.fetch("https://docs.example.com/start")

    assert raised.value.code == KNOWLEDGE_SOURCE_URL_FORBIDDEN
    assert raised.value.transient is False
    assert requests == ["https://docs.example.com/start"]


@pytest.mark.asyncio
async def test_fetcher_enforces_compressed_and_decompressed_limits() -> None:
    resolver = _Resolver({"docs.example.com": ("93.184.216.34",)})
    compressed = gzip.compress(("A" * 4096).encode())
    fetcher = UntrustedHttpKnowledgeFetcher(
        policy=_policy(max_compressed_bytes=1024, max_decompressed_bytes=2048),
        resolver=resolver,
        transport=httpx.MockTransport(
            lambda _request: httpx.Response(
                200,
                headers={"content-type": "text/plain", "content-encoding": "gzip"},
                stream=httpx.ByteStream(compressed),
            )
        ),
    )

    with pytest.raises(KnowledgeSourceFetchError) as raised:
        await fetcher.fetch("https://docs.example.com/large")

    assert raised.value.code == KNOWLEDGE_SOURCE_RESPONSE_TOO_LARGE
    assert "decompressed" in raised.value.safe_message
    assert raised.value.transient is False


@pytest.mark.asyncio
async def test_fetcher_rejects_declared_html_without_markup() -> None:
    resolver = _Resolver({"docs.example.com": ("93.184.216.34",)})
    fetcher = UntrustedHttpKnowledgeFetcher(
        policy=_policy(),
        resolver=resolver,
        transport=httpx.MockTransport(
            lambda _request: httpx.Response(
                200,
                headers={"content-type": "text/html; charset=utf-8"},
                stream=httpx.ByteStream(b"This is plain text, not HTML."),
            )
        ),
    )

    with pytest.raises(KnowledgeSourceFetchError) as raised:
        await fetcher.fetch("https://docs.example.com/not-html")

    assert raised.value.code == KNOWLEDGE_SOURCE_FORMAT_UNSUPPORTED
    assert raised.value.transient is False


@pytest.mark.asyncio
async def test_fetcher_classifies_rate_limit_as_retryable_with_bounded_hint() -> None:
    resolver = _Resolver({"docs.example.com": ("93.184.216.34",)})
    fetcher = UntrustedHttpKnowledgeFetcher(
        policy=_policy(),
        resolver=resolver,
        transport=httpx.MockTransport(lambda _request: httpx.Response(429, headers={"retry-after": "45"})),
    )

    with pytest.raises(KnowledgeSourceFetchError) as raised:
        await fetcher.fetch("https://docs.example.com/rate-limited")

    assert raised.value.code == KNOWLEDGE_SOURCE_FETCH_TEMPORARILY_UNAVAILABLE
    assert raised.value.transient is True
    assert raised.value.retry_after_seconds == 45


@pytest.mark.asyncio
async def test_fetcher_fails_explicitly_when_url_ingestion_is_disabled() -> None:
    resolver = _Resolver({"docs.example.com": ("93.184.216.34",)})
    fetcher = UntrustedHttpKnowledgeFetcher(
        policy=_policy(enabled=False),
        resolver=resolver,
        transport=httpx.MockTransport(lambda _request: pytest.fail("HTTP must not be attempted")),
    )

    with pytest.raises(KnowledgeSourceFetchError) as raised:
        await fetcher.fetch("https://docs.example.com/start")

    assert raised.value.code == KNOWLEDGE_SOURCE_FETCH_CONFIGURATION_INVALID
    assert raised.value.transient is False
    assert resolver.calls == []


def test_html_normalizer_extracts_title_headings_and_lists_without_inert_content() -> None:
    normalized = normalize_fetched_web_document(
        _fetched_html(
            "<html><head><title> Product   Guide </title><style>.hidden{}</style></head>"
            "<body><h1>Start</h1><p>Build <strong>secure</strong> sites.</p>"
            "<ul><li>First</li><li>Second<script>ignore()</script></li></ul>"
            "<template>Invisible</template></body></html>"
        )
    )

    assert normalized.title == "Product Guide"
    assert normalized.content == "# Start\n\nBuild secure sites.\n\n- First\n\n- Second"
    assert "ignore" not in normalized.content
    assert "Invisible" not in normalized.content
    assert normalized.normalized_content_hash.startswith("sha256:")


def test_html_normalizer_rejects_document_without_readable_content() -> None:
    with pytest.raises(KnowledgeSourceFetchError) as raised:
        normalize_fetched_web_document(
            _fetched_html(
                "<html><head><title>Metadata only</title></head><body><script>ignore()</script></body></html>"
            )
        )

    assert raised.value.code == KNOWLEDGE_SOURCE_FORMAT_UNSUPPORTED
    assert raised.value.transient is False
