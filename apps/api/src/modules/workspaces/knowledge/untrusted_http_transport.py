from __future__ import annotations

import asyncio
import contextlib
import ssl
from collections.abc import AsyncIterable, AsyncIterator, Iterable
from types import TracebackType
from typing import NoReturn, cast

import httpcore
import httpx

from src.modules.workspaces.knowledge.untrusted_url import (
    KnowledgeUrlPolicyError,
    PublicAddressResolver,
)

type SocketOption = tuple[int, int, int] | tuple[int, int, bytes | bytearray] | tuple[int, int, None, int]


class VettedAsyncNetworkBackend(httpcore.AsyncNetworkBackend):
    """Connect to the exact public IPs validated for the requested hostname."""

    def __init__(self, resolver: PublicAddressResolver) -> None:
        self._resolver = resolver

    async def connect_tcp(
        self,
        host: str,
        port: int,
        timeout: float | None = None,
        local_address: str | None = None,
        socket_options: Iterable[SocketOption] | None = None,
    ) -> _AsyncioNetworkStream:
        try:
            addresses = await self._resolver.resolve(host=host, port=port)
        except KnowledgeUrlPolicyError as exc:
            raise httpcore.ConnectError(str(exc)) from exc
        last_error: OSError | None = None
        try:
            async with asyncio.timeout(timeout):
                for address in addresses:
                    try:
                        reader, writer = await asyncio.open_connection(
                            host=address,
                            port=port,
                            local_addr=(local_address, 0) if local_address is not None else None,
                        )
                    except OSError as exc:
                        last_error = exc
                        continue
                    _apply_socket_options(writer=writer, socket_options=socket_options)
                    return _AsyncioNetworkStream(reader=reader, writer=writer)
        except TimeoutError as exc:
            raise httpcore.ConnectTimeout("Timed out connecting to the Knowledge source") from exc
        raise httpcore.ConnectError("Unable to connect to the Knowledge source") from last_error

    async def connect_unix_socket(
        self,
        path: str,
        timeout: float | None = None,
        socket_options: Iterable[SocketOption] | None = None,
    ) -> _AsyncioNetworkStream:
        del path, timeout, socket_options
        raise httpcore.ConnectError("Unix sockets are forbidden for Knowledge source ingestion")

    async def sleep(self, seconds: float) -> None:
        await asyncio.sleep(seconds)


class _AsyncioNetworkStream(httpcore.AsyncNetworkStream):
    def __init__(self, *, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        self._reader = reader
        self._writer = writer

    async def read(self, max_bytes: int, timeout: float | None = None) -> bytes:
        try:
            async with asyncio.timeout(timeout):
                return await self._reader.read(max_bytes)
        except TimeoutError as exc:
            raise httpcore.ReadTimeout("Timed out reading the Knowledge source") from exc
        except OSError as exc:
            raise httpcore.ReadError("Failed reading the Knowledge source") from exc

    async def write(self, buffer: bytes, timeout: float | None = None) -> None:
        try:
            self._writer.write(buffer)
            async with asyncio.timeout(timeout):
                await self._writer.drain()
        except TimeoutError as exc:
            raise httpcore.WriteTimeout("Timed out writing the Knowledge source request") from exc
        except OSError as exc:
            raise httpcore.WriteError("Failed writing the Knowledge source request") from exc

    async def aclose(self) -> None:
        self._writer.close()
        with contextlib.suppress(OSError):
            await self._writer.wait_closed()

    async def start_tls(
        self,
        ssl_context: ssl.SSLContext,
        server_hostname: str | None = None,
        timeout: float | None = None,
    ) -> _AsyncioNetworkStream:
        try:
            async with asyncio.timeout(timeout):
                await self._writer.start_tls(
                    ssl_context,
                    server_hostname=server_hostname,
                )
        except (OSError, ssl.SSLError, TimeoutError) as exc:
            await self.aclose()
            raise httpcore.ConnectError("TLS negotiation failed for the Knowledge source") from exc
        return self

    def get_extra_info(self, info: str) -> object | None:
        if info == "ssl_object":
            return self._writer.get_extra_info("ssl_object")
        if info == "client_addr":
            return self._writer.get_extra_info("sockname")
        if info == "server_addr":
            return self._writer.get_extra_info("peername")
        if info == "socket":
            return self._writer.get_extra_info("socket")
        if info == "is_readable":
            return not self._reader.at_eof()
        return None


class VettedAsyncHttpTransport(httpx.AsyncBaseTransport):
    """HTTPX transport whose TCP backend cannot perform an unchecked DNS lookup."""

    def __init__(self, *, resolver: PublicAddressResolver) -> None:
        self._pool = httpcore.AsyncConnectionPool(
            ssl_context=ssl.create_default_context(),
            max_connections=10,
            max_keepalive_connections=5,
            keepalive_expiry=5,
            http1=True,
            http2=False,
            retries=0,
            network_backend=VettedAsyncNetworkBackend(resolver),
        )

    async def __aenter__(self) -> VettedAsyncHttpTransport:
        await self._pool.__aenter__()
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None = None,
        exc_value: BaseException | None = None,
        traceback: TracebackType | None = None,
    ) -> None:
        await self._pool.__aexit__(exc_type, exc_value, traceback)

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        core_request = httpcore.Request(
            method=request.method,
            url=httpcore.URL(
                scheme=request.url.raw_scheme,
                host=request.url.raw_host,
                port=request.url.port,
                target=request.url.raw_path,
            ),
            headers=request.headers.raw,
            content=request.stream,
            extensions=request.extensions,
        )
        try:
            response = await self._pool.handle_async_request(core_request)
        except Exception as exc:
            _raise_httpx_transport_error(exc)
        if not isinstance(response.stream, AsyncIterable):
            raise httpx.ProtocolError("Knowledge source response stream is not asynchronous")
        return httpx.Response(
            status_code=response.status,
            headers=response.headers,
            stream=_MappedResponseStream(cast(AsyncIterable[bytes], response.stream)),
            extensions=response.extensions,
        )

    async def aclose(self) -> None:
        await self._pool.aclose()


class _MappedResponseStream(httpx.AsyncByteStream):
    def __init__(self, stream: AsyncIterable[bytes]) -> None:
        self._stream = stream

    async def __aiter__(self) -> AsyncIterator[bytes]:
        try:
            async for chunk in self._stream:
                yield chunk
        except Exception as exc:
            _raise_httpx_transport_error(exc)

    async def aclose(self) -> None:
        close = getattr(self._stream, "aclose", None)
        if close is not None:
            await close()


def _apply_socket_options(
    *,
    writer: asyncio.StreamWriter,
    socket_options: Iterable[SocketOption] | None,
) -> None:
    sock = writer.get_extra_info("socket")
    if sock is None:
        return
    for option in socket_options or ():
        sock.setsockopt(*option)


def _raise_httpx_transport_error(exc: Exception) -> NoReturn:
    mappings: tuple[tuple[type[Exception], type[httpx.HTTPError]], ...] = (
        (httpcore.ConnectTimeout, httpx.ConnectTimeout),
        (httpcore.ReadTimeout, httpx.ReadTimeout),
        (httpcore.WriteTimeout, httpx.WriteTimeout),
        (httpcore.PoolTimeout, httpx.PoolTimeout),
        (httpcore.ConnectError, httpx.ConnectError),
        (httpcore.ReadError, httpx.ReadError),
        (httpcore.WriteError, httpx.WriteError),
        (httpcore.RemoteProtocolError, httpx.RemoteProtocolError),
        (httpcore.LocalProtocolError, httpx.LocalProtocolError),
        (httpcore.ProtocolError, httpx.ProtocolError),
    )
    for source, target in mappings:
        if isinstance(exc, source):
            raise target(str(exc)) from exc
    raise exc
