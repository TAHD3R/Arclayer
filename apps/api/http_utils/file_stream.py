from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path

from starlette.responses import Response, StreamingResponse

from apps.api.http_utils.range import parse_range_header


async def _iter_file_bytes(
    path: Path,
    *,
    start: int,
    end: int,
    chunk_size: int = 1024 * 1024,
) -> AsyncIterator[bytes]:
    # IMPORTANT:
    # - Starlette wraps *sync* iterables in a threadpool via anyio.
    # - In this sandbox environment, anyio thread offloading may hang.
    # - We therefore expose an *async* iterator and do small sync reads inside.
    #
    # Production note:
    # Large file delivery should be offloaded to Nginx (X-Accel-Redirect) or a CDN/object storage.
    with path.open("rb") as f:
        f.seek(start)
        remaining = end - start + 1
        while remaining > 0:
            to_read = min(chunk_size, remaining)
            chunk = f.read(to_read)
            if not chunk:
                return
            remaining -= len(chunk)
            yield chunk


async def stream_file_response(
    *,
    path: Path,
    content_type: str,
    range_header: str | None,
    extra_headers: dict[str, str] | None = None,
) -> Response:
    """
    Stream a local file with optional HTTP Range support.

    - Returns 200 for full content.
    - Returns 206 for satisfiable byte ranges.
    - Returns 416 for invalid/unsatisfiable ranges (with Content-Range: bytes */{size}).

    This helper is intentionally DB-agnostic and can be reused by asset/public/share handlers.
    """

    stat = path.stat()
    size = int(stat.st_size)

    # Always advertise Range support for video playback/seeking.
    base_headers = {"Accept-Ranges": "bytes"}
    extra = extra_headers or {}

    try:
        rng = parse_range_header(range_header, size=size)
    except ValueError:
        return Response(
            status_code=416,
            headers={**base_headers, "Content-Range": f"bytes */{size}", **extra},
        )

    if rng is None:
        # Full content
        headers = {**base_headers, "Content-Length": str(size), **extra}
        return StreamingResponse(
            _iter_file_bytes(path, start=0, end=max(size - 1, 0)),
            status_code=200,
            media_type=content_type,
            headers=headers,
        )

    start, end = rng
    headers = {
        **base_headers,
        "Content-Range": f"bytes {start}-{end}/{size}",
        "Content-Length": str(end - start + 1),
        **extra,
    }
    return StreamingResponse(
        _iter_file_bytes(path, start=start, end=end),
        status_code=206,
        media_type=content_type,
        headers=headers,
    )
