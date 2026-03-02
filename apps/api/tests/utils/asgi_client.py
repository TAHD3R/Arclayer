from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI


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
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(transport=transport, base_url=base_url) as client:
            yield client
