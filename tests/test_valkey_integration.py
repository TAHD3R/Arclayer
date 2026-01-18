from __future__ import annotations

import os
import uuid

import pytest
from fastapi import FastAPI

from apps.api.config import get_settings
from apps.api.core.valkey import close_valkey, init_valkey


def _integration_enabled() -> bool:
    return os.getenv("RUN_INTEGRATION_TESTS") == "1"


async def test_valkey_basic_roundtrip(monkeypatch) -> None:
    if not _integration_enabled():
        pytest.skip("integration tests disabled")

    prefix = f"test:{uuid.uuid4().hex}"
    monkeypatch.setenv("VALKEY__ENABLED", "1")
    monkeypatch.setenv("VALKEY__DEFAULT_TTL", "5")
    monkeypatch.setenv("VALKEY__PREFIX", prefix)

    settings = get_settings()
    app = FastAPI()

    await init_valkey(app, settings)
    try:
        client = app.state.valkey

        key = "basic"
        await client.set(key, "ok")
        assert await client.get(key) == "ok"
        assert await client.raw.exists(f"{prefix}:{key}") == 1

        ttl = await client.ttl(key)
        assert ttl > 0

        await client.delete(key)
    finally:
        await close_valkey(app)


async def test_valkey_json_and_incr(monkeypatch) -> None:
    if not _integration_enabled():
        pytest.skip("integration tests disabled")

    prefix = f"test:{uuid.uuid4().hex}"
    monkeypatch.setenv("VALKEY__ENABLED", "1")
    monkeypatch.setenv("VALKEY__DEFAULT_TTL", "3")
    monkeypatch.setenv("VALKEY__PREFIX", prefix)

    settings = get_settings()
    app = FastAPI()

    await init_valkey(app, settings)
    try:
        client = app.state.valkey

        json_key = "captcha"
        payload = {"code": "1234"}
        await client.set_json(json_key, payload, ex=2)
        assert await client.get_json(json_key) == payload

        rate_key = "rate"
        value = await client.incr_with_ttl(rate_key, ttl=2)
        assert value == 1
        assert await client.ttl(rate_key) > 0

        await client.delete(json_key, rate_key)
    finally:
        await close_valkey(app)
