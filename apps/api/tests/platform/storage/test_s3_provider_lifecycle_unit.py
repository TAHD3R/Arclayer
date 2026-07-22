from __future__ import annotations

import asyncio
import threading
from pathlib import Path

import pytest
from pydantic import SecretStr
from starlette.requests import ClientDisconnect
from starlette.responses import Response
from starlette.types import Message, Receive, Scope, Send

from src.platform.storage.capabilities import ObjectStorageProviderKind
from src.platform.storage.profile_schema import StorageProfileConfig
from src.platform.storage.s3 import S3StorageProvider, _close_preserving_primary
from src.platform.storage.s3_stream import S3ResponseCleanupError, stream_s3_object

pytestmark = pytest.mark.unit


class _FakeBody:
    def __init__(
        self,
        *,
        chunks: tuple[bytes, ...] = (b"payload", b""),
        read_error: BaseException | None = None,
        close_error: BaseException | None = None,
    ) -> None:
        self._chunks = list(chunks)
        self._read_error = read_error
        self._close_error = close_error
        self.close_calls = 0

    def read(self, _size: int) -> bytes:
        if self._read_error is not None:
            raise self._read_error
        return self._chunks.pop(0)

    def close(self) -> None:
        self.close_calls += 1
        if self._close_error is not None:
            raise self._close_error


class _FakeS3Client:
    def __init__(
        self,
        *,
        body: _FakeBody | None = None,
        failed_method: str | None = None,
        operation_error: BaseException | None = None,
        close_error: BaseException | None = None,
    ) -> None:
        self.body = body or _FakeBody()
        self.failed_method = failed_method
        self.operation_error = operation_error
        self.close_error = close_error
        self.close_calls = 0

    def _run(self, method: str) -> None:
        if method == self.failed_method and self.operation_error is not None:
            raise self.operation_error

    def head_bucket(self, **_kwargs: object) -> None:
        self._run("head_bucket")

    def head_object(self, **_kwargs: object) -> dict[str, object]:
        self._run("head_object")
        return {
            "ContentLength": 7,
            "ContentType": "application/octet-stream",
            "ETag": '"etag"',
        }

    def get_object(self, **_kwargs: object) -> dict[str, object]:
        self._run("get_object")
        return {
            "Body": self.body,
            "ContentLength": 7,
            "ContentType": "application/octet-stream",
            "ETag": '"etag"',
        }

    def put_object(self, **_kwargs: object) -> None:
        self._run("put_object")

    def create_multipart_upload(self, **_kwargs: object) -> dict[str, str]:
        self._run("create_multipart_upload")
        return {"UploadId": "upload-1"}

    def copy_object(self, **_kwargs: object) -> None:
        self._run("copy_object")

    def delete_object(self, **_kwargs: object) -> None:
        self._run("delete_object")

    def generate_presigned_url(self, **_kwargs: object) -> str:
        self._run("generate_presigned_url")
        return "https://s3.example.test/presigned"

    def complete_multipart_upload(self, **_kwargs: object) -> None:
        self._run("complete_multipart_upload")

    def abort_multipart_upload(self, **_kwargs: object) -> None:
        self._run("abort_multipart_upload")

    def create_bucket(self, **_kwargs: object) -> None:
        self._run("create_bucket")

    def close(self) -> None:
        self.close_calls += 1
        if self.close_error is not None:
            raise self.close_error


class _BlockingS3Client(_FakeS3Client):
    def __init__(
        self,
        *,
        blocked_method: str,
        body: _FakeBody | None = None,
        close_error: BaseException | None = None,
    ) -> None:
        super().__init__(body=body, close_error=close_error)
        self.blocked_method = blocked_method
        self.entered = threading.Event()
        self.release = threading.Event()

    def _run(self, method: str) -> None:
        if method != self.blocked_method:
            return
        self.entered.set()
        self.release.wait()


def _provider() -> S3StorageProvider:
    return S3StorageProvider(
        StorageProfileConfig(
            provider=ObjectStorageProviderKind.AWS_S3,
            endpoint_url="https://s3.example.test",
            region="us-east-1",
            bucket="assets",
            access_key_id="test-access-key",
            secret_access_key=SecretStr("test-secret-key"),
        )
    )


async def _call_response(
    response: Response,
    *,
    receive: Receive | None = None,
    send: Send | None = None,
    spec_version: str = "2.4",
) -> None:
    async def _default_receive() -> Message:
        raise AssertionError("ASGI receive should not be called for spec version 2.4")

    async def _default_send(_message: Message) -> None:
        return None

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
    await response(scope, receive or _default_receive, send or _default_send)


@pytest.mark.asyncio
async def test_non_streaming_seams_close_each_owned_client(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    provider = _provider()
    clients: list[_FakeS3Client] = []

    def _client() -> _FakeS3Client:
        client = _FakeS3Client()
        clients.append(client)
        return client

    monkeypatch.setattr(provider, "_client", _client)

    assert await provider.ensure_bucket() is False
    await provider.head_object(object_key="source.bin")
    await provider.head_bucket()
    await provider.download_object_to_path(
        object_key="source.bin",
        out_path=tmp_path / "source.bin",
    )
    await provider.put_object_bytes(
        object_key="output.bin",
        data=b"payload",
        content_type="application/octet-stream",
    )
    assert (
        await provider.create_multipart_upload(
            object_key="output.bin",
            content_type="application/octet-stream",
        )
        == "upload-1"
    )
    await provider.copy_object_from(
        source_bucket="staging",
        source_key="source.bin",
        dest_key="output.bin",
    )
    await provider.delete_object(object_key="output.bin")
    await provider.presign_upload_part(
        object_key="output.bin",
        upload_id="upload-1",
        part_number=1,
        expires_in=60,
    )
    await provider.complete_multipart_upload(
        object_key="output.bin",
        upload_id="upload-1",
        parts=[{"ETag": '"part-etag"', "PartNumber": 1}],
    )
    await provider.abort_multipart_upload(
        object_key="output.bin",
        upload_id="upload-1",
    )
    await provider.presign_get_object(object_key="output.bin", expires_in=60)

    assert len(clients) == 12
    assert [client.close_calls for client in clients] == [1] * len(clients)
    downloaded_bodies = [client.body for client in clients if client.body.close_calls]
    assert len(downloaded_bodies) == 1
    assert downloaded_bodies[0].close_calls == 1


@pytest.mark.asyncio
async def test_client_is_closed_when_operation_raises(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = _provider()
    operation_error = ValueError("invalid SDK invocation")
    client = _FakeS3Client(
        failed_method="put_object",
        operation_error=operation_error,
    )
    monkeypatch.setattr(provider, "_client", lambda: client)

    with pytest.raises(ValueError) as exc_info:
        await provider.put_object_bytes(
            object_key="output.bin",
            data=b"payload",
            content_type="application/octet-stream",
        )

    assert exc_info.value is operation_error
    assert client.close_calls == 1


@pytest.mark.asyncio
async def test_client_close_failure_does_not_mask_operation_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = _provider()
    operation_error = ValueError("invalid SDK invocation")
    close_error = RuntimeError("client close failed")
    close_error.add_note("provider payload must not cross the S3 lifecycle boundary")
    client = _FakeS3Client(
        failed_method="put_object",
        operation_error=operation_error,
        close_error=close_error,
    )
    monkeypatch.setattr(provider, "_client", lambda: client)

    with pytest.raises(ValueError) as exc_info:
        await provider.put_object_bytes(
            object_key="output.bin",
            data=b"payload",
            content_type="application/octet-stream",
        )

    assert exc_info.value is operation_error
    assert client.close_calls == 1
    assert exc_info.value.__notes__ == ["S3 client close also failed with RuntimeError"]


@pytest.mark.asyncio
async def test_client_close_cancellation_does_not_mask_operation_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = _provider()
    operation_error = ValueError("invalid SDK invocation")
    client = _FakeS3Client(
        failed_method="put_object",
        operation_error=operation_error,
        close_error=asyncio.CancelledError(),
    )
    monkeypatch.setattr(provider, "_client", lambda: client)

    with pytest.raises(ValueError) as exc_info:
        await provider.put_object_bytes(
            object_key="output.bin",
            data=b"payload",
            content_type="application/octet-stream",
        )

    assert exc_info.value is operation_error
    assert client.close_calls == 1
    assert exc_info.value.__notes__ == ["S3 client close also failed with CancelledError"]


@pytest.mark.parametrize("fatal_error", [SystemExit("stop"), KeyboardInterrupt()])
def test_close_preserving_primary_does_not_swallow_process_control_errors(
    fatal_error: BaseException,
) -> None:
    client = _FakeS3Client(close_error=fatal_error)

    with pytest.raises(type(fatal_error)) as exc_info:
        _close_preserving_primary(
            client,
            primary=ValueError("operation failed"),
            resource_name="S3 client",
        )

    assert exc_info.value is fatal_error
    assert client.close_calls == 1


@pytest.mark.asyncio
async def test_client_close_failure_after_success_is_exposed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = _provider()
    close_error = RuntimeError("client close failed")
    client = _FakeS3Client(close_error=close_error)
    monkeypatch.setattr(provider, "_client", lambda: client)

    with pytest.raises(RuntimeError) as exc_info:
        await provider.head_bucket()

    assert exc_info.value is close_error
    assert client.close_calls == 1


@pytest.mark.asyncio
async def test_get_object_body_owns_client_until_body_is_closed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = _provider()
    body = _FakeBody(chunks=(b"payload", b""))
    client = _FakeS3Client(body=body)
    monkeypatch.setattr(provider, "_client", lambda: client)

    result = await provider.get_object(object_key="source.bin", byte_range=None)

    assert client.close_calls == 0
    assert body.close_calls == 0
    assert result.body.read(1024) == b"payload"

    result.body.close()
    result.body.close()

    assert body.close_calls == 1
    assert client.close_calls == 1


@pytest.mark.asyncio
async def test_get_object_closes_client_when_request_raises(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = _provider()
    operation_error = ValueError("invalid SDK invocation")
    client = _FakeS3Client(
        failed_method="get_object",
        operation_error=operation_error,
    )
    monkeypatch.setattr(provider, "_client", lambda: client)

    with pytest.raises(ValueError) as exc_info:
        await provider.get_object(object_key="source.bin", byte_range=None)

    assert exc_info.value is operation_error
    assert client.close_calls == 1


@pytest.mark.asyncio
async def test_get_object_body_close_failure_still_closes_client(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = _provider()
    body_error = OSError("body close failed")
    body = _FakeBody(close_error=body_error)
    client = _FakeS3Client(
        body=body,
        close_error=RuntimeError("client close failed"),
    )
    monkeypatch.setattr(provider, "_client", lambda: client)
    result = await provider.get_object(object_key="source.bin", byte_range=None)

    with pytest.raises(OSError) as exc_info:
        result.body.close()

    assert exc_info.value is body_error
    assert body.close_calls == 1
    assert client.close_calls == 1
    assert exc_info.value.__notes__ == ["S3 client close also failed with RuntimeError"]


@pytest.mark.asyncio
async def test_non_streaming_cancellation_waits_for_client_close(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = _provider()
    client = _BlockingS3Client(blocked_method="put_object")
    monkeypatch.setattr(provider, "_client", lambda: client)
    task = asyncio.create_task(
        provider.put_object_bytes(
            object_key="output.bin",
            data=b"payload",
            content_type="application/octet-stream",
        )
    )
    assert await asyncio.to_thread(client.entered.wait, 1)

    task.cancel()
    try:
        await asyncio.sleep(0)
        assert task.done() is False
    finally:
        client.release.set()

    with pytest.raises(asyncio.CancelledError):
        await task

    assert client.close_calls == 1


@pytest.mark.asyncio
async def test_get_object_cancellation_closes_unclaimed_body_and_client(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = _provider()
    body = _FakeBody()
    client = _BlockingS3Client(blocked_method="get_object", body=body)
    monkeypatch.setattr(provider, "_client", lambda: client)
    task = asyncio.create_task(provider.get_object(object_key="source.bin", byte_range=None))
    assert await asyncio.to_thread(client.entered.wait, 1)

    task.cancel()
    try:
        await asyncio.sleep(0)
        assert task.done() is False
    finally:
        client.release.set()

    with pytest.raises(asyncio.CancelledError):
        await task

    assert body.close_calls == 1
    assert client.close_calls == 1


@pytest.mark.asyncio
async def test_get_object_cancellation_records_unclaimed_body_and_client_cleanup_failures(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = _provider()
    body = _FakeBody(close_error=OSError("body close failed"))
    client = _BlockingS3Client(
        blocked_method="get_object",
        body=body,
        close_error=RuntimeError("client close failed"),
    )
    monkeypatch.setattr(provider, "_client", lambda: client)
    task = asyncio.create_task(provider.get_object(object_key="source.bin", byte_range=None))
    assert await asyncio.to_thread(client.entered.wait, 1)

    task.cancel()
    try:
        await asyncio.sleep(0)
        assert task.done() is False
    finally:
        client.release.set()

    with pytest.raises(asyncio.CancelledError) as exc_info:
        await task

    assert body.close_calls == 1
    assert client.close_calls == 1
    assert exc_info.value.__notes__ == [
        "S3 cancelled result cleanup also failed while cancellation was settling: OSError",
        "S3 client close also failed with RuntimeError",
    ]


@pytest.mark.asyncio
async def test_asgi_23_disconnect_during_blocking_get_closes_unclaimed_body_and_client(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = _provider()
    body = _FakeBody()
    head_client = _FakeS3Client()
    get_client = _BlockingS3Client(blocked_method="get_object", body=body)
    clients = iter((head_client, get_client))
    monkeypatch.setattr(provider, "_client", lambda: next(clients))
    response = await stream_s3_object(
        provider=provider,
        object_key="source.bin",
        content_type="application/octet-stream",
        range_header=None,
    )
    disconnects: asyncio.Queue[Message] = asyncio.Queue()

    async def _receive() -> Message:
        return await disconnects.get()

    response_task = asyncio.create_task(
        _call_response(
            response,
            receive=_receive,
            spec_version="2.3",
        )
    )
    assert await asyncio.to_thread(get_client.entered.wait, 1)
    disconnects.put_nowait({"type": "http.disconnect"})
    try:
        await asyncio.sleep(0)
        assert response_task.done() is False
    finally:
        get_client.release.set()

    await response_task

    assert head_client.close_calls == 1
    assert body.close_calls == 1
    assert get_client.close_calls == 1


@pytest.mark.asyncio
async def test_asgi_23_disconnect_surfaces_sanitized_unclaimed_result_cleanup_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = _provider()
    body_error = OSError("provider body cleanup payload must stay private")
    body_error.add_note("provider body note must stay private")
    client_error = RuntimeError("provider client cleanup payload must stay private")
    client_error.add_note("provider client note must stay private")
    body = _FakeBody(close_error=body_error)
    head_client = _FakeS3Client()
    get_client = _BlockingS3Client(
        blocked_method="get_object",
        body=body,
        close_error=client_error,
    )
    clients = iter((head_client, get_client))
    monkeypatch.setattr(provider, "_client", lambda: next(clients))
    response = await stream_s3_object(
        provider=provider,
        object_key="source.bin",
        content_type="application/octet-stream",
        range_header=None,
    )
    disconnects: asyncio.Queue[Message] = asyncio.Queue()

    async def _receive() -> Message:
        return await disconnects.get()

    response_task = asyncio.create_task(
        _call_response(
            response,
            receive=_receive,
            spec_version="2.3",
        )
    )
    assert await asyncio.to_thread(get_client.entered.wait, 1)
    disconnects.put_nowait({"type": "http.disconnect"})
    try:
        await asyncio.sleep(0)
        assert response_task.done() is False
    finally:
        get_client.release.set()

    with pytest.raises(S3ResponseCleanupError) as exc_info:
        await response_task

    error = exc_info.value
    notes = getattr(error, "__notes__", [])
    rendered_error = " ".join((str(error), *notes))
    assert str(error) == "S3 response cleanup failed after client disconnect"
    assert notes == [
        "S3 cancelled result cleanup also failed while cancellation was settling: OSError",
        "S3 client close also failed with RuntimeError",
    ]
    assert "provider body" not in rendered_error
    assert "provider client" not in rendered_error
    assert error.__cause__ is None
    assert head_client.close_calls == 1
    assert body.close_calls == 1
    assert get_client.close_calls == 1


@pytest.mark.asyncio
async def test_download_preserves_read_failure_when_body_and_client_close_fail(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    provider = _provider()
    read_error = ValueError("body read failed")
    body = _FakeBody(
        read_error=read_error,
        close_error=OSError("body close failed"),
    )
    client = _FakeS3Client(
        body=body,
        close_error=RuntimeError("client close failed"),
    )
    monkeypatch.setattr(provider, "_client", lambda: client)

    with pytest.raises(ValueError) as exc_info:
        await provider.download_object_to_path(
            object_key="source.bin",
            out_path=tmp_path / "source.bin",
        )

    assert exc_info.value is read_error
    assert body.close_calls == 1
    assert client.close_calls == 1
    assert exc_info.value.__notes__ == [
        "S3 response body close also failed with OSError",
        "S3 client close also failed with RuntimeError",
    ]


@pytest.mark.asyncio
async def test_asgi_23_first_chunk_send_failure_closes_streaming_body_and_client(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = _provider()
    body = _FakeBody()
    head_client = _FakeS3Client()
    get_client = _FakeS3Client(body=body)
    clients = iter((head_client, get_client))
    monkeypatch.setattr(provider, "_client", lambda: next(clients))
    response = await stream_s3_object(
        provider=provider,
        object_key="source.bin",
        content_type="application/octet-stream",
        range_header=None,
    )
    send_error = OSError("client disconnected during first chunk")

    async def _receive() -> Message:
        await asyncio.Event().wait()
        raise AssertionError("cancelled ASGI receive unexpectedly resumed")

    async def _send(message: Message) -> None:
        if message["type"] == "http.response.body" and message.get("body"):
            raise send_error

    with pytest.raises(ClientDisconnect) as exc_info:
        await _call_response(
            response,
            receive=_receive,
            send=_send,
            spec_version="2.3",
        )

    assert exc_info.value.__cause__ is send_error
    assert head_client.close_calls == 1
    assert body.close_calls == 1
    assert get_client.close_calls == 1


@pytest.mark.asyncio
async def test_asgi_23_direct_response_cancellation_preserves_sanitized_close_failure_notes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = _provider()
    body_error = RuntimeError("provider body close payload must stay private")
    body_error.add_note("provider body note must stay private")
    client_error = RuntimeError("provider client close payload must stay private")
    client_error.add_note("provider client note must stay private")
    body = _FakeBody(close_error=body_error)
    head_client = _FakeS3Client()
    get_client = _FakeS3Client(body=body, close_error=client_error)
    clients = iter((head_client, get_client))
    monkeypatch.setattr(provider, "_client", lambda: next(clients))
    response = await stream_s3_object(
        provider=provider,
        object_key="source.bin",
        content_type="application/octet-stream",
        range_header=None,
    )
    chunk_send_entered = asyncio.Event()

    async def _receive() -> Message:
        await asyncio.Event().wait()
        raise AssertionError("cancelled ASGI receive unexpectedly resumed")

    async def _send(message: Message) -> None:
        if message["type"] == "http.response.body" and message.get("body"):
            chunk_send_entered.set()
            await asyncio.Event().wait()

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

    with pytest.raises(asyncio.CancelledError) as exc_info:
        await response_task

    error = exc_info.value
    notes = getattr(error, "__notes__", [])
    rendered_error = " ".join((str(error), *notes))
    assert notes == [
        "S3 response body close also failed while streaming: RuntimeError",
        "S3 client close also failed with RuntimeError",
    ]
    assert "provider body" not in rendered_error
    assert "provider client" not in rendered_error
    assert error.__cause__ is None
    assert head_client.close_calls == 1
    assert body.close_calls == 1
    assert get_client.close_calls == 1


@pytest.mark.asyncio
async def test_stream_preserves_read_failure_when_raw_body_and_client_close_fail(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = _provider()
    read_error = ValueError("body read failed")
    body = _FakeBody(
        read_error=read_error,
        close_error=OSError("body close failed"),
    )
    head_client = _FakeS3Client()
    get_client = _FakeS3Client(
        body=body,
        close_error=RuntimeError("client close failed"),
    )
    clients = iter((head_client, get_client))
    monkeypatch.setattr(provider, "_client", lambda: next(clients))
    response = await stream_s3_object(
        provider=provider,
        object_key="source.bin",
        content_type="application/octet-stream",
        range_header=None,
    )

    with pytest.raises(ValueError) as exc_info:
        await _call_response(response)

    assert exc_info.value is read_error
    assert exc_info.value.__notes__ == [
        "S3 response body close also failed while streaming: OSError",
        "S3 client close also failed with RuntimeError",
    ]
    assert head_client.close_calls == 1
    assert body.close_calls == 1
    assert get_client.close_calls == 1
