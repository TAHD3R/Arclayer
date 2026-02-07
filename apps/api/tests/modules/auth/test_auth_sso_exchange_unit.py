from __future__ import annotations

import json
from typing import Any, cast
from uuid import UUID, uuid4

import pytest

from apps.api.config import get_settings
from apps.api.core.exceptions import BadRequest
from apps.api.infra.cache.valkey import ValkeyClientLike
from apps.api.modules.auth.schema import TokenPair
from apps.api.modules.auth.service import AuthService
from apps.api.modules.auth.sso.exchange_store import _valkey_getdel_best_effort, issue_exchange_code
from apps.api.modules.auth.sso.schema import AuthSSOExchangePayload
from apps.api.modules.auth.sso.service import AuthSSOService
from apps.api.plugin.manager import PluginManager


class _FakeValkey(ValkeyClientLike):
    def __init__(self) -> None:
        self._store: dict[str, Any] = {}
        self._sets: dict[str, set[str]] = {}

    def key(self, *parts: str) -> str:
        return ":".join(parts)

    async def get(self, key: str) -> str | None:
        value = self._store.get(key)
        return value if isinstance(value, str) else None

    async def set(
        self,
        key: str,
        value: str,
        *,
        ex: int | None = None,
        nx: bool | None = None,
        xx: bool | None = None,
    ) -> bool:
        _ = ex, nx, xx
        self._store[key] = value
        return True

    async def delete(self, *keys: str) -> int:
        removed = 0
        for key in keys:
            if key in self._store:
                del self._store[key]
                removed += 1
        return removed

    async def expire(self, key: str, seconds: int) -> bool:
        _ = key, seconds
        return True

    async def ttl(self, key: str) -> int:
        _ = key
        return 0

    async def get_json(self, key: str) -> Any:
        raw = await self.get(key)
        if raw is None:
            return None
        try:
            return json.loads(raw)
        except Exception:
            return None

    async def set_json(
        self,
        key: str,
        data: Any,
        *,
        ex: int | None = None,
        nx: bool | None = None,
        xx: bool | None = None,
    ) -> bool:
        _ = ex, nx, xx
        self._store[key] = json.dumps(data)
        return True

    async def sadd(self, key: str, *members: str) -> int:
        bucket = self._sets.setdefault(key, set())
        before = len(bucket)
        bucket.update(str(m) for m in members)
        return len(bucket) - before

    async def srem(self, key: str, *members: str) -> int:
        bucket = self._sets.setdefault(key, set())
        removed = 0
        for member in members:
            if member in bucket:
                bucket.remove(member)
                removed += 1
        return removed

    async def smembers(self, key: str) -> set[str]:
        return set(self._sets.get(key, set()))


class _FakeValkeyWithGetDel(_FakeValkey):
    async def getdel(self, key: str) -> str | None:
        value = self._store.get(key)
        if key in self._store:
            del self._store[key]
        return value if isinstance(value, str) else None


class _FakeValkeyWithSyncGetDel(_FakeValkey):
    # Deliberately sync to ensure `_valkey_getdel_best_effort` doesn't crash when
    # a fake provides a non-awaitable `getdel`.
    def getdel(self, key: str) -> str | None:
        value = self._store.get(key)
        return value if isinstance(value, str) else None


class _FakeAuthService:
    async def issue_token_pair_for_user(self, user_id: UUID) -> TokenPair:
        _ = user_id
        return TokenPair(
            access_token="access",
            refresh_token="refresh",
            expires_in=900,
            refresh_expires_in=2592000,
        )


@pytest.mark.asyncio
async def test_valkey_getdel_best_effort_fallback_deletes_key() -> None:
    v = _FakeValkey()
    await v.set("k", "v", ex=5)

    got = await _valkey_getdel_best_effort(v, "k")
    assert got == "v"
    assert await v.get("k") is None


@pytest.mark.asyncio
async def test_valkey_getdel_best_effort_prefers_getdel_when_available() -> None:
    v = _FakeValkeyWithGetDel()
    await v.set("k", "v", ex=5)

    got = await _valkey_getdel_best_effort(v, "k")
    assert got == "v"
    assert await v.get("k") is None


@pytest.mark.asyncio
async def test_valkey_getdel_best_effort_handles_sync_getdel_fake() -> None:
    v = _FakeValkeyWithSyncGetDel()
    await v.set("k", "v", ex=5)

    got = await _valkey_getdel_best_effort(v, "k")
    assert got == "v"
    assert await v.get("k") is None


@pytest.mark.asyncio
async def test_auth_sso_exchange_code_is_one_time() -> None:
    settings = get_settings()
    manager = PluginManager(settings)
    valkey = _FakeValkey()
    auth = cast(AuthService, _FakeAuthService())
    service = AuthSSOService(settings, manager=manager, valkey=valkey, auth_service=auth)

    user_id = uuid4()
    code = await issue_exchange_code(valkey, payload=AuthSSOExchangePayload(user_id=user_id, redirect="/"), ttl_seconds=60)

    tokens = await service.exchange(code=code)
    assert tokens.access_token == "access"

    with pytest.raises(BadRequest) as exc:
        await service.exchange(code=code)
    assert exc.value.error == "SSO_CODE_INVALID"
