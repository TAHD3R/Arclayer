from __future__ import annotations

from collections.abc import Awaitable
from typing import Protocol, cast

from redis.asyncio import Redis
from taskiq.abc.schedule_source import ScheduleSource
from taskiq.exceptions import ScheduledTaskCancelledError
from taskiq.schedule_sources import LabelScheduleSource
from taskiq.scheduler.scheduled_task import ScheduledTask
from taskiq.utils import maybe_awaitable

_ACQUIRE_OR_RENEW = """
local current = redis.call('GET', KEYS[1])
if current == ARGV[1] then
  return redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
if not current then
  local acquired = redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2], 'NX')
  if acquired then return 1 end
end
return 0
"""
_RELEASE = """
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
"""


class SchedulerLeaderLease(Protocol):
    async def acquire_or_renew(self) -> bool: ...

    async def release(self) -> None: ...

    async def close(self) -> None: ...


class RedisSchedulerLeaderLease:
    """Token-owned renewable scheduler lease with atomic compare operations."""

    __slots__ = ("_closed", "_key", "_redis", "_token", "_ttl_milliseconds")

    def __init__(self, *, dsn: str, key: str, token: str, ttl_seconds: int) -> None:
        self._redis = Redis.from_url(dsn)
        self._key = key
        self._token = token
        self._ttl_milliseconds = ttl_seconds * 1000
        self._closed = False

    async def acquire_or_renew(self) -> bool:
        if self._closed:
            raise RuntimeError("Scheduler leader lease is closed")
        result = await cast(
            Awaitable[int],
            self._redis.eval(
                _ACQUIRE_OR_RENEW,
                1,
                self._key,
                self._token,
                self._ttl_milliseconds,
            ),
        )
        return result == 1

    async def release(self) -> None:
        if self._closed:
            return
        await cast(
            Awaitable[int],
            self._redis.eval(_RELEASE, 1, self._key, self._token),
        )

    async def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        await self._redis.aclose()


class LeaderScheduleSource(ScheduleSource):
    """Expose and send schedules only while this process owns the leader lease."""

    __slots__ = ("_closed", "_inner", "_lease")

    def __init__(self, *, inner: LabelScheduleSource, lease: SchedulerLeaderLease) -> None:
        self._inner = inner
        self._lease = lease
        self._closed = False

    async def startup(self) -> None:
        await self._inner.startup()

    async def get_schedules(self) -> list[ScheduledTask]:
        if not await self._lease.acquire_or_renew():
            return []
        return await self._inner.get_schedules()

    async def pre_send(self, task: ScheduledTask) -> None:
        if not await self._lease.acquire_or_renew():
            raise ScheduledTaskCancelledError
        await maybe_awaitable(self._inner.pre_send(task))

    async def post_send(self, task: ScheduledTask) -> None:
        await maybe_awaitable(self._inner.post_send(task))

    async def shutdown(self) -> None:
        if self._closed:
            return
        self._closed = True
        try:
            await self._lease.release()
        finally:
            await self._lease.close()
            await self._inner.shutdown()
