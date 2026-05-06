from __future__ import annotations

from fastapi import Depends, Request

from src.core.entity_manager.manager import EntityManager
from src.core.exceptions import ServiceUnavailable
from src.core.i18n import t
from src.core.lifecycles.dispatcher import LifecycleDispatcher
from src.modules.projects.content.items.canonical_service import ProjectContentCanonicalItemsService
from src.modules.projects.content.items.read_service import ProjectContentCanonicalItemReadService
from src.modules.projects.content.items.repository import ProjectContentItemsRepository
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.http.service import get_project_context
from src.modules.tenancy.router_helpers import resolve_project_tenant_context


def _get_lifecycle_dispatcher(request: Request) -> LifecycleDispatcher:
    dispatcher = getattr(request.app.state, "lifecycle_dispatcher", None)
    if dispatcher is None:
        raise ServiceUnavailable(
            message=t("settings:LIFECYCLE_DISPATCHER_UNAVAILABLE"),
            error="LIFECYCLE_DISPATCHER_UNAVAILABLE",
        )
    return dispatcher


def get_project_content_canonical_items_service(
    request: Request,
    ctx: ProjectRequestContext = Depends(get_project_context),
) -> ProjectContentCanonicalItemsService:
    lifecycle = _get_lifecycle_dispatcher(request)
    repo = ProjectContentItemsRepository(
        resolve_project_tenant_context(project_id=ctx.project_id, runtime_id=ctx.runtime_id)
    )
    entity_manager = EntityManager(
        items_repo=repo,
        lifecycle=lifecycle,
    )
    return ProjectContentCanonicalItemsService(
        repo=repo,
        entity_manager=entity_manager,
        organization_id=ctx.organization_id,
    )


def get_project_content_canonical_item_reads(
    ctx: ProjectRequestContext = Depends(get_project_context),
) -> ProjectContentCanonicalItemReadService:
    return ProjectContentCanonicalItemReadService(
        repo=ProjectContentItemsRepository(
            resolve_project_tenant_context(project_id=ctx.project_id, runtime_id=ctx.runtime_id)
        )
    )
