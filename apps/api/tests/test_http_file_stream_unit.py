from __future__ import annotations

from pathlib import Path

import pytest
from fastapi import FastAPI, Header
from httpx import ASGITransport, AsyncClient


@pytest.mark.asyncio
async def test_stream_file_full_content(tmp_path: Path) -> None:
    from apps.api.http_utils.file_stream import stream_file_response

    p = tmp_path / "demo.bin"
    p.write_bytes(b"0123456789")

    app = FastAPI()

    @app.get("/file")
    async def file():
        return await stream_file_response(path=p, content_type="application/octet-stream", range_header=None)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/file")

    assert resp.status_code == 200
    assert resp.content == b"0123456789"
    assert resp.headers.get("accept-ranges") == "bytes"
    assert resp.headers.get("content-length") == "10"


@pytest.mark.asyncio
async def test_stream_file_range_content(tmp_path: Path) -> None:
    from apps.api.http_utils.file_stream import stream_file_response

    p = tmp_path / "demo.bin"
    p.write_bytes(b"0123456789")

    app = FastAPI()

    @app.get("/file")
    async def file(range: str | None = Header(default=None, alias="Range")):
        return await stream_file_response(path=p, content_type="application/octet-stream", range_header=range)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/file", headers={"Range": "bytes=3-5"})

    assert resp.status_code == 206
    assert resp.content == b"345"
    assert resp.headers["content-range"] == "bytes 3-5/10"
    assert resp.headers.get("accept-ranges") == "bytes"
    assert resp.headers.get("content-length") == "3"


@pytest.mark.asyncio
async def test_stream_file_invalid_range_returns_416(tmp_path: Path) -> None:
    from apps.api.http_utils.file_stream import stream_file_response

    p = tmp_path / "demo.bin"
    p.write_bytes(b"0123456789")

    app = FastAPI()

    @app.get("/file")
    async def file(range: str | None = Header(default=None, alias="Range")):
        return await stream_file_response(path=p, content_type="application/octet-stream", range_header=range)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/file", headers={"Range": "bytes=30-40"})

    assert resp.status_code == 416
    # RFC suggests Content-Range: bytes */{size}
    assert resp.headers.get("content-range") == "bytes */10"


@pytest.mark.asyncio
async def test_stream_file_supports_extra_headers(tmp_path: Path) -> None:
    from apps.api.http_utils.file_stream import stream_file_response

    p = tmp_path / "demo.bin"
    p.write_bytes(b"0123456789")

    app = FastAPI()

    @app.get("/file")
    async def file(range: str | None = Header(default=None, alias="Range")):
        return await stream_file_response(
            path=p,
            content_type="application/octet-stream",
            range_header=range,
            extra_headers={"Content-Disposition": "attachment; filename=demo.bin"},
        )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/file", headers={"Range": "bytes=0-0"})

    assert resp.status_code == 206
    assert resp.headers.get("content-disposition") == "attachment; filename=demo.bin"
