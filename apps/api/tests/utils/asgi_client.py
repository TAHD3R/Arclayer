from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI

_ASGI_CLIENT_HEARTBEAT_INTERVAL_SECONDS = 0.2


async def _asgi_client_heartbeat() -> None:
    """
    Periodically wake the event loop while using httpx ASGITransport.

    Why:
    - FastAPI runs sync dependencies/endpoints in a worker threadpool.
    - The worker thread completes by scheduling callbacks via `loop.call_soon_threadsafe(...)`.
    - In in-process transports there may be no socket I/O, and the loop can block indefinitely.
    """

    while True:
        await asyncio.sleep(_ASGI_CLIENT_HEARTBEAT_INTERVAL_SECONDS)


@asynccontextmanager
async def asgi_client(
    app: FastAPI,
    *,
    base_url: str = "http://testserver",
    raise_app_exceptions: bool = True,
    client_addr: tuple[str, int] = ("127.0.0.1", 123),
) -> AsyncIterator[httpx.AsyncClient]:
    """
    In-process ASGI test client without using Starlette's TestClient.

    Notes:
    - Starlette's TestClient relies on AnyIO's blocking portal (thread + cross-thread signaling),
      which may be unavailable in sandboxed environments that disallow sockets.
    - This helper runs the app in the current event loop via httpx.ASGITransport and explicitly
      drives the ASGI lifespan using `app.router.lifespan_context`.
    """

    transport = httpx.ASGITransport(app=app, raise_app_exceptions=raise_app_exceptions, client=client_addr)
    heartbeat_task = asyncio.create_task(_asgi_client_heartbeat(), name="test-asgi-client-heartbeat")
    try:
        async with app.router.lifespan_context(app):
            async with httpx.AsyncClient(transport=transport, base_url=base_url) as client:
                yield client
    finally:
        heartbeat_task.cancel()
        try:
            await heartbeat_task
        except asyncio.CancelledError:
            pass
