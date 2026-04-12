from __future__ import annotations

import asyncio
import builtins
import json
from typing import Any, Protocol, cast

from fastapi import FastAPI, Request
from redis import exceptions as redis_exc
from redis.asyncio import Redis

from src.config import Settings, ValkeySettings
from src.core.logging import get_logger

logger = get_logger(__name__)

NON_RETRYABLE = (redis_exc.AuthenticationError, redis_exc.ResponseError)
_FATAL_VALKEY_ERRORS: tuple[type[BaseException], ...] = (
    asyncio.CancelledError,
    GeneratorExit,
    KeyboardInterrupt,
    SystemExit,
)


def _raise_if_fatal(exc: BaseException) -> None:
    if isinstance(exc, _FATAL_VALKEY_ERRORS):
        raise exc


_orjson: Any = None
try:
    import orjson as _orjson
except ImportError:
    pass


class _AsyncEval(Protocol):
    async def eval(self, script: str, numkeys: int, *keys_and_args: Any) -> Any: ...


class _AsyncRedis(Protocol):
    async def ping(self) -> Any: ...

    async def get(self, key: str) -> str | None: ...

    async def set(self, key: str, value: str, **kwargs: Any) -> Any: ...

    async def delete(self, *keys: str) -> int: ...

    async def exists(self, *keys: str) -> int: ...

    async def expire(self, key: str, seconds: int) -> Any: ...

    async def ttl(self, key: str) -> int: ...

    async def getdel(self, key: str) -> str | None: ...

    async def setex(self, key: str, seconds: int, value: str) -> Any: ...

    async def incr(self, key: str, amount: int = 1) -> int: ...

    async def sadd(self, key: str, *members: str) -> int: ...

    async def srem(self, key: str, *members: str) -> int: ...

    async def smembers(self, key: str) -> builtins.set[str]: ...

    async def aclose(self) -> Any: ...

    async def eval(self, script: str, numkeys: int, *keys_and_args: Any) -> Any: ...


def _json_dumps(data: Any) -> str:
    if _orjson is not None:
        return _orjson.dumps(data).decode("utf-8")
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"))


def _json_loads(data: bytes | str | None) -> Any:
    if data is None:
        return None
    if isinstance(data, bytes):
        data = data.decode("utf-8", errors="ignore")
    return (_orjson or json).loads(data)


def _valkey_dsn_hint(settings: ValkeySettings) -> str:
    user = f"{settings.username}@" if settings.username else ""
    return f"redis://{user}{settings.host}:{settings.port}/{settings.db}"


class ValkeyClient:
    __slots__ = ("_r", "_prefix", "_default_ttl")

    def __init__(self, client: _AsyncRedis, *, prefix: str = "", default_ttl: int | None = None) -> None:
        self._r = client
        self._prefix = prefix.strip(":")
        self._default_ttl = default_ttl if default_ttl and default_ttl > 0 else None

    @property
    def raw(self) -> _AsyncRedis:
        return self._r

    def key(self, *parts: str) -> str:
        if self._prefix:
            return ":".join((self._prefix, *parts))
        return ":".join(parts)

    async def ping(self) -> bool:
        return bool(await self._r.ping())

    async def get(self, key: str) -> str | None:
        return await self._r.get(self.key(key))

    async def set(
        self,
        key: str,
        value: str,
        *,
        ex: int | None = None,
        nx: bool | None = None,
        xx: bool | None = None,
    ) -> bool:
        ttl = ex if ex is not None else self._default_ttl
        kwargs: dict[str, Any] = {}
        if ttl is not None:
            kwargs["ex"] = ttl
        if nx is not None:
            kwargs["nx"] = nx
        if xx is not None:
            kwargs["xx"] = xx
        return bool(await self._r.set(self.key(key), value, **kwargs))

    async def delete(self, *keys: str) -> int:
        return await self._r.delete(*(self.key(k) for k in keys))

    async def exists(self, key: str) -> int:
        return int(await self._r.exists(self.key(key)))

    async def expire(self, key: str, seconds: int) -> bool:
        return bool(await self._r.expire(self.key(key), seconds))

    async def ttl(self, key: str) -> int:
        return await self._r.ttl(self.key(key))

    async def getdel(self, key: str) -> str | None:
        return await self._r.getdel(self.key(key))

    async def setex(self, key: str, seconds: int, value: str) -> bool:
        return bool(await self._r.setex(self.key(key), seconds, value))

    async def incr(self, key: str, amount: int = 1) -> int:
        return await self._r.incr(self.key(key), amount)

    async def sadd(self, key: str, *members: str) -> int:
        return int(await self._r.sadd(self.key(key), *members))

    async def srem(self, key: str, *members: str) -> int:
        return int(await self._r.srem(self.key(key), *members))

    async def smembers(self, key: str) -> builtins.set[str]:
        members = await self._r.smembers(self.key(key))
        return {str(x) for x in members} if members else set()

    async def incr_with_ttl(self, key: str, *, ttl: int | None = None, amount: int = 1) -> int:
        ttl_value = ttl if ttl is not None else self._default_ttl
        if not ttl_value:
            return await self.incr(key, amount=amount)

        script = """
        local val = redis.call('incrby', KEYS[1], ARGV[1])
        if val == tonumber(ARGV[1]) then
            redis.call('expire', KEYS[1], ARGV[2])
        end
        return val
        """
        redis = cast(_AsyncEval, self._r)
        result = await redis.eval(script, 1, self.key(key), amount, ttl_value)
        return int(result)

    async def get_json(self, key: str) -> Any:
        return _json_loads(await self._r.get(self.key(key)))

    async def set_json(
        self,
        key: str,
        data: Any,
        *,
        ex: int | None = None,
        nx: bool | None = None,
        xx: bool | None = None,
    ) -> bool:
        return await self.set(key, _json_dumps(data), ex=ex, nx=nx, xx=xx)


class ValkeyClientLike(Protocol):
    """
    Structural type for Valkey/Redis access used by domain services.

    This keeps services testable (fakes can implement the same surface area)
    without depending on a concrete ValkeyClient subclass.
    """

    def key(self, *parts: str) -> str: ...

    async def get(self, key: str) -> str | None: ...

    async def set(
        self,
        key: str,
        value: str,
        *,
        ex: int | None = None,
        nx: bool | None = None,
        xx: bool | None = None,
    ) -> bool: ...

    async def delete(self, *keys: str) -> int: ...

    async def expire(self, key: str, seconds: int) -> bool: ...

    async def ttl(self, key: str) -> int: ...

    async def get_json(self, key: str) -> Any: ...

    async def set_json(
        self,
        key: str,
        data: Any,
        *,
        ex: int | None = None,
        nx: bool | None = None,
        xx: bool | None = None,
    ) -> bool: ...

    async def sadd(self, key: str, *members: str) -> int: ...

    async def srem(self, key: str, *members: str) -> int: ...

    async def smembers(self, key: str) -> builtins.set[str]: ...


def build_valkey(settings: ValkeySettings) -> _AsyncRedis:
    return cast(
        _AsyncRedis,
        Redis.from_url(
            settings.dsn,
            decode_responses=True,
            health_check_interval=30,
        ),
    )


async def verify_valkey_ready(
    client: _AsyncRedis,
    *,
    attempts: int = 5,
    base_delay: float = 0.5,
) -> None:
    last_exc: BaseException | None = None
    for attempt in range(1, attempts + 1):
        try:
            await client.ping()
            logger.info("Valkey connectivity OK")
            return
        except NON_RETRYABLE as exc:
            raise RuntimeError(f"Valkey auth error: {exc}") from exc
        except BaseException as exc:
            _raise_if_fatal(exc)
            last_exc = exc
            await asyncio.sleep(base_delay * attempt)

    raise RuntimeError("Valkey not ready after retries") from last_exc


async def init_valkey(app: FastAPI, settings: Settings) -> None:
    if not settings.valkey.enabled:
        logger.info("Valkey init skipped (disabled)")
        return

    hint = _valkey_dsn_hint(settings.valkey)
    try:
        client = build_valkey(settings.valkey)
        await verify_valkey_ready(client)
    except BaseException as exc:
        _raise_if_fatal(exc)
        logger.error("Valkey init failed", hint=hint, error=repr(exc))
        detail = str(exc)
        suffix = f" Detail: {detail}" if detail else ""
        raise RuntimeError(f"Valkey init failed. Check VALKEY__* settings and connectivity to {hint}.{suffix}") from exc
    app.state.valkey = ValkeyClient(
        client,
        prefix=settings.valkey.prefix,
        default_ttl=settings.valkey.default_ttl,
    )


async def close_valkey(app: FastAPI) -> None:
    client: ValkeyClient | None = getattr(app.state, "valkey", None)
    if client is None:
        return

    try:
        await client.raw.aclose()
        logger.info("Valkey connection closed")
    except BaseException as exc:
        _raise_if_fatal(exc)
        logger.warning("Valkey close error", error=repr(exc))


def get_valkey(request: Request) -> ValkeyClient:
    client: ValkeyClient | None = getattr(request.app.state, "valkey", None)
    if client is None:
        raise RuntimeError("Valkey client is not initialized")
    return client
