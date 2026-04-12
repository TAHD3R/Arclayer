from __future__ import annotations

import inspect
import secrets
from collections.abc import Awaitable, Callable
from typing import Any, cast

from pydantic import ValidationError

from src.infra.cache.valkey import ValkeyClientLike
from src.modules.auth.sso.schema import AuthSSOExchangePayload

SSO_EXCHANGE_TTL_SECONDS = 60
_EXCHANGE_KEY_PREFIX = "auth:sso:exchange"


def _exchange_key(code: str) -> str:
    raw = (code or "").strip()
    return f"{_EXCHANGE_KEY_PREFIX}:{raw}"


async def _valkey_getdel_best_effort(client: ValkeyClientLike, key: str) -> str | None:
    """
    Best-effort atomic get+delete.

    Notes:
    - ValkeyClient implements `getdel`, but `ValkeyClientLike` intentionally doesn't require it,
      because some fakes in unit tests don't implement the method.
    - We also guard against incorrectly-typed sync `getdel` implementations in tests.
    """

    getdel = getattr(client, "getdel", None)
    if callable(getdel):
        fn = cast(Callable[[str], Any], getdel)
        result = fn(key)
        if inspect.isawaitable(result):
            return await cast(Awaitable[str | None], result)
        if result is None or isinstance(result, str):
            # Best-effort delete in case a sync getdel implementation didn't.
            await client.delete(key)
            return result

    value = await client.get(key)
    if value is None:
        return None
    await client.delete(key)
    return value


async def issue_exchange_code(
    valkey: ValkeyClientLike,
    *,
    payload: AuthSSOExchangePayload,
    ttl_seconds: int = SSO_EXCHANGE_TTL_SECONDS,
) -> str:
    """
    Issue a one-time SSO exchange code.

    Plugins should call this after completing an OAuth/SSO flow and resolving a local user.
    """

    ttl = ttl_seconds if ttl_seconds and ttl_seconds > 0 else SSO_EXCHANGE_TTL_SECONDS
    # Collision is extremely unlikely, but we still use NX and retry to preserve one-time semantics.
    for _ in range(5):
        code = secrets.token_urlsafe(24)
        ok = await valkey.set(_exchange_key(code), payload.model_dump_json(), ex=ttl, nx=True)
        if ok:
            return code

    # Last resort: no NX to avoid login breakage under extreme collision or backend mismatch.
    code = secrets.token_urlsafe(24)
    await valkey.set(_exchange_key(code), payload.model_dump_json(), ex=ttl)
    return code


async def consume_exchange_payload(
    valkey: ValkeyClientLike,
    *,
    code: str,
) -> AuthSSOExchangePayload | None:
    """
    Consume (get+delete) a one-time SSO exchange code payload.

    Returns None if:
    - code is missing/blank,
    - the payload is missing,
    - the stored payload is invalid.
    """

    raw_code = (code or "").strip()
    if not raw_code:
        return None

    key = _exchange_key(raw_code)
    payload_raw = await _valkey_getdel_best_effort(valkey, key)
    if not payload_raw:
        return None

    try:
        return AuthSSOExchangePayload.model_validate_json(payload_raw)
    except (TypeError, ValueError, ValidationError):
        return None
