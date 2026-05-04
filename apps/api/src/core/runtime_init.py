from __future__ import annotations

import asyncio
from typing import Any
from uuid import UUID

from fastapi import FastAPI

from src.common.constants.assets import ASSET_UPLOADED_EVENT
from src.config import Settings
from src.core.events import Event, EventBus
from src.core.lifecycles.dispatcher import LifecycleDispatcher
from src.core.lifecycles.specs import LifecycleAction
from src.core.lifecycles.subscribers.audit import audit_lifecycle_events
from src.core.lifecycles.subscribers.timestamps import auto_timestamps
from src.core.lifecycles.subscribers.validators import require_target_context
from src.core.logging import get_logger
from src.modules.analytics.ingest.service import ActivityIngestor
from src.modules.projects.automation.runtime import AutomationRuntime
from src.modules.projects.webhooks.service import WebhookService
from src.modules.sites.search.runtime import register_content_search_runtime
from src.modules.system.rbac.service import RBACService
from src.modules.workspaces.rbac.service import WorkspaceRBACService
from src.platform.jobs.assets_thumbnails import generate_asset_thumbnails
from src.platform.jobs.client import is_taskiq_enabled, try_dedupe_enqueue, try_enqueue_task
from src.platform.jobs.tasks import task_generate_asset_thumbnails

logger = get_logger(__name__)
_FATAL_RUNTIME_INIT_ERRORS: tuple[type[BaseException], ...] = (
    asyncio.CancelledError,
    GeneratorExit,
    KeyboardInterrupt,
    SystemExit,
)


def _raise_if_fatal(exc: BaseException) -> None:
    if isinstance(exc, _FATAL_RUNTIME_INIT_ERRORS):
        raise exc


async def init_domain_runtime(app: FastAPI, settings: Settings, *, event_bus: EventBus) -> None:
    ingestor = ActivityIngestor(settings)
    app.state.activity_ingestor = ingestor
    try:
        await ingestor.start(event_bus=event_bus)
    except BaseException as exc:
        _raise_if_fatal(exc)
        logger.warning("Activity ingestor init failed (ignored)", action="init_activity_ingestor", error=str(exc))

    async def _on_asset_uploaded(event: Event) -> None:
        try:
            raw_asset_id = (event.payload or {}).get("asset_id")
            raw_project_id = (event.payload or {}).get("project_id")
            if not raw_asset_id or not raw_project_id:
                return

            asset_id = UUID(str(raw_asset_id))
            project_id = UUID(str(raw_project_id))
            if settings.taskiq.enabled and is_taskiq_enabled(app):
                dedupe_ok = await try_dedupe_enqueue(
                    app,
                    dedupe_key=f"taskiq:dedupe:asset-thumbs:{asset_id}",
                    ttl_seconds=60 * 60,
                )
                if dedupe_ok:
                    enqueued = await try_enqueue_task(
                        task_generate_asset_thumbnails,
                        str(asset_id),
                        str(project_id),
                        (event.payload or {}).get("tenant"),
                    )
                    if enqueued:
                        return

            await generate_asset_thumbnails(
                {"settings": settings},
                str(asset_id),
                str(project_id),
                (event.payload or {}).get("tenant"),
            )
        except BaseException as exc:
            _raise_if_fatal(exc)
            logger.warning(
                "Core asset processor failed",
                action="process_asset_upload",
                error_event=ASSET_UPLOADED_EVENT,
                error=str(exc),
            )

    await event_bus.subscribe(
        subscriber_id="core",
        event_name=ASSET_UPLOADED_EVENT,
        handler=_on_asset_uploaded,
        priority=0,
        name="core:thumbnail-generator",
    )

    if not settings.database.enabled:
        return

    # ── Lifecycle + EntityManager + Webhook infrastructure ──────────────
    lifecycle_dispatcher = LifecycleDispatcher()
    await lifecycle_dispatcher.register(
        subscriber_id="core",
        action=LifecycleAction.BEFORE_CREATE,
        handler=auto_timestamps,
    )
    await lifecycle_dispatcher.register(
        subscriber_id="core",
        action=LifecycleAction.BEFORE_UPDATE,
        handler=auto_timestamps,
    )
    await lifecycle_dispatcher.register(
        subscriber_id="core",
        action=LifecycleAction.BEFORE_DELETE,
        handler=require_target_context,
    )
    await lifecycle_dispatcher.register(
        subscriber_id="core",
        action=LifecycleAction.BEFORE_PUBLISH,
        handler=require_target_context,
    )
    app.state.lifecycle_dispatcher = lifecycle_dispatcher
    await register_content_search_runtime(
        app,
        settings,
        event_bus=event_bus,
        lifecycle_dispatcher=lifecycle_dispatcher,
    )

    automation_runtime = AutomationRuntime(settings, lifecycle_dispatcher=lifecycle_dispatcher)
    app.state.automation_runtime = automation_runtime
    await automation_runtime.start(event_bus=event_bus)

    rbac = RBACService(settings)
    await rbac.sync_permission_catalog()
    await WorkspaceRBACService(settings).ensure_all_workspaces_ready()

    webhook_service = WebhookService(settings)
    await lifecycle_dispatcher.register(
        subscriber_id="webhooks",
        action=LifecycleAction.AFTER_CREATE,
        handler=webhook_service.handle_lifecycle_event,
    )
    await lifecycle_dispatcher.register(
        subscriber_id="webhooks",
        action=LifecycleAction.AFTER_UPDATE,
        handler=webhook_service.handle_lifecycle_event,
    )
    await lifecycle_dispatcher.register(
        subscriber_id="webhooks",
        action=LifecycleAction.AFTER_DELETE,
        handler=webhook_service.handle_lifecycle_event,
    )
    await lifecycle_dispatcher.register(
        subscriber_id="webhooks",
        action=LifecycleAction.AFTER_PUBLISH,
        handler=webhook_service.handle_lifecycle_event,
    )
    await lifecycle_dispatcher.register(
        subscriber_id="audit",
        action=LifecycleAction.AFTER_CREATE,
        handler=lambda evt: audit_lifecycle_events(evt, event_bus=event_bus),
    )
    await lifecycle_dispatcher.register(
        subscriber_id="audit",
        action=LifecycleAction.AFTER_UPDATE,
        handler=lambda evt: audit_lifecycle_events(evt, event_bus=event_bus),
    )
    await lifecycle_dispatcher.register(
        subscriber_id="audit",
        action=LifecycleAction.AFTER_DELETE,
        handler=lambda evt: audit_lifecycle_events(evt, event_bus=event_bus),
    )
    await lifecycle_dispatcher.register(
        subscriber_id="audit",
        action=LifecycleAction.AFTER_PUBLISH,
        handler=lambda evt: audit_lifecycle_events(evt, event_bus=event_bus),
    )

    app.state.webhook_service = webhook_service


async def close_domain_runtime(app: FastAPI, *, event_bus: EventBus) -> None:
    ingestor: ActivityIngestor | None = getattr(app.state, "activity_ingestor", None)
    if ingestor is not None:
        try:
            await ingestor.stop(event_bus=event_bus)
        except BaseException as exc:
            _raise_if_fatal(exc)
            logger.warning(
                "Activity ingestor shutdown failed (ignored)", action="close_activity_ingestor", error=str(exc)
            )

    webhook_service: Any | None = getattr(app.state, "webhook_service", None)
    if webhook_service is not None:
        try:
            await webhook_service.close()
        except BaseException as exc:
            _raise_if_fatal(exc)
            logger.warning("Webhook service shutdown failed", action="close_webhook_service", error=str(exc))

    automation_runtime: AutomationRuntime | None = getattr(app.state, "automation_runtime", None)
    if automation_runtime is None:
        return
    try:
        await automation_runtime.stop(event_bus=event_bus)
    except BaseException as exc:
        _raise_if_fatal(exc)
        logger.warning("Automation runtime shutdown failed", action="close_automation_runtime", error=str(exc))
