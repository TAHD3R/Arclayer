from __future__ import annotations

import asyncio
from typing import Annotated
from uuid import UUID

from asgi_correlation_id import correlation_id
from fastapi import APIRouter, Body, Depends, Request, status

from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.events import Event, events
from src.core.http.response import ApiResponse, ResponseModel
from src.core.logging import get_logger
from src.modules.auth.http.service import get_current_user_id
from src.modules.projects.facade.service import ProjectFacadeService
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.http.service import get_project_context
from src.modules.sites.schema import SitePreviewTokenCreateIn, SitePreviewTokenOut
from src.modules.sites.service import SiteService
from src.modules.workspaces.api_keys.router import _publish_api_key_event
from src.modules.workspaces.api_keys.schema import (
    ApiKeyCreateOut,
    ApiKeyListOut,
    ApiKeyOut,
    WorkspaceApiKeyCreateIn,
)
from src.modules.workspaces.api_keys.service import WorkspaceApiKeysService
from src.modules.workspaces.authz.http.service import ensure_workspace_permission_granted
from src.modules.workspaces.authz.schema import AuthzSnapshot
from src.modules.workspaces.authz.snapshot.service import get_workspace_authz_snapshot
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.publish.preview_service import WorkspacePublishPreviewService
from src.modules.workspaces.publish.schema import PublishExportContractOut, PublishImpactOut
from src.modules.workspaces.publish.service import WorkspacePublishService
from src.modules.workspaces.releases.router import _publish_release_event
from src.modules.workspaces.releases.schema import (
    ReleaseDryRunOut,
    ReleaseListOut,
    ReleaseOut,
    ReleasePublishOut,
    ReleaseRollbackOut,
)
from src.modules.workspaces.releases.service import WorkspaceReleasesService
from src.modules.workspaces.settings.schema import WorkspaceSettingsDetail, WorkspaceSettingsPatch
from src.modules.workspaces.settings.service import WorkspaceSettingsService
from src.modules.workspaces.site.schema import WorkspaceSiteOut
from src.platform.cache.valkey import get_valkey

router = APIRouter(prefix="/projects/{project_id}", tags=["domain.projects.facade"])
logger = get_logger(__name__)
_FATAL_PROJECT_EVENT_ERRORS = (asyncio.CancelledError, GeneratorExit, KeyboardInterrupt, SystemExit)


def _raise_if_fatal(exc: BaseException) -> None:
    if isinstance(exc, _FATAL_PROJECT_EVENT_ERRORS):
        raise exc


def get_project_facade_service(settings: Settings = Depends(get_settings)) -> ProjectFacadeService:
    return ProjectFacadeService(settings)


def get_project_api_keys_service(settings: Settings = Depends(get_settings)) -> WorkspaceApiKeysService:
    return WorkspaceApiKeysService(settings)


def get_project_settings_service(settings: Settings = Depends(get_settings)) -> WorkspaceSettingsService:
    return WorkspaceSettingsService(settings)


def get_project_releases_service() -> WorkspaceReleasesService:
    return WorkspaceReleasesService()


def get_project_publish_service() -> WorkspacePublishService:
    return WorkspacePublishService()


def get_project_publish_preview_service() -> WorkspacePublishPreviewService:
    return WorkspacePublishPreviewService()


def get_project_site_service(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> SiteService:
    try:
        valkey = get_valkey(request)
    except RuntimeError:
        valkey = None
    return SiteService(settings, valkey=valkey)


def _workspace_context_for_project_event(
    *,
    ctx: ProjectRequestContext,
    workspace_id: UUID,
) -> WorkspaceContext:
    return WorkspaceContext(
        workspace_id=workspace_id,
        organization_id=ctx.organization_id,
        workspace_kind=ctx.workspace_kind,
        access_type=ctx.access_type,
        org_membership_id=ctx.org_membership_id,
        is_org_owner=ctx.is_org_owner,
        workspace_membership_id=ctx.workspace_membership_id,
        visible_only=ctx.visible_only,
        is_creator_admin=ctx.is_creator_admin,
    )


def require_project_workspace_permission(permission: str):
    async def _dep(
        ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
        user_id: Annotated[UUID, Depends(get_current_user_id)],
    ) -> None:
        await ensure_workspace_permission_granted(
            permission,
            user_id=user_id,
            ctx=_workspace_context_for_project_event(ctx=ctx, workspace_id=ctx.workspace_id),
        )

    return Depends(_dep)


@router.get(
    "/me/authz",
    response_model=ResponseModel[AuthzSnapshot],
    summary="Get project-scoped authz snapshot for current user",
)
async def get_project_authz_snapshot(
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
) -> ResponseModel[AuthzSnapshot]:
    snapshot = await get_workspace_authz_snapshot(user_id=user_id, workspace_id=ctx.workspace_id)
    return ApiResponse.success(data=snapshot)


@router.get(
    "/settings/core",
    response_model=ResponseModel[WorkspaceSettingsDetail],
    summary="Get project core settings",
)
async def get_project_core_settings(
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[WorkspaceSettingsService, Depends(get_project_settings_service)],
) -> ResponseModel[WorkspaceSettingsDetail]:
    await ensure_workspace_permission_granted(
        "system:settings:read",
        user_id=user_id,
        ctx=_workspace_context_for_project_event(ctx=ctx, workspace_id=ctx.workspace_id),
    )
    detail = await service.get_core_detail(workspace_id=ctx.workspace_id)
    return ApiResponse.success(data=detail)


@router.patch(
    "/settings/core",
    response_model=ResponseModel[WorkspaceSettingsDetail],
    summary="Patch project core settings",
)
async def patch_project_core_settings(
    payload: WorkspaceSettingsPatch,
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[WorkspaceSettingsService, Depends(get_project_settings_service)],
) -> ResponseModel[WorkspaceSettingsDetail]:
    await ensure_workspace_permission_granted(
        "system:settings:manage",
        user_id=user_id,
        ctx=_workspace_context_for_project_event(ctx=ctx, workspace_id=ctx.workspace_id),
    )
    detail = await service.patch_core(
        workspace_id=ctx.workspace_id,
        patch=payload.patch or {},
        updated_by=user_id,
    )
    return ApiResponse.success(data=detail)


@router.get(
    "/site",
    response_model=ResponseModel[WorkspaceSiteOut],
    response_model_exclude_none=True,
    summary="Get project site bridge",
)
async def get_project_site(
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[ProjectFacadeService, Depends(get_project_facade_service)],
) -> ResponseModel[WorkspaceSiteOut]:
    facade = await service.get_context(project_id=ctx.project_id, actor_user_id=actor_user_id)
    out = WorkspaceSiteOut.model_validate({
        "siteId": facade.site_id,
        "workspaceId": facade.workspace_id,
        "slug": facade.site_slug,
        "name": facade.runtime_name,
        "defaultLocale": facade.default_locale,
        "fallbackLocale": facade.fallback_locale,
        "isActive": facade.is_active,
    })
    return ApiResponse.success(data=out)


@router.post(
    "/site/preview-tokens",
    response_model=ResponseModel[SitePreviewTokenOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Issue a preview token for a project site",
)
async def create_project_site_preview_token(
    payload: Annotated[SitePreviewTokenCreateIn, Body(description="Preview token request.")],
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    facade_service: Annotated[ProjectFacadeService, Depends(get_project_facade_service)],
    site_service: Annotated[SiteService, Depends(get_project_site_service)],
) -> ResponseModel[SitePreviewTokenOut]:
    facade = await facade_service.get_context(project_id=ctx.project_id, actor_user_id=actor_user_id)
    data = await site_service.create_preview_token(site_id=facade.site_id, ttl_seconds=payload.ttl_seconds)
    try:
        await events.publish_and_wait(
            Event(
                name="workspace.preview_token.created",
                payload={
                    "entity_id": str(facade.site_id),
                    "entity_type": "preview_token",
                    "expires_at_ms": data.expires_at_ms,
                    "organization_id": str(ctx.organization_id),
                    "project_id": str(ctx.project_id),
                    "site_id": str(facade.site_id),
                    "ttl_seconds": payload.ttl_seconds,
                    "workspace_id": str(facade.workspace_id),
                },
                source="api",
                trace_id=correlation_id.get(None),
                actor_user_id=str(actor_user_id),
            ),
            timeout=1.0,
        )
    except BaseException as exc:
        _raise_if_fatal(exc)
        logger.warning(
            "Project preview token event publish failed",
            actor_user_id=str(actor_user_id),
            event_name="workspace.preview_token.created",
            project_id=str(ctx.project_id),
            site_id=str(facade.site_id),
            error=str(exc),
        )
    return ApiResponse.success(data=data)


@router.get(
    "/api-keys",
    response_model=ResponseModel[ApiKeyListOut],
    summary="List project service and delivery API keys",
)
async def list_project_api_keys(
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    service: Annotated[WorkspaceApiKeysService, Depends(get_project_api_keys_service)],
) -> ResponseModel[ApiKeyListOut]:
    data = await service.list_workspace_keys_out(workspace_id=ctx.workspace_id)
    return ApiResponse.success(data=data)


@router.post(
    "/api-keys",
    response_model=ResponseModel[ApiKeyCreateOut],
    summary="Create a project service or delivery API key",
)
async def create_project_api_key(
    payload: WorkspaceApiKeyCreateIn,
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    facade_service: Annotated[ProjectFacadeService, Depends(get_project_facade_service)],
    service: Annotated[WorkspaceApiKeysService, Depends(get_project_api_keys_service)],
) -> ResponseModel[ApiKeyCreateOut]:
    facade = await facade_service.get_context(project_id=ctx.project_id, actor_user_id=actor_user_id)
    data = await service.create_workspace_key_out(
        workspace_id=facade.workspace_id,
        site_id=facade.site_id,
        actor_user_id=actor_user_id,
        payload=payload,
    )
    await _publish_api_key_event(
        actor_user_id=actor_user_id,
        event_name="project.api_key.created",
        key=data.key,
        ctx=_workspace_context_for_project_event(ctx=ctx, workspace_id=facade.workspace_id),
    )
    return ApiResponse.success(data=data)


@router.get(
    "/api-keys/{key_id}",
    response_model=ResponseModel[ApiKeyOut],
    summary="Get a project service or delivery API key",
)
async def get_project_api_key(
    key_id: PublicUUID,
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    service: Annotated[WorkspaceApiKeysService, Depends(get_project_api_keys_service)],
) -> ResponseModel[ApiKeyOut]:
    data = await service.get_workspace_key_out(workspace_id=ctx.workspace_id, key_id=key_id)
    return ApiResponse.success(data=data)


@router.post(
    "/api-keys/{key_id}/revoke",
    response_model=ResponseModel[ApiKeyOut],
    summary="Revoke a project service or delivery API key",
)
async def revoke_project_api_key(
    key_id: PublicUUID,
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[WorkspaceApiKeysService, Depends(get_project_api_keys_service)],
) -> ResponseModel[ApiKeyOut]:
    data = await service.revoke_workspace_key_out(workspace_id=ctx.workspace_id, key_id=key_id)
    await _publish_api_key_event(
        actor_user_id=actor_user_id,
        event_name="project.api_key.revoked",
        key=data,
        ctx=_workspace_context_for_project_event(ctx=ctx, workspace_id=ctx.workspace_id),
    )
    return ApiResponse.success(data=data)


@router.post(
    "/api-keys/{key_id}/rotate",
    response_model=ResponseModel[ApiKeyCreateOut],
    summary="Rotate a project service or delivery API key",
)
async def rotate_project_api_key(
    key_id: PublicUUID,
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[WorkspaceApiKeysService, Depends(get_project_api_keys_service)],
) -> ResponseModel[ApiKeyCreateOut]:
    data = await service.rotate_workspace_key_out(workspace_id=ctx.workspace_id, key_id=key_id)
    await _publish_api_key_event(
        actor_user_id=actor_user_id,
        event_name="project.api_key.rotated",
        key=data.key,
        ctx=_workspace_context_for_project_event(ctx=ctx, workspace_id=ctx.workspace_id),
    )
    return ApiResponse.success(data=data)


@router.get(
    "/releases",
    response_model=ResponseModel[ReleaseListOut],
    response_model_exclude_none=True,
    summary="List project releases",
    dependencies=[require_project_workspace_permission("system:content:read")],
)
async def list_project_releases(
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    facade_service: Annotated[ProjectFacadeService, Depends(get_project_facade_service)],
    service: Annotated[WorkspaceReleasesService, Depends(get_project_releases_service)],
) -> ResponseModel[ReleaseListOut]:
    facade = await facade_service.get_context(project_id=ctx.project_id, actor_user_id=actor_user_id)
    data = await service.list_releases_out(workspace_id=facade.workspace_id, site_id=facade.site_id)
    return ApiResponse.success(data=data)


@router.get(
    "/releases/dry-run",
    response_model=ResponseModel[ReleaseDryRunOut],
    response_model_exclude_none=True,
    summary="Preview project release readiness and diagnostics",
    dependencies=[require_project_workspace_permission("system:content:read")],
)
async def get_project_release_dry_run(
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    facade_service: Annotated[ProjectFacadeService, Depends(get_project_facade_service)],
    service: Annotated[WorkspaceReleasesService, Depends(get_project_releases_service)],
) -> ResponseModel[ReleaseDryRunOut]:
    facade = await facade_service.get_context(project_id=ctx.project_id, actor_user_id=actor_user_id)
    data = await service.get_release_dry_run_out(workspace_id=facade.workspace_id, site_id=facade.site_id)
    return ApiResponse.success(data=data)


@router.get(
    "/releases/{release_id}",
    response_model=ResponseModel[ReleaseOut],
    response_model_exclude_none=True,
    summary="Get project release",
    dependencies=[require_project_workspace_permission("system:content:read")],
)
async def get_project_release(
    release_id: PublicUUID,
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    facade_service: Annotated[ProjectFacadeService, Depends(get_project_facade_service)],
    service: Annotated[WorkspaceReleasesService, Depends(get_project_releases_service)],
) -> ResponseModel[ReleaseOut]:
    facade = await facade_service.get_context(project_id=ctx.project_id, actor_user_id=actor_user_id)
    data = await service.get_release_out(
        workspace_id=facade.workspace_id,
        site_id=facade.site_id,
        release_id=release_id,
    )
    return ApiResponse.success(data=data)


@router.post(
    "/releases/publish",
    response_model=ResponseModel[ReleasePublishOut],
    response_model_exclude_none=True,
    summary="Publish a new project release",
    dependencies=[require_project_workspace_permission("system:content:publish")],
)
async def publish_project_release(
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    facade_service: Annotated[ProjectFacadeService, Depends(get_project_facade_service)],
    service: Annotated[WorkspaceReleasesService, Depends(get_project_releases_service)],
) -> ResponseModel[ReleasePublishOut]:
    facade = await facade_service.get_context(project_id=ctx.project_id, actor_user_id=actor_user_id)
    data = await service.publish_release_out(
        workspace_id=facade.workspace_id,
        site_id=facade.site_id,
        actor_user_id=actor_user_id,
    )
    await _publish_release_event(
        actor_user_id=actor_user_id,
        ctx=_workspace_context_for_project_event(ctx=ctx, workspace_id=facade.workspace_id),
        event_name="project.release.published",
        payload=data.release,
        project_id=ctx.project_id,
    )
    return ApiResponse.success(data=data)


@router.post(
    "/releases/{release_id}/rollback",
    response_model=ResponseModel[ReleaseRollbackOut],
    response_model_exclude_none=True,
    summary="Rollback a project release",
    dependencies=[require_project_workspace_permission("system:content:publish")],
)
async def rollback_project_release(
    release_id: PublicUUID,
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    facade_service: Annotated[ProjectFacadeService, Depends(get_project_facade_service)],
    service: Annotated[WorkspaceReleasesService, Depends(get_project_releases_service)],
) -> ResponseModel[ReleaseRollbackOut]:
    facade = await facade_service.get_context(project_id=ctx.project_id, actor_user_id=actor_user_id)
    data = await service.rollback_release_out(
        workspace_id=facade.workspace_id,
        site_id=facade.site_id,
        release_id=release_id,
    )
    await _publish_release_event(
        actor_user_id=actor_user_id,
        ctx=_workspace_context_for_project_event(ctx=ctx, workspace_id=facade.workspace_id),
        event_name="project.release.rolled_back",
        payload=data.release,
        project_id=ctx.project_id,
        previous_active_release_id=(
            str(data.previous_active_release_id) if data.previous_active_release_id is not None else None
        ),
    )
    return ApiResponse.success(data=data)


@router.get(
    "/publish/impact",
    response_model=ResponseModel[PublishImpactOut],
    response_model_exclude_none=True,
    summary="Preview project publish impact",
    dependencies=[require_project_workspace_permission("system:content:read")],
)
async def get_project_publish_impact(
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    facade_service: Annotated[ProjectFacadeService, Depends(get_project_facade_service)],
    service: Annotated[WorkspacePublishService, Depends(get_project_publish_service)],
) -> ResponseModel[PublishImpactOut]:
    facade = await facade_service.get_context(project_id=ctx.project_id, actor_user_id=actor_user_id)
    data = await service.preview_impact(workspace_id=facade.workspace_id, site_id=facade.site_id)
    return ApiResponse.success(data=data)


@router.get(
    "/publish/preview-contract",
    response_model=ResponseModel[PublishExportContractOut],
    response_model_exclude_none=True,
    summary="Read preview contract from project publish artifacts",
    dependencies=[require_project_workspace_permission("system:content:read")],
)
async def get_project_publish_preview_contract(
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    facade_service: Annotated[ProjectFacadeService, Depends(get_project_facade_service)],
    service: Annotated[WorkspacePublishPreviewService, Depends(get_project_publish_preview_service)],
) -> ResponseModel[PublishExportContractOut]:
    facade = await facade_service.get_context(project_id=ctx.project_id, actor_user_id=actor_user_id)
    data = await service.build_preview_contract(workspace_id=facade.workspace_id, site_id=facade.site_id)
    return ApiResponse.success(data=data)
