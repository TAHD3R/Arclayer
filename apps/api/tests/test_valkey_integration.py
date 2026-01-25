from __future__ import annotations

import pytest

pytestmark = pytest.mark.integration


async def test_valkey_basic_roundtrip(valkey_client) -> None:
    client, prefix = valkey_client

    key = "basic"
    await client.set(key, "ok")
    assert await client.get(key) == "ok"
    assert await client.raw.exists(f"{prefix}:{key}") == 1

    ttl = await client.ttl(key)
    assert ttl > 0

    await client.delete(key)


async def test_valkey_json_and_incr(valkey_client) -> None:
    client, _ = valkey_client

    json_key = "captcha"
    payload = {"code": "1234"}
    await client.set_json(json_key, payload, ex=2)
    assert await client.get_json(json_key) == payload

    rate_key = "rate"
    value = await client.incr_with_ttl(rate_key, ttl=2)
    assert value == 1
    assert await client.ttl(rate_key) > 0

    await client.delete(json_key, rate_key)
