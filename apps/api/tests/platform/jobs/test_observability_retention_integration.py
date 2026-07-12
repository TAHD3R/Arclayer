from __future__ import annotations

import asyncio
from datetime import datetime
from uuid import UUID

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import get_settings
from src.platform.jobs.observability_retention import observability_http_metrics_retention_cleanup

pytestmark = pytest.mark.integration


class BlockingRetentionRepository:
    def __init__(self) -> None:
        self.first_query_started = asyncio.Event()
        self.release_first_query = asyncio.Event()
        self.connections: list[BaseDBAsyncClient] = []

    async def list_expired_ids(
        self,
        *,
        conn: BaseDBAsyncClient,
        cutoff: datetime,
        batch_size: int,
    ) -> list[UUID]:
        _ = cutoff
        _ = batch_size
        self.connections.append(conn)
        if len(self.connections) == 1:
            self.first_query_started.set()
            await self.release_first_query.wait()
        return []

    async def delete_by_ids(
        self,
        *,
        conn: BaseDBAsyncClient,
        metric_ids: list[UUID],
    ) -> int:
        _ = conn
        _ = metric_ids
        raise AssertionError("empty retention queries must not delete")


@pytest.mark.asyncio
async def test_postgres_transaction_lock_serializes_cleanup_and_releases_on_exit(db_schema) -> None:
    _ = db_schema
    repository = BlockingRetentionRepository()
    context = {"settings": get_settings(), "metric_repository": repository}

    first_cleanup = asyncio.create_task(observability_http_metrics_retention_cleanup(context))
    await asyncio.wait_for(repository.first_query_started.wait(), timeout=5)

    await observability_http_metrics_retention_cleanup(context)
    assert len(repository.connections) == 1

    repository.release_first_query.set()
    await asyncio.wait_for(first_cleanup, timeout=5)

    await observability_http_metrics_retention_cleanup(context)
    assert len(repository.connections) == 2
