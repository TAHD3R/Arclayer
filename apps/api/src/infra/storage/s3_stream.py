from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

from starlette.responses import Response, StreamingResponse

from apps.api.src.core.http.range import parse_range_header
from apps.api.src.infra.storage.s3 import S3StorageProvider


async def stream_s3_object(
    *,
    provider: S3StorageProvider,
    object_key: str,
    content_type: str,
    range_header: str | None,
    extra_headers: dict[str, str] | None = None,
    chunk_size_bytes: int = 1024 * 1024,
) -> Response:
    """
    Stream an S3 object with HTTP Range support.

    Notes:
    - Designed for admin-preview/share endpoints where the server must proxy bytes.
    - Uses boto3 StreamingBody which is sync/blocking; reading happens in a thread.
    """

    head = await provider.head_object(object_key=object_key)
    size = int(head.size_bytes)

    # Always advertise Range support for video playback/seeking.
    base_headers: dict[str, str] = {"Accept-Ranges": "bytes"}
    headers: dict[str, str] = {**base_headers, **(extra_headers or {})}

    try:
        rng = parse_range_header(range_header, size=size)
    except ValueError:
        return Response(
            status_code=416,
            headers={**headers, "Content-Range": f"bytes */{size}"},
        )

    byte_range: tuple[int, int] | None = None
    status_code = 200
    if rng is None:
        headers["Content-Length"] = str(size)
    else:
        start, end = rng
        byte_range = (start, end)
        status_code = 206
        headers["Content-Range"] = f"bytes {start}-{end}/{size}"
        headers["Content-Length"] = str(end - start + 1)

    got = await provider.get_object(object_key=object_key, byte_range=byte_range)
    body = got.body

    async def _iter_body() -> AsyncIterator[bytes]:
        try:
            while True:
                chunk = await asyncio.to_thread(body.read, int(chunk_size_bytes))
                if not chunk:
                    break
                yield chunk
        finally:
            try:
                await asyncio.to_thread(body.close)
            except (OSError, RuntimeError, TypeError, ValueError):
                pass

    return StreamingResponse(_iter_body(), status_code=status_code, media_type=content_type, headers=headers)
