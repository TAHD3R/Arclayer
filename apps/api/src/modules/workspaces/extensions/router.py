from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Request

from src.core.exceptions import Conflict, NotFound, ServiceUnavailable
from src.core.extensions.manager import CoordinationError, ExtensionManager, ExtensionNotFoundError
from src.core.http.response import ApiResponse, ResponseModel
from src.core.i18n import t
from src.modules.workspaces.authz.http.service import require_workspace_permission
from src.modules.workspaces.extensions.schema import (
    WorkspaceExtensionActivationOut,
    WorkspaceExtensionListItemOut,
    WorkspaceExtensionProvidesOut,
)
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.http.service import require_workspace_manage_access

router = APIRouter(
    prefix="/workspaces/{workspace_id}/extensions",
    tags=["domain.workspaces.extensions"],
)


def _get_extension_manager(request: Request) -> ExtensionManager:
    manager = getattr(request.app.state, "extension_manager", None)
    if not isinstance(manager, ExtensionManager):
        raise ServiceUnavailable(
            message=t("errors", "EXTENSION_RUNTIME_UNAVAILABLE"),
            error="EXTENSION_RUNTIME_UNAVAILABLE",
        )
    return manager


def _provides_out(raw: Any) -> WorkspaceExtensionProvidesOut:
    return WorkspaceExtensionProvidesOut(
        services=list(raw.services),
        middlewares=list(raw.middlewares),
        providers=list(raw.providers),
        content_types=list(raw.content_types),
    )


def _extension_out(
    manager: ExtensionManager,
    extension_name: str,
    ctx: WorkspaceContext,
    revision: int,
) -> WorkspaceExtensionListItemOut:
    instance = manager.get_instance(extension_name)
    if instance is None:
        raise NotFound(message=t("errors", "EXTENSION_NOT_FOUND"), error="EXTENSION_NOT_FOUND")
    return WorkspaceExtensionListItemOut(
        name=instance.manifest.name,
        version=instance.manifest.version,
        package_state=instance.package.state,
        process_state=instance.process.state,
        active=instance.is_active(ctx.workspace_id),
        extension_revision=revision,
        provides=_provides_out(instance.manifest.provides),
    )


async def _current_workspace_revision(workspace_id: UUID) -> int:
    from src.models.workspaces.workspace import Workspace

    workspace = await Workspace.get_or_none(id=workspace_id)
    if workspace is None:
        raise NotFound(message=t("errors", "WORKSPACE_NOT_FOUND"), error="WORKSPACE_NOT_FOUND")
    return int(workspace.extension_revision)


@router.get(
    "",
    response_model=ResponseModel[list[WorkspaceExtensionListItemOut]],
    summary="List extensions available to a workspace",
    dependencies=[require_workspace_permission("system:settings:read")],
)
async def list_workspace_extensions(
    request: Request,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
) -> ResponseModel[list[WorkspaceExtensionListItemOut]]:
    manager = _get_extension_manager(request)
    revision = await _current_workspace_revision(ctx.workspace_id)
    data = [
        WorkspaceExtensionListItemOut(
            name=instance.manifest.name,
            version=instance.manifest.version,
            package_state=instance.package.state,
            process_state=instance.process.state,
            active=instance.is_active(ctx.workspace_id),
            extension_revision=revision,
            provides=_provides_out(instance.manifest.provides),
        )
        for instance in manager.list_instances()
    ]
    return ApiResponse.success(data=data)


@router.get(
    "/{extension_name}",
    response_model=ResponseModel[WorkspaceExtensionListItemOut],
    summary="Get workspace extension state",
    dependencies=[require_workspace_permission("system:settings:read")],
)
async def get_workspace_extension(
    extension_name: str,
    request: Request,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
) -> ResponseModel[WorkspaceExtensionListItemOut]:
    manager = _get_extension_manager(request)
    revision = await _current_workspace_revision(ctx.workspace_id)
    out = _extension_out(manager, extension_name, ctx, revision)
    return ApiResponse.success(data=out)


@router.put(
    "/{extension_name}/activation",
    response_model=ResponseModel[WorkspaceExtensionActivationOut],
    summary="Activate an extension for a workspace",
    dependencies=[require_workspace_permission("system:settings:manage")],
)
async def activate_workspace_extension(
    extension_name: str,
    request: Request,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
) -> ResponseModel[WorkspaceExtensionActivationOut]:
    manager = _get_extension_manager(request)
    try:
        revision = await manager.activate(extension_name, ctx.workspace_id)
    except ExtensionNotFoundError as exc:
        raise NotFound(message=t("errors", "EXTENSION_NOT_FOUND"), error="EXTENSION_NOT_FOUND") from exc
    except CoordinationError as exc:
        raise Conflict(
            message=t("errors", "EXTENSION_ACTIVATION_INVALID"),
            error="EXTENSION_ACTIVATION_INVALID",
        ) from exc

    return ApiResponse.success(
        data=WorkspaceExtensionActivationOut(
            name=extension_name,
            active=True,
            extension_revision=revision,
        )
    )


@router.delete(
    "/{extension_name}/activation",
    response_model=ResponseModel[WorkspaceExtensionActivationOut],
    summary="Deactivate an extension for a workspace",
    dependencies=[require_workspace_permission("system:settings:manage")],
)
async def deactivate_workspace_extension(
    extension_name: str,
    request: Request,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
) -> ResponseModel[WorkspaceExtensionActivationOut]:
    manager = _get_extension_manager(request)
    try:
        revision = await manager.deactivate(extension_name, ctx.workspace_id)
    except ExtensionNotFoundError as exc:
        raise NotFound(message=t("errors", "EXTENSION_NOT_FOUND"), error="EXTENSION_NOT_FOUND") from exc
    except CoordinationError as exc:
        raise Conflict(
            message=t("errors", "EXTENSION_ACTIVATION_INVALID"),
            error="EXTENSION_ACTIVATION_INVALID",
        ) from exc

    return ApiResponse.success(
        data=WorkspaceExtensionActivationOut(
            name=extension_name,
            active=False,
            extension_revision=revision,
        )
    )
