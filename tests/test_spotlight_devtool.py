from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.config import ApplicationSettings, Settings
from apps.api.core.registry import AppFactory


@pytest.mark.asyncio
async def test_spotlight_enabled_in_development() -> None:
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
    )
    app = AppFactory(settings).with_spotlight_docs().app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/docs")
        assert resp.status_code == 404


@pytest.mark.asyncio
async def test_spotlight_alias_redirects_to_docs() -> None:
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
