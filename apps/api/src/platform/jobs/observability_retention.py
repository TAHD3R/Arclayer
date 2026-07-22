from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any, Protocol, cast
from uuid import UUID

from tortoise import Tortoise
from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.transactions import in_transaction

from src.config import Settings
from src.core.logging import get_logger
from src.models.observability.http_request_metric import HTTPRequestMetricHourly, HTTPRequestRecord

logger = get_logger(__name__)

# Dedicated 64-bit Postgres advisory-lock namespace for HTTP-metric retention.
_RETENTION_LOCK_KEY = 781_234_991_223_451_772


class HTTPMetricRetentionRepository(Protocol):
    async def list_expired_ids(
        self,
        *,
        conn: BaseDBAsyncClient,
        cutoff: datetime,
        batch_size: int,
    ) -> list[UUID]: ...

    async def delete_by_ids(
        self,
        *,
        conn: BaseDBAsyncClient,
        metric_ids: list[UUID],
    ) -> int: ...


class TortoiseHTTPMetricRetentionRepository:
    async def list_expired_ids(
        self,
        *,
        conn: BaseDBAsyncClient,
        cutoff: datetime,
        batch_size: int,
    ) -> list[UUID]:
        ids = (
            await HTTPRequestMetricHourly
            .filter(bucket_start__lt=cutoff)
            .using_db(conn)
            .order_by("bucket_start", "id")
            .limit(batch_size)
            .values_list("id", flat=True)
        )
        return [UUID(str(metric_id)) for metric_id in ids]

    async def delete_by_ids(
        self,
        *,
        conn: BaseDBAsyncClient,
        metric_ids: list[UUID],
    ) -> int:
        return int(await HTTPRequestMetricHourly.filter(id__in=metric_ids).using_db(conn).delete())


class TortoiseHTTPRequestRecordRetentionRepository:
    async def list_expired_ids(
        self,
        *,
        conn: BaseDBAsyncClient,
        cutoff: datetime,
        batch_size: int,
    ) -> list[UUID]:
        ids = (
            await HTTPRequestRecord
            .filter(occurred_at__lt=cutoff)
            .using_db(conn)
            .order_by("occurred_at", "id")
            .limit(batch_size)
            .values_list("id", flat=True)
        )
        return [UUID(str(record_id)) for record_id in ids]

    async def delete_by_ids(
        self,
        *,
        conn: BaseDBAsyncClient,
        metric_ids: list[UUID],
    ) -> int:
        return int(await HTTPRequestRecord.filter(id__in=metric_ids).using_db(conn).delete())


async def _try_acquire_transaction_lock(conn: BaseDBAsyncClient) -> bool:
    rows = await conn.execute_query_dict(f"SELECT pg_try_advisory_xact_lock({_RETENTION_LOCK_KEY}) AS acquired")
    if not rows:
        raise RuntimeError("observability retention lock query returned no result")
    acquired = rows[0].get("acquired")
    if not isinstance(acquired, bool):
        raise RuntimeError("observability retention lock query returned a non-boolean result")
    return acquired


def _orm_initialized() -> bool:
    return bool(Tortoise._inited)


async def _delete_expired_metrics(
    *,
    conn: BaseDBAsyncClient,
    repository: HTTPMetricRetentionRepository,
    cutoff: datetime,
    batch_size: int,
    max_delete_per_run: int,
) -> int:
    deleted_total = 0
    while deleted_total < max_delete_per_run:
        remaining = max_delete_per_run - deleted_total
        current_batch_size = min(batch_size, remaining)
        ids = await repository.list_expired_ids(
            conn=conn,
            cutoff=cutoff,
            batch_size=current_batch_size,
        )
        if not ids:
            break
        deleted = await repository.delete_by_ids(conn=conn, metric_ids=ids)
        if deleted <= 0:
            raise RuntimeError("observability retention deletion made no progress")
        if deleted > len(ids):
            raise RuntimeError("observability retention deleted more rows than selected")
        deleted_total += deleted
        logger.info(
            "Observability retention batch deleted",
            deleted=deleted,
            deleted_total=deleted_total,
            cutoff=cutoff.isoformat(),
            batch_size=current_batch_size,
        )
    return deleted_total


async def observability_http_metrics_retention_cleanup(ctx: dict[str, Any]) -> None:
    """Delete expired HTTP request facts and aggregates in bounded, lock-protected batches."""

    settings = ctx.get("settings")
    if not isinstance(settings, Settings):
        raise RuntimeError("observability retention cleanup requires Settings")
    if (
        not settings.database.enabled
        or not settings.observability.enabled
        or not settings.observability.retention_enabled
    ):
        logger.info("Observability retention cleanup disabled")
        return
    if not _orm_initialized():
        raise RuntimeError("observability retention cleanup requires an initialized ORM")

    repository = cast(
        HTTPMetricRetentionRepository,
        ctx.get("metric_repository") or TortoiseHTTPMetricRetentionRepository(),
    )
    record_repository = cast(
        HTTPMetricRetentionRepository,
        ctx.get("record_repository") or TortoiseHTTPRequestRecordRetentionRepository(),
    )
    cutoff = datetime.now(UTC) - timedelta(days=settings.observability.retention_days)
    started = datetime.now(UTC)
    async with in_transaction() as conn:
        if not await _try_acquire_transaction_lock(conn):
            logger.info("Observability retention cleanup already running")
            return
        deleted_metrics = await _delete_expired_metrics(
            conn=conn,
            repository=repository,
            cutoff=cutoff,
            batch_size=settings.observability.retention_batch_size,
            max_delete_per_run=settings.observability.retention_max_delete_per_run,
        )
        deleted_records = await _delete_expired_metrics(
            conn=conn,
            repository=record_repository,
            cutoff=cutoff,
            batch_size=settings.observability.retention_batch_size,
            max_delete_per_run=settings.observability.retention_max_delete_per_run,
        )

    elapsed_ms = int((datetime.now(UTC) - started).total_seconds() * 1000)
    logger.info(
        "Observability retention cleanup completed",
        deleted_metrics=deleted_metrics,
        deleted_records=deleted_records,
        cutoff=cutoff.isoformat(),
        elapsed_ms=elapsed_ms,
    )
