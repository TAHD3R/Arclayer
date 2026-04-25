from __future__ import annotations

from src.config import get_settings
from src.platform.jobs.analytics_retention import analytics_audit_log_retention_cleanup
from src.platform.jobs.assets_thumbnails import ASSET_THUMBNAILS_JOB_NAME, generate_asset_thumbnails
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
