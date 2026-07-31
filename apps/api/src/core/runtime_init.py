from __future__ import annotations

import asyncio
from typing import Any

from fastapi import FastAPI

from src.common.email.service import EmailService
from src.config import Settings
from src.core.events import EventBus
from src.core.lifecycles.dispatcher import LifecycleDispatcher
from src.core.lifecycles.specs import LifecycleAction
from src.core.lifecycles.subscribers.timestamps import auto_timestamps
from src.core.lifecycles.subscribers.validators import require_target_context
from src.core.logging import get_logger
from src.modules.ai.agent_catalog_service import AgentCatalogService
from src.modules.analytics.connector_runtime import AnalyticsConnectorRuntime
from src.modules.analytics.ingest.service import ActivityIngestor
from src.modules.jobs.registry import get_job_type_registry
from src.modules.observability.http_metrics import HTTP_REQUEST_METRIC_EVENT, persist_http_request_metric_event
from src.modules.projects.automation.runtime import AutomationRuntime
from src.modules.projects.permissions.service import get_project_action_catalog
from src.modules.projects.webhooks.service import WebhookService
from src.modules.sites.search.runtime import register_content_search_runtime
from src.modules.system.admin.notifications.event_runtime import NotificationEventRuntime
from src.modules.system.admin.notifications.repository import NotificationRepository
from src.modules.system.agents.definition_service import SUPPORTED_TOOL_GRANTS
from src.modules.system.rbac.service import RBACService
from src.modules.workspaces.permissions import get_permission_action_registry
from src.modules.workspaces.rbac.service import build_workspace_rbac_service
from src.modules.workspaces.skills.official_catalog_repository import OfficialSkillCatalogRepository
from src.modules.workspaces.skills.official_catalog_source import PackagedOfficialSkillCatalogSource
from src.modules.workspaces.skills.official_catalog_sync import OfficialSkillCatalogSyncService

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
    job_type_registry = get_job_type_registry(settings)
    job_type_registry.validate_permission_actions(
        workspace_actions=get_permission_action_registry().keys(),
        project_actions=get_project_action_catalog().keys(),
    )
    app.state.job_type_registry = job_type_registry

    ingestor = ActivityIngestor(settings)
    app.state.activity_ingestor = ingestor
    try:
        await ingestor.start(event_bus=event_bus)
    except BaseException as exc:
        _raise_if_fatal(exc)
        logger.warning("Activity ingestor init failed (ignored)", action="init_activity_ingestor", error=str(exc))

    if not settings.database.enabled:
        return

    if settings.observability.enabled:
        await event_bus.subscribe(
            subscriber_id="core.observability.http",
            event_name=HTTP_REQUEST_METRIC_EVENT,
            handler=persist_http_request_metric_event,
            priority=-50,
            name="http-request-metric-writer",
        )

    extension_manager = getattr(app.state, "extension_manager", None)
    connector_registry = extension_manager.registry.connectors if extension_manager is not None else None
    notification_event_runtime = NotificationEventRuntime(
        settings,
        audience_reader=NotificationRepository(),
        email_sender=EmailService(settings, connector_registry=connector_registry),
    )
    app.state.notification_event_runtime = notification_event_runtime
    await notification_event_runtime.start(event_bus=event_bus)

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
    await OfficialSkillCatalogSyncService(
        repository=OfficialSkillCatalogRepository(),
        source=PackagedOfficialSkillCatalogSource(),
        supported_tool_ids=frozenset(SUPPORTED_TOOL_GRANTS),
        settings=settings,
    ).sync()
    await build_workspace_rbac_service(settings).ensure_all_workspaces_ready()
    await AgentCatalogService(settings).ensure_all_workspaces_ready()

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
    app.state.webhook_service = webhook_service


async def init_analytics_connector_runtime(app: FastAPI, *, event_bus: EventBus) -> None:
    extension_manager = getattr(app.state, "extension_manager", None)
    if extension_manager is None:
        return
    runtime = AnalyticsConnectorRuntime(extension_manager.registry.connectors)
    app.state.analytics_connector_runtime = runtime
    await runtime.start(event_bus=event_bus)


async def close_domain_runtime(app: FastAPI, *, event_bus: EventBus) -> None:
    await event_bus.unsubscribe(
        subscriber_id="core.observability.http",
        event_name=HTTP_REQUEST_METRIC_EVENT,
        handler=persist_http_request_metric_event,
    )
    ingestor: ActivityIngestor | None = getattr(app.state, "activity_ingestor", None)
    if ingestor is not None:
        try:
            await ingestor.stop(event_bus=event_bus)
        except BaseException as exc:
            _raise_if_fatal(exc)
            logger.warning(
                "Activity ingestor shutdown failed (ignored)", action="close_activity_ingestor", error=str(exc)
            )

    notification_event_runtime: NotificationEventRuntime | None = getattr(app.state, "notification_event_runtime", None)
    if notification_event_runtime is not None:
        await notification_event_runtime.stop(event_bus=event_bus)

    analytics_connector_runtime: AnalyticsConnectorRuntime | None = getattr(
        app.state,
        "analytics_connector_runtime",
        None,
    )
    if analytics_connector_runtime is not None:
        await analytics_connector_runtime.stop()

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
