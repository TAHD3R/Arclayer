from __future__ import annotations

import pytest

from apps.api.src.infra.storage.s3 import S3GetObject, S3HeadObject
from apps.api.src.infra.storage.s3_stream import stream_s3_object


class _FakeBody:
    def __init__(self, chunks: list[bytes]) -> None:
        self._chunks = list(chunks)
        self.closed = False

    def read(self, _n: int) -> bytes:
        if not self._chunks:
            return b""
        return self._chunks.pop(0)

    def close(self) -> None:
        self.closed = True


class _FakeS3Provider:
    def __init__(self, *, size: int, payload: bytes) -> None:
        self._size = int(size)
        self._payload = payload
        self.seen_ranges: list[tuple[int, int] | None] = []

    async def head_object(self, *, object_key: str) -> S3HeadObject:
        _ = object_key
        return S3HeadObject(size_bytes=self._size, content_type="application/octet-stream", etag=None)

    async def get_object(self, *, object_key: str, byte_range: tuple[int, int] | None) -> S3GetObject:
        _ = object_key
        self.seen_ranges.append(byte_range)

        # For unit tests we don't simulate real server-side range slicing; the helper's correctness
        # is mainly about status code + headers + passing the requested range into provider.get_object().
        body = _FakeBody([self._payload, b""])
        return S3GetObject(body=body, content_type="application/octet-stream", content_length=None, etag=None)


pytestmark = pytest.mark.asyncio


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
    assert provider.seen_ranges == [None]


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
    assert provider.seen_ranges == [(2, 4)]
