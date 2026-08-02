from __future__ import annotations

import pytest
from fastapi import FastAPI

from src.config import get_settings
from src.modules.product_runtime.router import router as product_runtime_router
from tests.utils.asgi_client import asgi_client

pytestmark = pytest.mark.integration


async def test_product_runtime_public_endpoint(monkeypatch) -> None:
    monkeypatch.setenv("TEST_DATABASE__ENABLED", "0")
    monkeypatch.setenv("TEST_VALKEY__ENABLED", "0")
    monkeypatch.setenv("AUTH__ALLOW_PUBLIC_REGISTER", "0")
    get_settings.cache_clear()

    app = FastAPI()
    app.include_router(product_runtime_router, prefix="/api/v1")

    async with asgi_client(app) as client:
        res = await client.get("/api/v1/runtime")

    assert res.status_code == 200
    payload = res.json()
    assert payload.get("error") is None
    data = payload.get("data") or {}
    caps = data.get("capabilities") or {}
    assert "deploymentSettingsEnabled" not in caps
    assert caps.get("publicRegisterEnabled") is False
