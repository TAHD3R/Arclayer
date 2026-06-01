"""AI usage aggregation — daily rollup from ai_audit_log into ai_usage_daily.

R3 audit requirement:
    - Idempotent daily aggregation for billing and quota enforcement.
    - Postgres advisory lock prevents multi-worker duplication.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from tortoise import Tortoise

from src.config import Settings
from src.core.logging import get_logger

logger = get_logger(__name__)

# 64-bit Postgres advisory lock key (namespace: ai usage aggregation).
_AGGR_LOCK_KEY = 781_234_991_223_451_772


def _parse_execute_query_result(result: Any) -> list[Any] | None:
    """
    Tortoise's execute_query return shape depends on backend/version.

    We treat it as best-effort:
    - prefer the first list-like element as "rows"
    """
    if isinstance(result, tuple) and len(result) == 2:
        a, b = result
        if isinstance(a, list):
            return a
        if isinstance(b, list):
            return b
    if isinstance(result, list):
        return result
    return None


def _parse_single_bool(rows: list[Any] | None) -> bool:
    if not rows:
        return False
    first = rows[0]
    if isinstance(first, dict):
        if not first:
            return False
        return bool(next(iter(first.values())))
    if isinstance(first, (list, tuple)):
        if not first:
            return False
        return bool(first[0])
    return bool(first)


async def _try_acquire_lock() -> bool:
    if not Tortoise._inited:
        return False
    conn = Tortoise.get_connection("default")
    rows = _parse_execute_query_result(
        await conn.execute_query(f"SELECT pg_try_advisory_lock({_AGGR_LOCK_KEY})"),
    )
    return _parse_single_bool(rows)


async def _release_lock() -> None:
    if not Tortoise._inited:
        return
    conn = Tortoise.get_connection("default")
    try:
        await conn.execute_query(f"SELECT pg_advisory_unlock({_AGGR_LOCK_KEY})")
    except (RuntimeError, TypeError, ValueError):
        return


async def aggregate_daily_usage(ctx: dict[str, Any]) -> None:
    """
    Scheduled job: aggregate AI usage from ai_audit_log into ai_usage_daily.

    Groups by (workspace_id, date, source_type, provider, model) and upserts
    into the daily rollup table. Uses advisory lock to prevent duplicate work.
    Defaults to aggregating the previous UTC day.
    """
    settings: Settings | None = ctx.get("settings")
    if settings is None:
        logger.warning("Usage aggregation skipped (missing settings)")
        return

    if not settings.database.enabled:
        logger.info("Usage aggregation skipped (database disabled)")
        return

    if not Tortoise._inited:
        logger.warning("Usage aggregation skipped (ORM not initialized)")
        return

    acquired = await _try_acquire_lock()
    if not acquired:
        logger.info("Usage aggregation skipped (lock not acquired)")
        return

    started = datetime.now(UTC)
    yesterday = (datetime.now(UTC) - timedelta(days=1)).date()

    try:
        conn = Tortoise.get_connection("default")

        sql = """
            WITH source_data AS (
                SELECT
                    workspace_id,
                    (created_at AT TIME ZONE 'UTC')::date AS usage_date,
                    provider,
                    model,
                    COUNT(*)                               AS request_count,
                    SUM(prompt_tokens)                     AS prompt_tokens,
                    SUM(completion_tokens)                 AS completion_tokens,
                    SUM(cost_micros)                       AS cost_micros
                FROM ai_audit_log
                WHERE created_at >= $1::date
                  AND created_at <  $1::date + INTERVAL '1 day'
                GROUP BY
                    workspace_id,
                    (created_at AT TIME ZONE 'UTC')::date,
                    provider,
                    model
            )
            INSERT INTO ai_usage_daily
                (id, workspace_id, date, source_type, provider, model,
                 request_count, prompt_tokens, completion_tokens, cost_micros,
                 created_at, updated_at)
            SELECT
                gen_random_uuid(),
                workspace_id,
                usage_date,
                'workspace',
                provider,
                model,
                request_count,
                prompt_tokens,
                completion_tokens,
                cost_micros,
                NOW(),
                NOW()
            FROM source_data
            ON CONFLICT (workspace_id, date, source_type, provider, model)
            DO UPDATE SET
                request_count      = EXCLUDED.request_count,
                prompt_tokens      = EXCLUDED.prompt_tokens,
                completion_tokens  = EXCLUDED.completion_tokens,
                cost_micros        = EXCLUDED.cost_micros,
                updated_at         = NOW()
        """

        await conn.execute_query(sql, [yesterday.isoformat()])

        elapsed_ms = int((datetime.now(UTC) - started).total_seconds() * 1000)
        logger.info(
            "Usage aggregation completed",
            target_date=yesterday.isoformat(),
            elapsed_ms=elapsed_ms,
        )
    finally:
        await _release_lock()
