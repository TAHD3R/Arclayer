from __future__ import annotations

import asyncio
import threading

import pytest
from starlette.requests import ClientDisconnect
from starlette.responses import Response
from starlette.types import Message, Receive, Scope, Send

import src.platform.storage.s3 as s3_module
import src.platform.storage.s3_stream as s3_stream_module
from src.platform.storage.s3 import S3GetObject, S3HeadObject
from src.platform.storage.s3_stream import S3ResponseCleanupError, stream_s3_object


class _FakeBody:
    def __init__(
        self,
        chunks: list[bytes],
        *,
        read_error: BaseException | None = None,
        close_error: BaseException | None = None,
    ) -> None:
        self._chunks = list(chunks)
        self._read_error = read_error
        self._close_error = close_error
        self.closed = False

    def read(self, _n: int) -> bytes:
        if self._read_error is not None:
            raise self._read_error
        if not self._chunks:
            return b""
        return self._chunks.pop(0)

    def close(self) -> None:
        self.closed = True
        if self._close_error is not None:
            raise self._close_error


class _BlockingBody(_FakeBody):
    def __init__(self) -> None:
        super().__init__([b"payload"])
        self.entered = threading.Event()
        self.release = threading.Event()

    def read(self, _n: int) -> bytes:
        self.entered.set()
        self.release.wait()
        return super().read(_n)


class _FakeS3Provider:
    def __init__(
        self,
        *,
        size: int,
        payload: bytes,
        body: _FakeBody | None = None,
        get_error: BaseException | None = None,
    ) -> None:
        self._size = int(size)
        self._payload = payload
        self._body = body
        self._get_error = get_error
        self.last_body: _FakeBody | None = None
        self.seen_ranges: list[tuple[int, int] | None] = []

    async def head_object(self, *, object_key: str) -> S3HeadObject:
        _ = object_key
        return S3HeadObject(size_bytes=self._size, content_type="application/octet-stream", etag=None)

    async def get_object(self, *, object_key: str, byte_range: tuple[int, int] | None) -> S3GetObject:
        _ = object_key
        self.seen_ranges.append(byte_range)
        if self._get_error is not None:
            raise self._get_error

        # For unit tests we don't simulate real server-side range slicing; the helper's correctness
        # is mainly about status code + headers + passing the requested range into provider.get_object().
        body = self._body or _FakeBody([self._payload, b""])
        self.last_body = body
        return S3GetObject(body=body, content_type="application/octet-stream", content_length=None, etag=None)


pytestmark = pytest.mark.asyncio

_LEVEL_CANCELLATION_OBSERVATION_SECONDS = 0.05


async def _call_response(
    response: Response,
    *,
    send: Send | None = None,
    receive: Receive | None = None,
    spec_version: str = "2.4",
) -> list[Message]:
    messages: list[Message] = []

    async def _default_receive() -> Message:
        raise AssertionError("ASGI receive should not be called for spec version 2.4")

    async def _send(message: Message) -> None:
        messages.append(message)

    scope: Scope = {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": spec_version},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "https",
        "path": "/asset",
        "raw_path": b"/asset",
        "query_string": b"",
        "root_path": "",
        "headers": [],
        "client": None,
        "server": None,
    }
    await response(scope, receive or _default_receive, send or _send)
    return messages


def _response_payload(messages: list[Message]) -> bytes:
    return b"".join(bytes(message.get("body", b"")) for message in messages if message["type"] == "http.response.body")


async def test_stream_s3_object_without_range_returns_200_and_length_header() -> None:
    provider = _FakeS3Provider(size=3, payload=b"abc")
    resp = await stream_s3_object(
        provider=provider,  # type: ignore[arg-type]
        object_key="k",
        content_type="application/octet-stream",
        range_header=None,
    )
    assert resp.status_code == 200
    assert resp.headers.get("accept-ranges") == "bytes"
    assert resp.headers.get("content-length") == "3"
    assert [value for name, value in resp.raw_headers if name == b"content-length"] == [b"3"]
    assert provider.seen_ranges == []

    messages = await _call_response(resp)

    assert provider.seen_ranges == [None]
    assert _response_payload(messages) == b"abc"


async def test_stream_s3_object_with_range_returns_206_and_content_range() -> None:
    provider = _FakeS3Provider(size=10, payload=b"0123456789")
    resp = await stream_s3_object(
        provider=provider,  # type: ignore[arg-type]
        object_key="k",
        content_type="application/octet-stream",
        range_header="bytes=2-4",
    )
    assert resp.status_code == 206
    assert resp.headers.get("accept-ranges") == "bytes"
    assert resp.headers.get("content-range") == "bytes 2-4/10"
    assert resp.headers.get("content-length") == "3"
    assert [value for name, value in resp.raw_headers if name == b"content-length"] == [b"3"]
    assert provider.seen_ranges == []

    messages = await _call_response(resp)

    assert provider.seen_ranges == [(2, 4)]
    assert _response_payload(messages) == b"0123456789"


async def test_stream_s3_object_does_not_acquire_body_until_response_is_called() -> None:
    body = _FakeBody([b"abc", b""])
    provider = _FakeS3Provider(size=3, payload=b"", body=body)

    response = await stream_s3_object(
        provider=provider,  # type: ignore[arg-type]
        object_key="k",
        content_type="application/octet-stream",
        range_header=None,
    )

    assert provider.seen_ranges == []
    assert provider.last_body is None
    assert body.closed is False


async def test_stream_s3_object_exposes_initial_get_failure_before_response_headers() -> None:
    get_error = OSError("get object failed")
    provider = _FakeS3Provider(size=3, payload=b"", get_error=get_error)
    response = await stream_s3_object(
        provider=provider,  # type: ignore[arg-type]
        object_key="k",
        content_type="application/octet-stream",
        range_header=None,
    )
    messages: list[Message] = []

    async def _send(message: Message) -> None:
        messages.append(message)

    with pytest.raises(OSError) as exc_info:
        await _call_response(response, send=_send)

    assert exc_info.value is get_error
    assert messages == []


async def test_stream_s3_object_closes_body_after_normal_consumption() -> None:
    provider = _FakeS3Provider(size=3, payload=b"abc")
    response = await stream_s3_object(
        provider=provider,  # type: ignore[arg-type]
        object_key="k",
        content_type="application/octet-stream",
        range_header=None,
    )
    messages = await _call_response(response)

    assert _response_payload(messages) == b"abc"
    assert provider.last_body is not None
    assert provider.last_body.closed is True


async def test_stream_s3_object_closes_body_after_read_failure() -> None:
    read_error = ValueError("stream read failed")
    body = _FakeBody([], read_error=read_error)
    provider = _FakeS3Provider(size=3, payload=b"", body=body)
    response = await stream_s3_object(
        provider=provider,  # type: ignore[arg-type]
        object_key="k",
        content_type="application/octet-stream",
        range_header=None,
    )
    with pytest.raises(ValueError) as exc_info:
        await _call_response(response)

    assert exc_info.value is read_error
    assert body.closed is True


async def test_stream_s3_object_preserves_read_failure_when_close_also_fails() -> None:
    read_error = ValueError("stream read failed")
    close_error = RuntimeError("stream close failed")
    close_error.add_note("provider payload must not cross the S3 lifecycle boundary")
    body = _FakeBody(
        [],
        read_error=read_error,
        close_error=close_error,
    )
    provider = _FakeS3Provider(size=3, payload=b"", body=body)
    response = await stream_s3_object(
        provider=provider,  # type: ignore[arg-type]
        object_key="k",
        content_type="application/octet-stream",
        range_header=None,
    )
    with pytest.raises(ValueError) as exc_info:
        await _call_response(response)

    assert exc_info.value is read_error
    assert exc_info.value.__notes__ == ["S3 response body close also failed while streaming: RuntimeError"]
    assert body.closed is True


async def test_stream_s3_object_exposes_close_failure_after_normal_consumption() -> None:
    close_error = RuntimeError("stream close failed")
    body = _FakeBody([b"abc", b""], close_error=close_error)
    provider = _FakeS3Provider(size=3, payload=b"", body=body)
    response = await stream_s3_object(
        provider=provider,  # type: ignore[arg-type]
        object_key="k",
        content_type="application/octet-stream",
        range_header=None,
    )
    with pytest.raises(RuntimeError) as exc_info:
        await _call_response(response)

    assert exc_info.value is close_error
    assert body.closed is True


async def test_stream_s3_object_repeated_cancellation_settles_read_before_closing_body(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    body = _BlockingBody()
    provider = _FakeS3Provider(size=7, payload=b"", body=body)
    response = await stream_s3_object(
        provider=provider,  # type: ignore[arg-type]
        object_key="k",
        content_type="application/octet-stream",
        range_header=None,
    )
    settlement_entered = asyncio.Event()
    original_settlement = s3_module.wait_for_s3_task_settlement

    async def _track_settlement(task: asyncio.Task[object]) -> None:
        settlement_entered.set()
        await original_settlement(task)

    monkeypatch.setattr(s3_module, "wait_for_s3_task_settlement", _track_settlement)
    task = asyncio.create_task(_call_response(response))
    assert await asyncio.to_thread(body.entered.wait, 1)

    task.cancel()
    try:
        await asyncio.wait_for(settlement_entered.wait(), timeout=1)
        assert task.done() is False
        assert body.closed is False
        task.cancel()
        await asyncio.sleep(0)
        assert task.done() is False
    finally:
        body.release.set()

    with pytest.raises(asyncio.CancelledError) as exc_info:
        await task

    notes = getattr(exc_info.value, "__notes__", [])
    assert notes.count("S3 storage operation received another cancellation while settling") == 1
    assert body.closed is True


async def test_asgi_23_disconnect_during_blocking_read_has_bounded_settlement(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    body = _BlockingBody()
    provider = _FakeS3Provider(size=7, payload=b"", body=body)
    response = await stream_s3_object(
        provider=provider,  # type: ignore[arg-type]
        object_key="k",
        content_type="application/octet-stream",
        range_header=None,
    )
    disconnects: asyncio.Queue[Message] = asyncio.Queue()
    settlement_entered = asyncio.Event()
    settlement_wait_calls = 0
    original_settlement = s3_module.wait_for_s3_task_settlement

    async def _count_settlement(task: asyncio.Task[object]) -> None:
        nonlocal settlement_wait_calls
        settlement_wait_calls += 1
        settlement_entered.set()
        await original_settlement(task)

    async def _receive() -> Message:
        return await disconnects.get()

    async def _send(_message: Message) -> None:
        await asyncio.sleep(0)

    monkeypatch.setattr(s3_module, "wait_for_s3_task_settlement", _count_settlement)
    response_task = asyncio.create_task(
        _call_response(
            response,
            send=_send,
            receive=_receive,
            spec_version="2.3",
        )
    )
    outcome: object | BaseException | None = None
    try:
        assert await asyncio.to_thread(body.entered.wait, 1)
        disconnects.put_nowait({"type": "http.disconnect"})
        await asyncio.wait_for(settlement_entered.wait(), timeout=1)
        await asyncio.sleep(_LEVEL_CANCELLATION_OBSERVATION_SECONDS)

        assert settlement_wait_calls == 1
        assert response_task.done() is False
        assert body.closed is False
    finally:
        body.release.set()
        outcome = (await asyncio.gather(response_task, return_exceptions=True))[0]

    assert outcome == []
    assert body.closed is True


async def test_stream_s3_object_closes_body_when_sending_headers_fails() -> None:
    body = _FakeBody([b"abc", b""])
    provider = _FakeS3Provider(size=3, payload=b"", body=body)
    response = await stream_s3_object(
        provider=provider,  # type: ignore[arg-type]
        object_key="k",
        content_type="application/octet-stream",
        range_header=None,
    )
    send_error = OSError("client disconnected")

    async def _send(_message: Message) -> None:
        raise send_error

    with pytest.raises(ClientDisconnect) as exc_info:
        await _call_response(response, send=_send)

    assert exc_info.value.__cause__ is send_error
    assert body.closed is True


async def test_stream_s3_object_closes_body_before_final_send_failure() -> None:
    body = _FakeBody([b"abc", b""])
    provider = _FakeS3Provider(size=3, payload=b"", body=body)
    response = await stream_s3_object(
        provider=provider,  # type: ignore[arg-type]
        object_key="k",
        content_type="application/octet-stream",
        range_header=None,
    )
    send_error = OSError("final send failed")

    async def _send(message: Message) -> None:
        if message["type"] == "http.response.body" and message.get("more_body") is False:
            assert body.closed is True
            raise send_error

    with pytest.raises(ClientDisconnect) as exc_info:
        await _call_response(response, send=_send)

    assert exc_info.value.__cause__ is send_error
    assert body.closed is True


async def test_stream_s3_object_closes_body_when_first_chunk_send_is_cancelled() -> None:
    body = _FakeBody([b"abc", b""])
    provider = _FakeS3Provider(size=3, payload=b"", body=body)
    response = await stream_s3_object(
        provider=provider,  # type: ignore[arg-type]
        object_key="k",
        content_type="application/octet-stream",
        range_header=None,
    )
    send_entered = asyncio.Event()

    async def _send(message: Message) -> None:
        if message["type"] == "http.response.body" and message.get("body"):
            send_entered.set()
            await asyncio.Event().wait()

    task = asyncio.create_task(_call_response(response, send=_send))
    await send_entered.wait()

    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task

    assert body.closed is True


class _BlockingCloseBody(_FakeBody):
    def __init__(self) -> None:
        super().__init__([b"abc", b""])
        self.close_entered = threading.Event()
        self.close_release = threading.Event()

    def close(self) -> None:
        self.close_entered.set()
        self.close_release.wait()
        super().close()


async def test_asgi_23_disconnect_during_blocking_close_has_bounded_settlement(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    body = _BlockingCloseBody()
    provider = _FakeS3Provider(size=3, payload=b"", body=body)
    response = await stream_s3_object(
        provider=provider,  # type: ignore[arg-type]
        object_key="k",
        content_type="application/octet-stream",
        range_header=None,
    )
    disconnects: asyncio.Queue[Message] = asyncio.Queue()
    settlement_entered = asyncio.Event()
    settlement_wait_calls = 0
    close_cancellation_notes = 0
    original_settlement = s3_stream_module.wait_for_s3_task_settlement
    original_note_close_cancellation = s3_stream_module._note_close_cancellation

    async def _count_settlement(task: asyncio.Task[object]) -> None:
        nonlocal settlement_wait_calls
        settlement_wait_calls += 1
        settlement_entered.set()
        await original_settlement(task)

    def _count_close_cancellation_note(
        *,
        primary: BaseException | None,
        cancellation: asyncio.CancelledError,
        first_during_close: bool,
    ) -> None:
        nonlocal close_cancellation_notes
        close_cancellation_notes += 1
        original_note_close_cancellation(
            primary=primary,
            cancellation=cancellation,
            first_during_close=first_during_close,
        )

    async def _receive() -> Message:
        return await disconnects.get()

    async def _send(_message: Message) -> None:
        await asyncio.sleep(0)

    monkeypatch.setattr(s3_stream_module, "wait_for_s3_task_settlement", _count_settlement)
    monkeypatch.setattr(s3_stream_module, "_note_close_cancellation", _count_close_cancellation_note)
    response_task = asyncio.create_task(
        _call_response(
            response,
            send=_send,
            receive=_receive,
            spec_version="2.3",
        )
    )
    outcome: object | BaseException | None = None
    try:
        assert await asyncio.to_thread(body.close_entered.wait, 1)
        await asyncio.wait_for(settlement_entered.wait(), timeout=1)
        disconnects.put_nowait({"type": "http.disconnect"})
        await asyncio.sleep(_LEVEL_CANCELLATION_OBSERVATION_SECONDS)

        assert settlement_wait_calls == 1
        assert close_cancellation_notes == 0
        assert response_task.done() is False
        assert body.closed is False
    finally:
        body.close_release.set()
        outcome = (await asyncio.gather(response_task, return_exceptions=True))[0]

    assert outcome == []
    assert body.closed is True


async def test_asgi_23_repeated_host_cancellation_during_blocking_close_is_observable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    body = _BlockingCloseBody()
    provider = _FakeS3Provider(size=3, payload=b"", body=body)
    response = await stream_s3_object(
        provider=provider,  # type: ignore[arg-type]
        object_key="k",
        content_type="application/octet-stream",
        range_header=None,
    )
    chunk_send_entered = asyncio.Event()
    settlement_entered = asyncio.Event()
    settlement_wait_calls = 0
    original_settlement = s3_stream_module.wait_for_s3_task_settlement

    async def _receive() -> Message:
        await asyncio.Event().wait()
        raise AssertionError("cancelled ASGI receive unexpectedly resumed")

    async def _send(message: Message) -> None:
        if message["type"] == "http.response.body" and message.get("body"):
            chunk_send_entered.set()
            await asyncio.Event().wait()

    async def _count_settlement(task: asyncio.Task[object]) -> None:
        nonlocal settlement_wait_calls
        settlement_wait_calls += 1
        settlement_entered.set()
        await original_settlement(task)

    monkeypatch.setattr(s3_stream_module, "wait_for_s3_task_settlement", _count_settlement)
    response_task = asyncio.create_task(
        _call_response(
            response,
            receive=_receive,
            send=_send,
            spec_version="2.3",
        )
    )
    await asyncio.wait_for(chunk_send_entered.wait(), timeout=1)
    response_task.cancel()
    try:
        assert await asyncio.to_thread(body.close_entered.wait, 1)
        await asyncio.wait_for(settlement_entered.wait(), timeout=1)
        response_task.cancel()
        await asyncio.sleep(_LEVEL_CANCELLATION_OBSERVATION_SECONDS)

        assert settlement_wait_calls == 1
        assert response_task.done() is False
        assert body.closed is False
    finally:
        body.close_release.set()

    with pytest.raises(asyncio.CancelledError) as exc_info:
        await response_task

    notes = getattr(exc_info.value, "__notes__", [])
    assert notes.count("S3 response host received another cancellation while child cleanup was settling") == 1
    assert not any("close also failed" in note for note in notes)
    assert body.closed is True


async def test_repeated_cancellation_waits_for_successful_close_without_false_failure_note() -> None:
    body = _BlockingCloseBody()
    provider = _FakeS3Provider(size=3, payload=b"", body=body)
    response = await stream_s3_object(
        provider=provider,  # type: ignore[arg-type]
        object_key="k",
        content_type="application/octet-stream",
        range_header=None,
    )
    send_entered = asyncio.Event()

    async def _send(message: Message) -> None:
        if message["type"] == "http.response.body" and message.get("body"):
            send_entered.set()
            await asyncio.Event().wait()

    task = asyncio.create_task(_call_response(response, send=_send))
    await send_entered.wait()
    task.cancel()
    try:
        assert await asyncio.to_thread(body.close_entered.wait, 1)
        task.cancel()
        await asyncio.sleep(0)
        assert task.done() is False
    finally:
        body.close_release.set()

    with pytest.raises(asyncio.CancelledError) as exc_info:
        await task

    notes = getattr(exc_info.value, "__notes__", [])
    assert "S3 response body close received another cancellation while settling" in notes
    assert not any("close also failed" in note for note in notes)
    assert body.closed is True


async def test_asgi_23_disconnect_surfaces_sanitized_body_close_failure() -> None:
    close_error = RuntimeError("provider close payload must stay private")
    close_error.add_note("provider note must stay private")
    body = _FakeBody([b"abc", b""], close_error=close_error)
    provider = _FakeS3Provider(size=3, payload=b"", body=body)
    response = await stream_s3_object(
        provider=provider,  # type: ignore[arg-type]
        object_key="k",
        content_type="application/octet-stream",
        range_header=None,
    )
    disconnects: asyncio.Queue[Message] = asyncio.Queue()
    chunk_send_entered = asyncio.Event()

    async def _receive() -> Message:
        return await disconnects.get()

    async def _send(message: Message) -> None:
        if message["type"] == "http.response.body" and message.get("body"):
            chunk_send_entered.set()
            await asyncio.Event().wait()

    response_task = asyncio.create_task(
        _call_response(
            response,
            send=_send,
            receive=_receive,
            spec_version="2.3",
        )
    )
    await asyncio.wait_for(chunk_send_entered.wait(), timeout=1)
    disconnects.put_nowait({"type": "http.disconnect"})

    with pytest.raises(S3ResponseCleanupError) as exc_info:
        await response_task

    error = exc_info.value
    notes = getattr(error, "__notes__", [])
    rendered_error = " ".join((str(error), *notes))
    assert str(error) == "S3 response cleanup failed after client disconnect"
    assert notes == ["S3 response body close also failed while streaming: RuntimeError"]
    assert "provider close payload" not in rendered_error
    assert "provider note" not in rendered_error
    assert error.__cause__ is None
    assert body.closed is True
