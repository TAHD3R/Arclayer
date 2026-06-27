from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest

from src.config import Settings
from src.modules.projects.agents.repository import ExpiredAgentRunCheckpoint
from src.platform.jobs import ai_agent_checkpoint_retention as retention


class FakeAgentCheckpointRetentionRepository:
    def __init__(self, batches: list[list[ExpiredAgentRunCheckpoint]]) -> None:
        self._batches = batches
        self.calls: list[tuple[datetime, int]] = []
        self.deleted_run_ids: list[UUID] = []
        self.events: list[tuple[str, object]] = []

    async def list_expired_terminal_checkpoints(
        self,
        *,
        cutoff: datetime,
        batch_size: int,
    ) -> list[ExpiredAgentRunCheckpoint]:
        self.calls.append((cutoff, batch_size))
        return self._batches.pop(0) if self._batches else []

    async def delete_runs(self, *, run_ids: list[UUID]) -> int:
        self.events.append(("delete_runs", tuple(str(run_id) for run_id in run_ids)))
        self.deleted_run_ids.extend(run_ids)
        return len(run_ids)


class FakeAgentCheckpointSaver:
    def __init__(self, events: list[tuple[str, object]], fail_on_thread_id: str | None = None) -> None:
        self._events = events
        self._fail_on_thread_id = fail_on_thread_id

    async def adelete_thread(self, thread_id: str) -> None:
        self._events.append(("delete_checkpoint", thread_id))
        if thread_id == self._fail_on_thread_id:
            raise RuntimeError(f"checkpoint deletion failed for {thread_id}")


class FakeAgentCheckpointContext:
    def __init__(self, saver: FakeAgentCheckpointSaver, events: list[tuple[str, object]]) -> None:
        self._saver = saver
        self._events = events

    async def __aenter__(self) -> FakeAgentCheckpointSaver:
        self._events.append(("enter_checkpointer", None))
        return self._saver

    async def __aexit__(self, exc_type: object, exc: object, tb: object) -> None:
        self._events.append(("exit_checkpointer", exc_type is not None))


class FakeAgentCheckpointFactory:
    def __init__(self, events: list[tuple[str, object]], fail_on_thread_id: str | None = None) -> None:
        self._events = events
        self._fail_on_thread_id = fail_on_thread_id

    def __call__(self) -> FakeAgentCheckpointContext:
        return FakeAgentCheckpointContext(
            FakeAgentCheckpointSaver(self._events, fail_on_thread_id=self._fail_on_thread_id),
            self._events,
        )


def _expired_checkpoint(thread_id: str) -> ExpiredAgentRunCheckpoint:
    return ExpiredAgentRunCheckpoint(run_id=uuid4(), thread_id=thread_id)


def _settings() -> Settings:
    return Settings(app_env="test", database={"enabled": True})


def _database_ready(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(retention, "_orm_initialized", lambda: True)
    monkeypatch.setenv("DATABASE__ENABLED", "1")


@pytest.mark.asyncio
async def test_ai_agent_checkpoint_retention_cleanup_deletes_expired_checkpoints_then_runs(monkeypatch) -> None:
    released = False
    first = _expired_checkpoint("agent-run:first")
    second = _expired_checkpoint("agent-run:second")
    repository = FakeAgentCheckpointRetentionRepository([[first, second], []])

    async def _core_settings(_settings: Settings, *, ttl_seconds: float = 5.0) -> dict[str, object]:
        _ = ttl_seconds
        return {"langgraph": {"enabled": True, "checkpointer": "database", "checkpoint_ttl_days": 90}}

    async def _acquire() -> bool:
        return True

    async def _release() -> None:
        nonlocal released
        released = True

    _database_ready(monkeypatch)
    monkeypatch.setattr(retention, "_try_acquire_lock", _acquire)
    monkeypatch.setattr(retention, "_release_lock", _release)
    monkeypatch.setattr(retention, "get_core_settings_value_cached", _core_settings)

    await retention.ai_agent_checkpoint_retention_cleanup({
        "settings": _settings(),
        "agent_run_repository": repository,
        "checkpointer_factory": FakeAgentCheckpointFactory(repository.events),
    })

    assert released is True
    assert [batch_size for _, batch_size in repository.calls] == [500, 500]
    cutoff = repository.calls[0][0]
    assert datetime.now(UTC) - timedelta(days=91) < cutoff < datetime.now(UTC) - timedelta(days=89)
    assert repository.deleted_run_ids == [first.run_id, second.run_id]
    assert repository.events == [
        ("enter_checkpointer", None),
        ("delete_checkpoint", "agent-run:first"),
        ("delete_checkpoint", "agent-run:second"),
        ("delete_runs", (str(first.run_id), str(second.run_id))),
        ("exit_checkpointer", False),
    ]


@pytest.mark.asyncio
async def test_ai_agent_checkpoint_retention_cleanup_stops_at_delete_cap(monkeypatch) -> None:
    repository = FakeAgentCheckpointRetentionRepository([
        [_expired_checkpoint(f"agent-run:{batch}:{index}") for index in range(500)] for batch in range(20)
    ])

    async def _core_settings(_settings: Settings, *, ttl_seconds: float = 5.0) -> dict[str, object]:
        _ = ttl_seconds
        return {"langgraph": {"enabled": True, "checkpointer": "database", "checkpoint_ttl_days": 7}}

    async def _acquire() -> bool:
        return True

    async def _release() -> None:
        return None

    _database_ready(monkeypatch)
    monkeypatch.setattr(retention, "_try_acquire_lock", _acquire)
    monkeypatch.setattr(retention, "_release_lock", _release)
    monkeypatch.setattr(retention, "get_core_settings_value_cached", _core_settings)

    await retention.ai_agent_checkpoint_retention_cleanup({
        "settings": _settings(),
        "agent_run_repository": repository,
        "checkpointer_factory": FakeAgentCheckpointFactory(repository.events),
    })

    assert len(repository.calls) == 10
    assert [batch_size for _, batch_size in repository.calls] == [500] * 10
    assert len(repository.deleted_run_ids) == 5_000


@pytest.mark.asyncio
async def test_ai_agent_checkpoint_retention_cleanup_skips_when_langgraph_disabled(monkeypatch) -> None:
    repository = FakeAgentCheckpointRetentionRepository([[_expired_checkpoint("agent-run:first")]])

    async def _core_settings(_settings: Settings, *, ttl_seconds: float = 5.0) -> dict[str, object]:
        _ = ttl_seconds
        return {"langgraph": {"enabled": False, "checkpointer": "database", "checkpoint_ttl_days": 90}}

    async def _acquire() -> bool:
        raise AssertionError("disabled LangGraph cleanup must not acquire the retention lock")

    _database_ready(monkeypatch)
    monkeypatch.setattr(retention, "_try_acquire_lock", _acquire)
    monkeypatch.setattr(retention, "get_core_settings_value_cached", _core_settings)

    await retention.ai_agent_checkpoint_retention_cleanup({
        "settings": _settings(),
        "agent_run_repository": repository,
        "checkpointer_factory": FakeAgentCheckpointFactory(repository.events),
    })

    assert repository.calls == []
    assert repository.deleted_run_ids == []


@pytest.mark.asyncio
async def test_ai_agent_checkpoint_retention_cleanup_rejects_invalid_ttl(monkeypatch) -> None:
    repository = FakeAgentCheckpointRetentionRepository([[_expired_checkpoint("agent-run:first")]])

    async def _core_settings(_settings: Settings, *, ttl_seconds: float = 5.0) -> dict[str, object]:
        _ = ttl_seconds
        return {"langgraph": {"enabled": True, "checkpointer": "database", "checkpoint_ttl_days": 0}}

    _database_ready(monkeypatch)
    monkeypatch.setattr(retention, "get_core_settings_value_cached", _core_settings)

    with pytest.raises(RuntimeError, match="checkpoint_ttl_days"):
        await retention.ai_agent_checkpoint_retention_cleanup({
            "settings": _settings(),
            "agent_run_repository": repository,
            "checkpointer_factory": FakeAgentCheckpointFactory(repository.events),
        })

    assert repository.calls == []
    assert repository.deleted_run_ids == []


@pytest.mark.asyncio
async def test_ai_agent_checkpoint_retention_cleanup_releases_lock_when_checkpoint_delete_fails(monkeypatch) -> None:
    released = False
    failed = _expired_checkpoint("agent-run:failed")
    repository = FakeAgentCheckpointRetentionRepository([[failed]])

    async def _core_settings(_settings: Settings, *, ttl_seconds: float = 5.0) -> dict[str, object]:
        _ = ttl_seconds
        return {"langgraph": {"enabled": True, "checkpointer": "database", "checkpoint_ttl_days": 90}}

    async def _acquire() -> bool:
        return True

    async def _release() -> None:
        nonlocal released
        released = True

    _database_ready(monkeypatch)
    monkeypatch.setattr(retention, "_try_acquire_lock", _acquire)
    monkeypatch.setattr(retention, "_release_lock", _release)
    monkeypatch.setattr(retention, "get_core_settings_value_cached", _core_settings)

    with pytest.raises(RuntimeError, match="checkpoint deletion failed"):
        await retention.ai_agent_checkpoint_retention_cleanup({
            "settings": _settings(),
            "agent_run_repository": repository,
            "checkpointer_factory": FakeAgentCheckpointFactory(
                repository.events,
                fail_on_thread_id="agent-run:failed",
            ),
        })

    assert released is True
    assert repository.deleted_run_ids == []
    assert ("delete_runs", (str(failed.run_id),)) not in repository.events
