from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from src.config import Settings
from src.platform.jobs import ai_conversation_retention as retention


class FakeConversationRetentionRepository:
    def __init__(self, deletions: list[int]) -> None:
        self._deletions = deletions
        self.calls: list[tuple[datetime, int]] = []

    async def delete_older_than(self, *, cutoff: datetime, batch_size: int) -> int:
        self.calls.append((cutoff, batch_size))
        return self._deletions.pop(0) if self._deletions else 0


@pytest.mark.asyncio
async def test_ai_conversation_retention_cleanup_deletes_expired_conversations(monkeypatch) -> None:
    released = False
    repository = FakeConversationRetentionRepository([500, 25, 0])

    async def _core_settings(_settings: Settings, *, ttl_seconds: float = 5.0) -> dict[str, object]:
        _ = ttl_seconds
        return {"ai_agents": {"conversation_retention_days": 30}}

    async def _acquire() -> bool:
        return True

    async def _release() -> None:
        nonlocal released
        released = True

    monkeypatch.setattr(retention, "_orm_initialized", lambda: True)
    monkeypatch.setattr(retention, "_try_acquire_lock", _acquire)
    monkeypatch.setattr(retention, "_release_lock", _release)
    monkeypatch.setattr(retention, "get_core_settings_value_cached", _core_settings)
    monkeypatch.setenv("DATABASE__ENABLED", "1")

    await retention.ai_conversation_retention_cleanup({
        "settings": Settings(app_env="test", database={"enabled": True}),
        "conversation_repository": repository,
    })

    assert released is True
    assert [batch_size for _, batch_size in repository.calls] == [500, 500, 500]
    cutoff = repository.calls[0][0]
    assert datetime.now(UTC) - timedelta(days=31) < cutoff < datetime.now(UTC) - timedelta(days=29)


@pytest.mark.asyncio
async def test_ai_conversation_retention_cleanup_stops_at_delete_cap(monkeypatch) -> None:
    repository = FakeConversationRetentionRepository([500] * 20)

    async def _core_settings(_settings: Settings, *, ttl_seconds: float = 5.0) -> dict[str, object]:
        _ = ttl_seconds
        return {"ai_agents": {"conversation_retention_days": 7}}

    async def _acquire() -> bool:
        return True

    async def _release() -> None:
        return None

    monkeypatch.setattr(retention, "_orm_initialized", lambda: True)
    monkeypatch.setattr(retention, "_try_acquire_lock", _acquire)
    monkeypatch.setattr(retention, "_release_lock", _release)
    monkeypatch.setattr(retention, "get_core_settings_value_cached", _core_settings)
    monkeypatch.setenv("DATABASE__ENABLED", "1")

    await retention.ai_conversation_retention_cleanup({
        "settings": Settings(app_env="test", database={"enabled": True}),
        "conversation_repository": repository,
    })

    assert len(repository.calls) == 10
    assert [batch_size for _, batch_size in repository.calls] == [500] * 10


@pytest.mark.asyncio
async def test_ai_conversation_retention_cleanup_rejects_invalid_retention_setting(monkeypatch) -> None:
    repository = FakeConversationRetentionRepository([1])

    async def _core_settings(_settings: Settings, *, ttl_seconds: float = 5.0) -> dict[str, object]:
        _ = ttl_seconds
        return {"ai_agents": {"conversation_retention_days": 0}}

    monkeypatch.setattr(retention, "_orm_initialized", lambda: True)
    monkeypatch.setattr(retention, "get_core_settings_value_cached", _core_settings)
    monkeypatch.setenv("DATABASE__ENABLED", "1")

    with pytest.raises(RuntimeError, match="conversation_retention_days"):
        await retention.ai_conversation_retention_cleanup({
            "settings": Settings(app_env="test", database={"enabled": True}),
            "conversation_repository": repository,
        })

    assert repository.calls == []
