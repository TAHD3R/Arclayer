from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient

from src.config import ApplicationSettings, Settings
from src.core.registry import AppFactory

_ASGI_TRANSPORT_HEARTBEAT_INTERVAL_SECONDS = 0.2


async def _asgi_transport_heartbeat() -> None:
    """
    Periodically wake the event loop while using httpx ASGITransport.

    Why:
    - ASGITransport runs without socket I/O and does not run app lifespan in httpx 0.28.
    - Some sync ASGI components (e.g. StaticFiles) execute in a worker thread and then
      wake the loop via `loop.call_soon_threadsafe(...)`.
    - Without timers, the event loop can block indefinitely and tests hang.
    """

    while True:
        await asyncio.sleep(_ASGI_TRANSPORT_HEARTBEAT_INTERVAL_SECONDS)


@pytest.fixture
async def asgi_transport_heartbeat() -> AsyncIterator[None]:
    task = asyncio.create_task(_asgi_transport_heartbeat(), name="test-asgi-transport-heartbeat")
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


@pytest.mark.asyncio
async def test_spotlight_enabled_in_development(asgi_transport_heartbeat: None) -> None:
    settings = Settings(
        app_env="development",
        application=ApplicationSettings(static_enabled=False),
    )
    app = AppFactory(settings).with_spotlight_docs().app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/docs")
        assert resp.status_code == 200
        html = resp.text
        assert 'apiDescriptionUrl="/openapi.json"' in html
        assert "/_docs/spotlight@9.0.6/styles.min.css" in html
        assert "/_docs/spotlight@9.0.6/web-components.min.js" in html

        # Ensure local static assets are actually served (no network dependency).
        resp = await client.get("/_docs/spotlight@9.0.6/styles.min.css")
        assert resp.status_code == 200


@pytest.mark.asyncio
async def test_spotlight_disabled_in_production() -> None:
    settings = Settings(
        app_env="production",
        application=ApplicationSettings(static_enabled=False),
        # Production settings require a stable public-id secret; provide a test-only value.
        public_id={"secret": "test-public-id-secret"},
    )
    app = AppFactory(settings).with_spotlight_docs().app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/docs")
        assert resp.status_code == 404


@pytest.mark.asyncio
async def test_spotlight_alias_redirects_to_docs(asgi_transport_heartbeat: None) -> None:
    settings = Settings(
        app_env="development",
        application=ApplicationSettings(static_enabled=False),
    )
    app = AppFactory(settings).with_spotlight_docs().app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", follow_redirects=False) as client:
        resp = await client.get("/spotlight")
        assert resp.status_code in {301, 302, 307, 308}
        assert resp.headers["location"] == "/docs"
