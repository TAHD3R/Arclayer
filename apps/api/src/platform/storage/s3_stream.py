from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from functools import partial
from typing import Any, Final, Protocol

import anyio
from starlette._utils import collapse_excgroups
from starlette.requests import ClientDisconnect
from starlette.responses import Response
from starlette.types import Message, Receive, Scope, Send

from src.core.http.range import parse_range_header
from src.platform.storage.s3 import (
    S3GetObject,
    S3HeadObject,
    add_s3_cleanup_failure_notes,
    get_s3_cleanup_failure_notes,
    run_s3_blocking_call,
    wait_for_s3_task_settlement,
)

_HOST_REPEATED_CANCELLATION_NOTE: Final = (
    "S3 response host received another cancellation while child cleanup was settling"
)


class S3ObjectStreamProvider(Protocol):
    async def head_object(self, *, object_key: str) -> S3HeadObject: ...

    async def get_object(self, *, object_key: str, byte_range: tuple[int, int] | None) -> S3GetObject: ...


def _body_close_failure_notes(close_error: BaseException) -> tuple[str, ...]:
    return (
        f"S3 response body close also failed while streaming: {type(close_error).__name__}",
        *get_s3_cleanup_failure_notes(close_error),
    )


def _add_body_close_failure(primary: BaseException, close_error: BaseException) -> None:
    notes = _body_close_failure_notes(close_error)
    add_s3_cleanup_failure_notes(primary, notes)


class S3ResponseCleanupError(RuntimeError):
    """Expose sanitized response cleanup failures hidden by ASGI disconnect cancellation."""

    def __init__(self, *, cleanup_notes: tuple[str, ...]) -> None:
        super().__init__("S3 response cleanup failed after client disconnect")
        for note in cleanup_notes:
            self.add_note(note)


def _note_close_cancellation(
    *,
    primary: BaseException | None,
    cancellation: asyncio.CancelledError,
    first_during_close: bool,
) -> None:
    note_target = primary or cancellation
    if primary is None and first_during_close:
        note_target.add_note("S3 response body close was cancelled while settling")
    elif isinstance(primary, asyncio.CancelledError) or not first_during_close:
        note_target.add_note("S3 response body close received another cancellation while settling")
    else:
        note_target.add_note("S3 response body close received cancellation while settling")


async def _close_body_before_propagating(
    body: Any,
    *,
    primary: BaseException | None,
) -> None:
    close_task = asyncio.create_task(asyncio.to_thread(body.close))
    close_cancellation: asyncio.CancelledError | None = None
    while not close_task.done():
        try:
            await wait_for_s3_task_settlement(close_task)
        except asyncio.CancelledError as cancellation:
            first_during_close = close_cancellation is None
            close_cancellation = close_cancellation or cancellation
            _note_close_cancellation(
                primary=primary,
                cancellation=close_cancellation,
                first_during_close=first_during_close,
            )

    try:
        close_task.result()
    except (SystemExit, KeyboardInterrupt):
        raise
    except (Exception, asyncio.CancelledError) as close_error:
        if primary is not None:
            _add_body_close_failure(primary, close_error)
            return
        if close_cancellation is not None:
            _add_body_close_failure(close_cancellation, close_error)
            raise close_cancellation
        raise

    if primary is None and close_cancellation is not None:
        raise close_cancellation


async def _send_asgi_message(send: Send, message: Message) -> None:
    try:
        await send(message)
    except OSError as error:
        raise ClientDisconnect() from error


class _S3ObjectStreamingResponse(Response):
    def __init__(
        self,
        *,
        provider: S3ObjectStreamProvider,
        object_key: str,
        byte_range: tuple[int, int] | None,
        chunk_size_bytes: int,
        status_code: int,
        media_type: str,
        headers: dict[str, str],
    ) -> None:
        super().__init__(
            content=b"",
            status_code=status_code,
            media_type=media_type,
            headers=headers,
        )
        self._provider = provider
        self._object_key = object_key
        self._byte_range = byte_range
        self._chunk_size_bytes = int(chunk_size_bytes)

    async def _send_content(self, send: Send, body: Any) -> None:
        await _send_asgi_message(
            send,
            {
                "type": "http.response.start",
                "status": self.status_code,
                "headers": self.raw_headers,
            },
        )
        while True:
            chunk = await run_s3_blocking_call(lambda: body.read(self._chunk_size_bytes))
            if not chunk:
                return
            if not isinstance(chunk, bytes | memoryview):
                chunk = chunk.encode(self.charset)
            await _send_asgi_message(
                send,
                {"type": "http.response.body", "body": chunk, "more_body": True},
            )

    async def _stream_response(self, send: Send) -> None:
        got = await self._provider.get_object(
            object_key=self._object_key,
            byte_range=self._byte_range,
        )
        body = got.body
        try:
            await self._send_content(send, body)
        except BaseException as stream_error:
            await _close_body_before_propagating(body, primary=stream_error)
            raise

        await _close_body_before_propagating(body, primary=None)
        await _send_asgi_message(
            send,
            {"type": "http.response.body", "body": b"", "more_body": False},
        )

    @staticmethod
    async def _listen_for_disconnect(receive: Receive) -> None:
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        spec_version = tuple(map(int, scope.get("asgi", {}).get("spec_version", "2.0").split(".")))
        if spec_version >= (2, 4):
            await self._stream_response(send)
        else:
            host_task = asyncio.current_task()
            host_cancellation_baseline = host_task.cancelling() if host_task is not None else 0
            cancelled_cleanup_failures: list[str] = []
            try:
                with collapse_excgroups():
                    async with anyio.create_task_group() as task_group:

                        async def _run_until_complete(call: Callable[[], Awaitable[None]]) -> None:
                            await call()
                            task_group.cancel_scope.cancel()

                        async def _run_stream_until_complete() -> None:
                            try:
                                await self._stream_response(send)
                            except asyncio.CancelledError as cancellation:
                                cancelled_cleanup_failures.extend(get_s3_cleanup_failure_notes(cancellation))
                                raise
                            task_group.cancel_scope.cancel()

                        task_group.start_soon(_run_stream_until_complete)
                        await _run_until_complete(partial(self._listen_for_disconnect, receive))
            except asyncio.CancelledError as cancellation:
                # Direct Task.cancel calls remain counted after AnyIO has unwound its own cancel scope.
                if host_task is not None and host_task.cancelling() - host_cancellation_baseline > 1:
                    cancellation.add_note(_HOST_REPEATED_CANCELLATION_NOTE)
                if cancelled_cleanup_failures:
                    add_s3_cleanup_failure_notes(cancellation, tuple(cancelled_cleanup_failures))
                raise
            if cancelled_cleanup_failures:
                raise S3ResponseCleanupError(cleanup_notes=tuple(cancelled_cleanup_failures))

        if self.background is not None:
            await self.background()


async def stream_s3_object(
    *,
    provider: S3ObjectStreamProvider,
    object_key: str,
    content_type: str,
    range_header: str | None,
    extra_headers: dict[str, str] | None = None,
    chunk_size_bytes: int = 1024 * 1024,
) -> Response:
    """Build a range-aware response that acquires and owns the S3 body at ASGI call time."""

    head = await provider.head_object(object_key=object_key)
    size = int(head.size_bytes)
    headers: dict[str, str] = {"Accept-Ranges": "bytes", **(extra_headers or {})}

    try:
        byte_range = parse_range_header(range_header, size=size)
    except ValueError:
        return Response(
            status_code=416,
            headers={**headers, "Content-Range": f"bytes */{size}"},
        )

    status_code = 200
    if byte_range is None:
        headers["Content-Length"] = str(size)
    else:
        start, end = byte_range
        status_code = 206
        headers["Content-Range"] = f"bytes {start}-{end}/{size}"
        headers["Content-Length"] = str(end - start + 1)

    return _S3ObjectStreamingResponse(
        provider=provider,
        object_key=object_key,
        byte_range=byte_range,
        chunk_size_bytes=chunk_size_bytes,
        status_code=status_code,
        media_type=content_type,
        headers=headers,
    )
