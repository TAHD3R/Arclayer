from __future__ import annotations

import asyncio
from uuid import UUID

from fastapi import APIRouter, Depends

from apps.api.config import Settings, get_settings
from apps.api.core.http.pagination import PageData, PageParams, get_page_params, paginate_items
from apps.api.core.http.response import Response, ResponseModel
from apps.api.core.i18n import get_current_locale
from apps.api.core.logging import get_logger
from apps.api.modules.auth.deps import get_current_user_id
from apps.api.modules.system.models.rbac import PermissionScope
from apps.api.modules.workspaces.authz.deps import require_workspace_permission
from apps.api.modules.workspaces.deps import WorkspaceContext, require_workspace_manage_access
from apps.api.modules.workspaces.rbac.schema import (
    PermissionRoleSetRequest,
    RoleCreateFromTemplateRequest,
    RolePermissionSetRequest,
    RoleUpdateRequest,
    WorkspacePermissionOut,
    WorkspaceRBACMatrixOut,
    WorkspaceRBACMatrixPermissionRowOut,
    WorkspaceRoleOut,
)
from apps.api.modules.workspaces.rbac.service import WorkspaceRBACService

router = APIRouter(prefix="/workspaces/{workspace_id}/rbac", tags=["Workspace RBAC"])
logger = get_logger(__name__)
_FATAL_RBAC_EVENT_ERRORS: tuple[type[BaseException], ...] = (
    asyncio.CancelledError,
    GeneratorExit,
    KeyboardInterrupt,
    SystemExit,
)


def _raise_if_fatal(exc: BaseException) -> None:
    if isinstance(exc, _FATAL_RBAC_EVENT_ERRORS):
        raise exc


async def _publish_rbac_event(*, event_name: str, payload: dict[str, str | list[str] | None], actor_user_id: UUID) -> None:
    try:
        from asgi_correlation_id import correlation_id

        from apps.api.plugin.event_bus import Event
        from apps.api.plugin.host import host as plugin_host

        await plugin_host.event_bus.publish(
            Event(
                name=event_name,
                payload=payload,
                source="api",
                trace_id=correlation_id.get(None),
                actor_user_id=str(actor_user_id),
            )
        )
    except BaseException as exc:
        _raise_if_fatal(exc)
        logger.warning(
            "Workspace RBAC event publish failed",
            action="publish_workspace_rbac_event",
            event_name=event_name,
            workspace_id=str(payload.get("workspace_id") or ""),
            actor_user_id=str(actor_user_id),
            error=str(exc),
        )


def get_rbac_service(settings: Settings = Depends(get_settings)) -> WorkspaceRBACService:
    return WorkspaceRBACService(settings)


@router.get(
    "/roles",
    response_model=ResponseModel[PageData[WorkspaceRoleOut]],
    summary="List roles in current workspace",
    dependencies=[require_workspace_permission("team:members:read")],
)
async def list_roles(
    params: PageParams = Depends(get_page_params),
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    service: WorkspaceRBACService = Depends(get_rbac_service),
) -> ResponseModel[PageData[WorkspaceRoleOut]]:
    # Role counts are typically small; do in-memory pagination so we can localize deterministically.
    roles = await service.repo.list_roles(workspace_id=ctx.workspace_id)
    locale = get_current_locale()
    items = [WorkspaceRoleOut.model_validate(service.localize_role(r, locale=locale)) for r in roles]
    page = paginate_items(items, params=params)
    return Response.success(data=page)


@router.get(
    "/permissions",
    response_model=ResponseModel[PageData[WorkspacePermissionOut]],
    summary="List permissions (workspace scope)",
    dependencies=[require_workspace_permission("rbac:permissions:read")],
)
async def list_permissions(
    params: PageParams = Depends(get_page_params),
    _ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    service: WorkspaceRBACService = Depends(get_rbac_service),
) -> ResponseModel[PageData[WorkspacePermissionOut]]:
    perms = await service.repo.list_permissions(scope=PermissionScope.WORKSPACE)
    plugin_ids = {str(p.plugin_id) for p in perms if p.plugin_id and str(p.plugin_id) != "core"}
    plugin_names = await service.get_plugin_name_map(plugin_ids=plugin_ids)
    items: list[WorkspacePermissionOut] = []
    for p in perms:
        lp = service.localize_permission(p)
        pid = lp.get("plugin_id")
        items.append(
            WorkspacePermissionOut(
                id=UUID(str(lp["id"])),
                code=str(lp["code"]),
                name=str(lp["name"]),
                description=lp.get("description"),
                plugin_id=pid,
                plugin_name=plugin_names.get(str(pid)) if pid else None,
            )
        )
    page = paginate_items(items, params=params)
    return Response.success(data=page)


@router.get(
    "/matrix",
    response_model=ResponseModel[WorkspaceRBACMatrixOut],
    summary="Get RBAC permission matrix for current workspace",
    dependencies=[require_workspace_permission("rbac:roles:read")],
)
async def get_matrix(
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    service: WorkspaceRBACService = Depends(get_rbac_service),
) -> ResponseModel[WorkspaceRBACMatrixOut]:
    payload = await service.get_matrix(workspace_id=ctx.workspace_id)
    roles = payload.roles
    permissions = payload.permissions
    grants = payload.grants

    # Localize outputs.
    locale = get_current_locale()
    localized_roles = [WorkspaceRoleOut.model_validate(service.localize_role(r, locale=locale)) for r in roles]
    plugin_ids = {str(p.plugin_id) for p in permissions if p.plugin_id and str(p.plugin_id) != "core"}
    plugin_names = await service.get_plugin_name_map(plugin_ids=plugin_ids)
    localized_perm_rows: list[WorkspaceRBACMatrixPermissionRowOut] = []
    for p in permissions:
        lp = service.localize_permission(p)
        granted = grants.get(p.code, [])
        pid = lp.get("plugin_id")
        localized_perm_rows.append(
            WorkspaceRBACMatrixPermissionRowOut(
                code=p.code,
                name=lp["name"],
                description=lp["description"],
                plugin_id=lp["plugin_id"],
                plugin_name=plugin_names.get(str(pid)) if pid else None,
                granted_role_codes=granted,
            )
        )

    return Response.success(data=WorkspaceRBACMatrixOut(roles=localized_roles, permissions=localized_perm_rows))


@router.post(
    "/roles",
    response_model=ResponseModel[WorkspaceRoleOut],
    summary="Create a custom role from template",
    dependencies=[require_workspace_permission("rbac:roles:write")],
)
async def create_role(
    body: RoleCreateFromTemplateRequest,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user_id=Depends(get_current_user_id),
    service: WorkspaceRBACService = Depends(get_rbac_service),
) -> ResponseModel[WorkspaceRoleOut]:
    locale = get_current_locale()
    role = await service.create_custom_role(
        workspace_id=ctx.workspace_id,
        code=body.code,
        name=str(body.name or "").strip(),
        description=body.description,
        template_role_code=body.template_role_code,
    )
    await _publish_rbac_event(
        event_name="rbac.role.created",
        payload={"workspace_id": str(ctx.workspace_id), "role_code": role.code, "role_id": str(role.id)},
        actor_user_id=user_id,
    )
    return Response.success(data=WorkspaceRoleOut.model_validate(service.localize_role(role, locale=locale)))


@router.patch(
    "/roles/{role_code}",
    response_model=ResponseModel[WorkspaceRoleOut],
    summary="Update a custom role",
    dependencies=[require_workspace_permission("rbac:roles:write")],
)
async def update_role(
    role_code: str,
    body: RoleUpdateRequest,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user_id=Depends(get_current_user_id),
    service: WorkspaceRBACService = Depends(get_rbac_service),
) -> ResponseModel[WorkspaceRoleOut]:
    locale = get_current_locale()
    role = await service.update_custom_role(
        workspace_id=ctx.workspace_id,
        role_code=role_code,
        name=body.name,
        description=body.description,
    )
    await _publish_rbac_event(
        event_name="rbac.role.updated",
        payload={"workspace_id": str(ctx.workspace_id), "role_code": role.code, "role_id": str(role.id)},
        actor_user_id=user_id,
    )
    return Response.success(data=WorkspaceRoleOut.model_validate(service.localize_role(role, locale=locale)))


@router.delete(
    "/roles/{role_code}",
    response_model=ResponseModel[None],
    summary="Delete a custom role (auto-unbind from members)",
    dependencies=[require_workspace_permission("rbac:roles:write")],
)
async def delete_role(
    role_code: str,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user_id=Depends(get_current_user_id),
    service: WorkspaceRBACService = Depends(get_rbac_service),
) -> ResponseModel[None]:
    await service.delete_custom_role(workspace_id=ctx.workspace_id, role_code=role_code)
    await _publish_rbac_event(
        event_name="rbac.role.deleted",
        payload={"workspace_id": str(ctx.workspace_id), "role_code": str(role_code)},
        actor_user_id=user_id,
    )
    return Response.success()


@router.put(
    "/permissions/{permission_code}/roles",
    response_model=ResponseModel[None],
    summary="Set custom roles that can perform a permission (system roles are immutable)",
    dependencies=[require_workspace_permission("rbac:roles:write")],
)
async def set_permission_roles(
    permission_code: str,
    body: PermissionRoleSetRequest,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user_id=Depends(get_current_user_id),
    service: WorkspaceRBACService = Depends(get_rbac_service),
) -> ResponseModel[None]:
    await service.set_permission_custom_roles(
        workspace_id=ctx.workspace_id,
        permission_code=permission_code,
        role_codes=body.role_codes,
    )
    await _publish_rbac_event(
        event_name="rbac.permission.roles_set",
        payload={
            "workspace_id": str(ctx.workspace_id),
            "permission_code": str(permission_code),
            "role_codes": sorted({str(x).strip() for x in (body.role_codes or []) if x and str(x).strip()}),
        },
        actor_user_id=user_id,
    )
    return Response.success()


@router.put(
    "/roles/{role_code}/permissions",
    response_model=ResponseModel[None],
    summary="Replace permissions granted to a custom role (system roles are immutable)",
    dependencies=[require_workspace_permission("rbac:roles:write")],
)
async def set_role_permissions(
    role_code: str,
    body: RolePermissionSetRequest,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user_id=Depends(get_current_user_id),
    service: WorkspaceRBACService = Depends(get_rbac_service),
) -> ResponseModel[None]:
    await service.set_custom_role_permissions(
        workspace_id=ctx.workspace_id,
        role_code=role_code,
        permission_codes=body.permission_codes,
    )
    await _publish_rbac_event(
        event_name="rbac.role.permissions_set",
        payload={
            "workspace_id": str(ctx.workspace_id),
            "role_code": str(role_code),
            "permission_codes": sorted({
                str(x).strip() for x in (body.permission_codes or []) if x and str(x).strip()
            }),
        },
        actor_user_id=user_id,
    )
    return Response.success()
