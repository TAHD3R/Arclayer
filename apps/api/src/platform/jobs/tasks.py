from __future__ import annotations

from uuid import UUID

from src.config import get_settings
from src.platform.jobs.ai_usage import aggregate_daily_usage
from src.platform.jobs.analytics_retention import analytics_audit_log_retention_cleanup
from src.platform.jobs.assets_thumbnails import ASSET_THUMBNAILS_JOB_NAME, generate_asset_thumbnails
from src.platform.jobs.scheduled_publish import check_scheduled_publishes, execute_scheduled_publish
from src.platform.jobs.taskiq_app import broker


@broker.task(task_name=ASSET_THUMBNAILS_JOB_NAME)
async def task_generate_asset_thumbnails(
    asset_id_raw: str,
    project_id_raw: str,
    tenant_payload: dict[str, object] | None = None,
) -> None:
    settings = get_settings()
    await generate_asset_thumbnails({"settings": settings}, asset_id_raw, project_id_raw, tenant_payload)


@broker.task(
    task_name="core:analytics:audit_log_retention_cleanup",
    schedule=[
        {
            # Daily retention cleanup (UTC).
            "cron": "30 3 * * *",
            "args": [],
            "kwargs": {},
        }
    ],
)
async def task_analytics_audit_log_retention_cleanup() -> None:
    settings = get_settings()
    await analytics_audit_log_retention_cleanup({"settings": settings})


@broker.task(
    task_name="ai:usage:aggregate_daily",
    schedule=[
        {
            # Daily AI usage aggregation (UTC).
            "cron": "5 0 * * *",
            "args": [],
            "kwargs": {},
        }
    ],
)
async def task_aggregate_ai_usage() -> None:
    settings = get_settings()
    await aggregate_daily_usage({"settings": settings})


@broker.task(
    task_name="content:scheduled_publish:check_due",
    schedule=[
        {
            "cron": "* * * * *",
            "args": [],
            "kwargs": {},
        }
    ],
)
async def task_check_scheduled_publishes() -> int:
    return await check_scheduled_publishes()


@broker.task(task_name="content:scheduled_publish:execute")
async def task_execute_scheduled_publish(release_id_raw: str) -> None:
    await execute_scheduled_publish(UUID(release_id_raw))
