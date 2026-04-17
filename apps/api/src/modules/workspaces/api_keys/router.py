from __future__ import annotations

import asyncio
from typing import Annotated, cast
from uuid import UUID

from asgi_correlation_id import correlation_id
from fastapi import APIRouter, Depends

from src.common.protocols.tortoise import HasOrganizationId
from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.events import Event, events
from src.core.http.response import ApiResponse, ResponseModel
from src.core.logging import get_logger
from src.models.organization.org_membership import OrgMembership
from src.modules.auth.http.service import get_current_user_id
from src.modules.organization.http.service import get_current_org_membership
from src.modules.workspaces.api_keys.schema import (
    ApiKeyCreateOut,
    ApiKeyListOut,
    ApiKeyOut,
    PersonalApiKeyCreateIn,
    WorkspaceApiKeyCreateIn,
)
from src.modules.workspaces.api_keys.service import WorkspaceApiKeysService
from src.modules.workspaces.authz.http.service import require_workspace_permission
from src.modules.workspaces.content.shared.router import _resolve_site_id
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.http.service import require_workspace_manage_access

me_api_keys_router = APIRouter(prefix="/me/api-keys", tags=["domain.me.api_keys"])
workspace_api_keys_router = APIRouter(
    prefix="/workspaces/{workspace_id}/api-keys",
    tags=["domain.workspaces.api_keys"],
)

logger = get_logger(__name__)
_FATAL_EVENT_ERRORS = (asyncio.CancelledError, GeneratorExit, KeyboardInterrupt, SystemExit)


def _raise_if_fatal(exc: BaseException) -> None:
    if isinstance(exc, _FATAL_EVENT_ERRORS):
        raise exc


async def _publish_api_key_event(
    *,
    actor_user_id: UUID,
    event_name: str,
    key: ApiKeyOut,
    ctx: WorkspaceContext | None = None,
    organization_id: UUID | None = None,
) -> None:
    payload: dict[str, object | None] = {
        "delivery_perspective": str(key.delivery_perspective) if key.delivery_perspective is not None else None,
        "entity_id": str(key.id),
        "entity_type": "api_key",
        "key_family": str(key.family),
        "key_name": key.name,
        "scopes": [str(scope) for scope in key.scopes],
        "site_id": str(key.site_id) if key.site_id is not None else None,
        "workspace_id": str(key.workspace_id) if key.workspace_id is not None else None,
    }
    if organization_id is not None:
        payload["organization_id"] = str(organization_id)
    if ctx is not None:
        payload["organization_id"] = str(ctx.organization_id)
        payload["workspace_id"] = str(ctx.workspace_id)

    try:
        await events.publish_and_wait(
            Event(
                name=event_name,
                payload=payload,
                source="api",
                trace_id=correlation_id.get(None),
                actor_user_id=str(actor_user_id),
            ),
            timeout=1.0,
        )
    except BaseException as exc:
        _raise_if_fatal(exc)
        logger.warning(
            "API key event publish failed",
            actor_user_id=str(actor_user_id),
            event_name=event_name,
            key_id=key.id,
            error=str(exc),
        )


def get_api_keys_service(settings: Settings = Depends(get_settings)) -> WorkspaceApiKeysService:
    return WorkspaceApiKeysService(settings)


@me_api_keys_router.get(
    "",
    response_model=ResponseModel[ApiKeyListOut],
    summary="List personal management API keys",
)
async def list_personal_api_keys(
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[WorkspaceApiKeysService, Depends(get_api_keys_service)],
) -> ResponseModel[ApiKeyListOut]:
    data = await service.list_personal_keys_out(owner_user_id=user_id)
    return ApiResponse.success(data=data)


@me_api_keys_router.post(
    "",
    response_model=ResponseModel[ApiKeyCreateOut],
    summary="Create a personal management API key",
)
async def create_personal_api_key(
    payload: PersonalApiKeyCreateIn,
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    orgm: Annotated[OrgMembership, Depends(get_current_org_membership)],
    service: Annotated[WorkspaceApiKeysService, Depends(get_api_keys_service)],
) -> ResponseModel[ApiKeyCreateOut]:
    data = await service.create_personal_key_out(owner_user_id=user_id, payload=payload)
    await _publish_api_key_event(
        actor_user_id=user_id,
        event_name="me.api_key.created",
        key=data.key,
        organization_id=UUID(str(cast(HasOrganizationId, orgm).organization_id)),
    )
    return ApiResponse.success(data=data)


@me_api_keys_router.get(
    "/{key_id}",
    response_model=ResponseModel[ApiKeyOut],
    summary="Get a personal management API key",
)
async def get_personal_api_key(
    key_id: PublicUUID,
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[WorkspaceApiKeysService, Depends(get_api_keys_service)],
) -> ResponseModel[ApiKeyOut]:
    data = await service.get_personal_key_out(owner_user_id=user_id, key_id=key_id)
    return ApiResponse.success(data=data)


@me_api_keys_router.post(
    "/{key_id}/revoke",
    response_model=ResponseModel[ApiKeyOut],
    summary="Revoke a personal management API key",
)
async def revoke_personal_api_key(
    key_id: PublicUUID,
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    orgm: Annotated[OrgMembership, Depends(get_current_org_membership)],
    service: Annotated[WorkspaceApiKeysService, Depends(get_api_keys_service)],
) -> ResponseModel[ApiKeyOut]:
    data = await service.revoke_personal_key_out(owner_user_id=user_id, key_id=key_id)
    await _publish_api_key_event(
        actor_user_id=user_id,
        event_name="me.api_key.revoked",
        key=data,
        organization_id=UUID(str(cast(HasOrganizationId, orgm).organization_id)),
    )
    return ApiResponse.success(data=data)


@me_api_keys_router.post(
    "/{key_id}/rotate",
    response_model=ResponseModel[ApiKeyCreateOut],
    summary="Rotate a personal management API key",
)
async def rotate_personal_api_key(
    key_id: PublicUUID,
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    orgm: Annotated[OrgMembership, Depends(get_current_org_membership)],
    service: Annotated[WorkspaceApiKeysService, Depends(get_api_keys_service)],
) -> ResponseModel[ApiKeyCreateOut]:
    data = await service.rotate_personal_key_out(owner_user_id=user_id, key_id=key_id)
    await _publish_api_key_event(
        actor_user_id=user_id,
        event_name="me.api_key.rotated",
        key=data.key,
        organization_id=UUID(str(cast(HasOrganizationId, orgm).organization_id)),
    )
    return ApiResponse.success(data=data)


@workspace_api_keys_router.get(
    "",
    response_model=ResponseModel[ApiKeyListOut],
    summary="List workspace service and delivery API keys",
    dependencies=[require_workspace_permission("system:keys:read")],
)
async def list_workspace_api_keys(
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[WorkspaceApiKeysService, Depends(get_api_keys_service)],
) -> ResponseModel[ApiKeyListOut]:
    data = await service.list_workspace_keys_out(workspace_id=ctx.workspace_id)
    return ApiResponse.success(data=data)


@workspace_api_keys_router.post(
    "",
    response_model=ResponseModel[ApiKeyCreateOut],
    summary="Create a workspace service or delivery API key",
    dependencies=[require_workspace_permission("system:keys:manage")],
)
async def create_workspace_api_key(
    payload: WorkspaceApiKeyCreateIn,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[WorkspaceApiKeysService, Depends(get_api_keys_service)],
) -> ResponseModel[ApiKeyCreateOut]:
    data = await service.create_workspace_key_out(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        actor_user_id=user_id,
        payload=payload,
    )
    await _publish_api_key_event(
        actor_user_id=user_id,
        event_name="workspace.api_key.created",
        key=data.key,
        ctx=ctx,
    )
    return ApiResponse.success(data=data)


@workspace_api_keys_router.get(
    "/{key_id}",
    response_model=ResponseModel[ApiKeyOut],
    summary="Get a workspace service or delivery API key",
    dependencies=[require_workspace_permission("system:keys:read")],
)
async def get_workspace_api_key(
    key_id: PublicUUID,
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[WorkspaceApiKeysService, Depends(get_api_keys_service)],
) -> ResponseModel[ApiKeyOut]:
    data = await service.get_workspace_key_out(workspace_id=ctx.workspace_id, key_id=key_id)
    return ApiResponse.success(data=data)


@workspace_api_keys_router.post(
    "/{key_id}/revoke",
    response_model=ResponseModel[ApiKeyOut],
    summary="Revoke a workspace service or delivery API key",
    dependencies=[require_workspace_permission("system:keys:manage")],
)
async def revoke_workspace_api_key(
    key_id: PublicUUID,
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[WorkspaceApiKeysService, Depends(get_api_keys_service)],
) -> ResponseModel[ApiKeyOut]:
    data = await service.revoke_workspace_key_out(workspace_id=ctx.workspace_id, key_id=key_id)
    await _publish_api_key_event(
        actor_user_id=user_id,
        event_name="workspace.api_key.revoked",
        key=data,
        ctx=ctx,
    )
    return ApiResponse.success(data=data)


@workspace_api_keys_router.post(
    "/{key_id}/rotate",
    response_model=ResponseModel[ApiKeyCreateOut],
    summary="Rotate a workspace service or delivery API key",
    dependencies=[require_workspace_permission("system:keys:manage")],
)
async def rotate_workspace_api_key(
    key_id: PublicUUID,
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[WorkspaceApiKeysService, Depends(get_api_keys_service)],
) -> ResponseModel[ApiKeyCreateOut]:
    data = await service.rotate_workspace_key_out(workspace_id=ctx.workspace_id, key_id=key_id)
    await _publish_api_key_event(
        actor_user_id=user_id,
        event_name="workspace.api_key.rotated",
        key=data.key,
        ctx=ctx,
    )
    return ApiResponse.success(data=data)
