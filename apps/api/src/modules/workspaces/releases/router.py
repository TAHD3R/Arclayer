from __future__ import annotations

import asyncio
from typing import Annotated
from uuid import UUID

from asgi_correlation_id import correlation_id
from fastapi import APIRouter, Depends

from src.common.types.public_uuid import PublicUUID
from src.core.events import Event, events
from src.core.http.response import ApiResponse, ResponseModel
from src.core.logging import get_logger
from src.modules.auth.http.service import get_current_user_id
from src.modules.workspaces.authz.http.service import require_workspace_permission
from src.modules.workspaces.content.shared.router import _resolve_site_id
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.http.service import require_workspace_manage_access
from src.modules.workspaces.releases.schema import ReleaseListOut, ReleaseOut, ReleasePublishOut, ReleaseRollbackOut
from src.modules.workspaces.releases.service import WorkspaceReleasesService

router = APIRouter(
    prefix="/workspaces/{workspace_id}/releases",
    tags=["domain.workspaces.releases"],
    dependencies=[require_workspace_permission("system:content:read")],
)

logger = get_logger(__name__)
_FATAL_EVENT_ERRORS = (asyncio.CancelledError, GeneratorExit, KeyboardInterrupt, SystemExit)


def _raise_if_fatal(exc: BaseException) -> None:
    if isinstance(exc, _FATAL_EVENT_ERRORS):
        raise exc


async def _publish_release_event(
    *,
    actor_user_id: UUID,
    ctx: WorkspaceContext,
    event_name: str,
    payload: ReleaseOut,
    previous_active_release_id: str | None = None,
) -> None:
    event_payload: dict[str, object | None] = {
        "entity_id": str(payload.id),
        "entity_type": "release",
        "is_active": payload.is_active,
        "organization_id": str(ctx.organization_id),
        "previous_active_release_id": (
            str(previous_active_release_id) if previous_active_release_id is not None else None
        ),
        "release_number": payload.release_number,
        "site_id": str(payload.site_id),
        "workspace_id": str(ctx.workspace_id),
    }
    try:
        await events.publish_and_wait(
            Event(
                name=event_name,
                payload=event_payload,
                source="api",
                trace_id=correlation_id.get(None),
                actor_user_id=str(actor_user_id),
            ),
            timeout=1.0,
        )
    except BaseException as exc:
        _raise_if_fatal(exc)
        logger.warning(
            "Release event publish failed",
            actor_user_id=str(actor_user_id),
            event_name=event_name,
            release_id=payload.id,
            error=str(exc),
        )


def get_workspace_releases_service() -> WorkspaceReleasesService:
    return WorkspaceReleasesService()


@router.get(
    "",
    response_model=ResponseModel[ReleaseListOut],
    response_model_exclude_none=True,
    summary="List workspace releases",
)
async def list_workspace_releases(
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[WorkspaceReleasesService, Depends(get_workspace_releases_service)],
) -> ResponseModel[ReleaseListOut]:
    data = await service.list_releases_out(workspace_id=ctx.workspace_id, site_id=site_id)
    return ApiResponse.success(data=data)


@router.get(
    "/{release_id}",
    response_model=ResponseModel[ReleaseOut],
    response_model_exclude_none=True,
    summary="Get workspace release",
)
async def get_workspace_release(
    release_id: PublicUUID,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[WorkspaceReleasesService, Depends(get_workspace_releases_service)],
) -> ResponseModel[ReleaseOut]:
    data = await service.get_release_out(workspace_id=ctx.workspace_id, site_id=site_id, release_id=release_id)
    return ApiResponse.success(data=data)


@router.post(
    "/publish",
    response_model=ResponseModel[ReleasePublishOut],
    response_model_exclude_none=True,
    summary="Publish a new workspace release",
    dependencies=[require_workspace_permission("system:content:publish")],
)
async def publish_workspace_release(
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[WorkspaceReleasesService, Depends(get_workspace_releases_service)],
) -> ResponseModel[ReleasePublishOut]:
    data = await service.publish_release_out(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        actor_user_id=actor_user_id,
    )
    await _publish_release_event(
        actor_user_id=actor_user_id,
        ctx=ctx,
        event_name="workspace.release.published",
        payload=data.release,
    )
    return ApiResponse.success(data=data)


@router.post(
    "/{release_id}/rollback",
    response_model=ResponseModel[ReleaseRollbackOut],
    response_model_exclude_none=True,
    summary="Rollback workspace to a historical release",
    dependencies=[require_workspace_permission("system:content:publish")],
)
async def rollback_workspace_release(
    release_id: PublicUUID,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[WorkspaceReleasesService, Depends(get_workspace_releases_service)],
) -> ResponseModel[ReleaseRollbackOut]:
    data = await service.rollback_release_out(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        release_id=release_id,
    )
    await _publish_release_event(
        actor_user_id=actor_user_id,
        ctx=ctx,
        event_name="workspace.release.rolled_back",
        payload=data.release,
        previous_active_release_id=(
            str(data.previous_active_release_id) if data.previous_active_release_id is not None else None
        ),
    )
    return ApiResponse.success(data=data)
