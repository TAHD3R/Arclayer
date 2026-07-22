from __future__ import annotations

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest

from src.config import Settings
from src.platform.jobs import observability_retention as retention


class FakeHTTPMetricRetentionRepository:
    def __init__(self, expired_count: int) -> None:
        self.expired_ids = [uuid4() for _ in range(expired_count)]
        self.list_batch_sizes: list[int] = []
        self.deleted_ids: list[UUID] = []
        self.connections: list[object] = []

    async def list_expired_ids(self, *, conn, cutoff: datetime, batch_size: int) -> list[UUID]:
        assert cutoff.tzinfo is not None
        self.connections.append(conn)
        self.list_batch_sizes.append(batch_size)
        return self.expired_ids[:batch_size]

    async def delete_by_ids(self, *, conn, metric_ids: list[UUID]) -> int:
        self.connections.append(conn)
        assert self.expired_ids[: len(metric_ids)] == metric_ids
        self.deleted_ids.extend(metric_ids)
        self.expired_ids = self.expired_ids[len(metric_ids) :]
        return len(metric_ids)


class FailingHTTPMetricRetentionRepository(FakeHTTPMetricRetentionRepository):
    async def delete_by_ids(self, *, conn, metric_ids: list[UUID]) -> int:
        self.connections.append(conn)
        _ = metric_ids
        raise RuntimeError("forced observability retention failure")


def _settings(*, retention_enabled: bool = True) -> Settings:
    return Settings(
        app_env="test",
        database={"enabled": True},
        observability={
            "enabled": True,
            "retention_enabled": retention_enabled,
            "retention_days": 30,
            "max_query_days": 30,
            "retention_batch_size": 100,
            "retention_max_delete_per_run": 250,
        },
    )


def _install_transaction(monkeypatch: pytest.MonkeyPatch, *, acquired: bool) -> tuple[MagicMock, MagicMock]:
    monkeypatch.setenv("DATABASE__ENABLED", "1")
    monkeypatch.setattr(retention, "_orm_initialized", lambda: True)
    connection = MagicMock()
    connection.execute_query_dict = AsyncMock(return_value=[{"acquired": acquired}])
    transaction = MagicMock()
    transaction.__aenter__ = AsyncMock(return_value=connection)
    transaction.__aexit__ = AsyncMock(return_value=None)
    monkeypatch.setattr(retention, "in_transaction", lambda: transaction)
    return connection, transaction


@pytest.mark.asyncio
async def test_observability_retention_uses_lock_batches_and_delete_cap(monkeypatch) -> None:
    repository = FakeHTTPMetricRetentionRepository(expired_count=300)
    record_repository = FakeHTTPMetricRetentionRepository(expired_count=2)
    connection, transaction = _install_transaction(monkeypatch, acquired=True)

    await retention.observability_http_metrics_retention_cleanup({
        "settings": _settings(),
        "metric_repository": repository,
        "record_repository": record_repository,
    })

    assert repository.list_batch_sizes == [100, 100, 50]
    assert len(repository.deleted_ids) == 250
    assert len(repository.expired_ids) == 50
    assert len(record_repository.deleted_ids) == 2
    assert repository.connections
    assert all(conn is connection for conn in repository.connections)
    transaction.__aexit__.assert_awaited_once()


@pytest.mark.asyncio
async def test_observability_retention_skips_when_lock_is_held_elsewhere(monkeypatch) -> None:
    repository = FakeHTTPMetricRetentionRepository(expired_count=1)
    record_repository = FakeHTTPMetricRetentionRepository(expired_count=1)
    _, transaction = _install_transaction(monkeypatch, acquired=False)

    await retention.observability_http_metrics_retention_cleanup({
        "settings": _settings(),
        "metric_repository": repository,
        "record_repository": record_repository,
    })

    assert repository.list_batch_sizes == []
    assert repository.deleted_ids == []
    assert record_repository.deleted_ids == []
    transaction.__aexit__.assert_awaited_once()


@pytest.mark.asyncio
async def test_observability_retention_releases_lock_when_deletion_fails(monkeypatch) -> None:
    repository = FailingHTTPMetricRetentionRepository(expired_count=1)
    connection, transaction = _install_transaction(monkeypatch, acquired=True)

    with pytest.raises(RuntimeError, match="forced observability retention failure"):
        await retention.observability_http_metrics_retention_cleanup({
            "settings": _settings(),
            "metric_repository": repository,
            "record_repository": FakeHTTPMetricRetentionRepository(expired_count=0),
        })

    assert repository.connections == [connection, connection]
    transaction.__aexit__.assert_awaited_once()


@pytest.mark.asyncio
async def test_observability_retention_honors_independent_retention_switch(monkeypatch) -> None:
    repository = FakeHTTPMetricRetentionRepository(expired_count=1)
    transaction = MagicMock(side_effect=AssertionError("disabled retention must not open a transaction"))
    monkeypatch.setattr(retention, "in_transaction", transaction)

    await retention.observability_http_metrics_retention_cleanup({
        "settings": _settings(retention_enabled=False),
        "metric_repository": repository,
        "record_repository": FakeHTTPMetricRetentionRepository(expired_count=1),
    })

    transaction.assert_not_called()
    assert repository.list_batch_sizes == []


@pytest.mark.asyncio
async def test_observability_retention_lock_uses_dedicated_postgres_advisory_key(monkeypatch) -> None:
    connection = MagicMock()
    connection.execute_query_dict = AsyncMock(return_value=[{"acquired": True}])

    assert await retention._try_acquire_transaction_lock(connection) is True

    assert connection.execute_query_dict.await_args is not None
    sql = connection.execute_query_dict.await_args.args[0]
    assert "pg_try_advisory_xact_lock" in sql
    assert str(retention._RETENTION_LOCK_KEY) in sql
