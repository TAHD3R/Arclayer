from __future__ import annotations

from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.src.config import get_settings
from apps.api.src.core.registry import create_app

pytestmark = pytest.mark.integration


async def test_plugin_admin_alias_route_is_removed(monkeypatch) -> None:
    """
    Legacy plugin alias routes are intentionally removed.

    See SPEC: legacy plugin runtime/endpoints are not supported and no compatibility is provided.
    """

    workspace_id = uuid4()
    slug = "demo-plugin"

    monkeypatch.setenv("TEST_DATABASE__ENABLED", "0")
    monkeypatch.setenv("TEST_VALKEY__ENABLED", "0")
    get_settings.cache_clear()

    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(f"/api/v1/workspaces/{workspace_id}/plugins/{slug}/validate")
        assert resp.status_code == 404
