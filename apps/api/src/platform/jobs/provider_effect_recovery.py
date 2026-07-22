from __future__ import annotations

from collections.abc import Coroutine
from typing import Any, Final, cast

from taskiq import AsyncBroker
from taskiq.decor import AsyncTaskiqDecoratedTask

from src.common.types.json_types import JsonObject
from src.config import Settings
from src.modules.assets.jobs import (
    ASSET_THUMBNAIL_PROVIDER_EFFECT_SCHEMA_VERSION,
    ASSET_THUMBNAIL_PROVIDER_EFFECT_TYPE,
)
from src.modules.jobs.provider_effect_recovery_service import (
    ProviderEffectRecoveryEnqueueService,
)

PROVIDER_EFFECT_RECOVERY_SCAN_TASK_NAME: Final = "jobs:maintenance:provider-effect-orphan-scan:v1"
PROVIDER_EFFECT_RECOVERY_SCAN_SCHEDULE_ID: Final = "provider-effect-orphan-scan-v1"


def register_provider_effect_recovery_scan(
    *,
    broker: AsyncBroker,
    settings: Settings,
) -> AsyncTaskiqDecoratedTask[[], Coroutine[Any, Any, JsonObject]]:
    """Register the scheduler control task that only fans out durable recovery Jobs."""

    async def scan_provider_effect_orphans() -> JsonObject:
        batch = await ProviderEffectRecoveryEnqueueService(
            settings,
            contracts=(
                (
                    ASSET_THUMBNAIL_PROVIDER_EFFECT_TYPE,
                    ASSET_THUMBNAIL_PROVIDER_EFFECT_SCHEMA_VERSION,
                ),
            ),
        ).enqueue_due(limit=settings.background_jobs.provider_effect_recovery.scan_batch_size)
        return cast(JsonObject, batch.model_dump(mode="json", by_alias=True))

    return broker.register_task(
        scan_provider_effect_orphans,
        task_name=PROVIDER_EFFECT_RECOVERY_SCAN_TASK_NAME,
        schedule=[
            {
                "interval": settings.background_jobs.provider_effect_recovery.scan_interval_seconds,
                "schedule_id": PROVIDER_EFFECT_RECOVERY_SCAN_SCHEDULE_ID,
            }
        ],
    )
