from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends

from apps.api.config import Settings, get_settings
from apps.api.core.http.pagination import PageData, PageParams, get_page_params, paginate_items
from apps.api.core.http.response import Response, ResponseModel
from apps.api.core.i18n import get_current_locale, t
from apps.api.core.rbac.service import RBACService
from apps.api.core.workspace.authz import require_workspace_permission
from apps.api.core.workspace.deps import WorkspaceContext, require_workspace_manage_access
from apps.api.models.plugin import PluginRecord
from apps.api.models.rbac import PermissionScope
from apps.api.plugin.manifest import load_plugin_manifest
from apps.api.routers.v1.workspaces.rbac.schema import (
    PermissionRoleSetRequest,
    RoleCreateFromTemplateRequest,
    RoleUpdateRequest,
    WorkspacePermissionOut,
    WorkspaceRBACMatrixOut,
    WorkspaceRBACMatrixPermissionRowOut,
    WorkspaceRoleOut,
)

router = APIRouter(prefix="/workspaces/{workspace_id}/rbac", tags=["Workspace RBAC"])


def _translate_ref(ref: str | None, default: str | None) -> str | None:
    """
    Translate a "namespace:key" reference using current locale resources.

    Notes:
    - Mirrors the plugin module behavior but avoids importing PluginService here.
    """

    if not ref:
        return default
    trimmed = str(ref).strip()
    if not trimmed:
        return default
    if ":" in trimmed:
        namespace, key = trimmed.split(":", 1)
    elif "." in trimmed:
        namespace, key = trimmed.split(".", 1)
    else:
        namespace, key = "plugin", trimmed
    namespace = namespace.strip()
    key = key.strip()
    if not namespace or not key:
        return default
    return t(namespace, key, default=default)


async def _get_plugin_name_map(*, plugin_ids: set[str]) -> dict[str, str]:
    """
    Best-effort plugin display name map for matrix rendering.

    We intentionally do NOT require org-level permissions: RBAC matrix is workspace-scoped.
    """

    if not plugin_ids:
        return {}

    rows = await PluginRecord.filter(plugin_id__in=list(plugin_ids)).all()
    by_id = {str(r.plugin_id): r for r in rows if r.plugin_id}

    out: dict[str, str] = {}
    for pid in plugin_ids:
        record = by_id.get(pid)
        if record is None:
            continue
        name = record.name
        # Try manifest-backed localized name if available.
        try:
            from pathlib import Path

            manifest_path = Path(record.storage_path) / "plugin.toml"
            if manifest_path.is_file():
                manifest = load_plugin_manifest(manifest_path)
                name = _translate_ref(manifest.plugin.name_i18n, manifest.plugin.name) or name
        except Exception:
            pass
        if name:
            out[pid] = name
    return out


def get_rbac_service(settings: Settings = Depends(get_settings)) -> RBACService:
    return RBACService(settings)


@router.get(
    "/roles",
    response_model=ResponseModel[PageData[WorkspaceRoleOut]],
    summary="List roles in current workspace",
    dependencies=[require_workspace_permission("team:members:read")],
)
async def list_roles(
    params: PageParams = Depends(get_page_params),
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    service: RBACService = Depends(get_rbac_service),
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
    service: RBACService = Depends(get_rbac_service),
) -> ResponseModel[PageData[WorkspacePermissionOut]]:
    perms = await service.repo.list_permissions(scope=PermissionScope.WORKSPACE)
    plugin_ids = {str(p.plugin_id) for p in perms if p.plugin_id and str(p.plugin_id) != "core"}
    plugin_names = await _get_plugin_name_map(plugin_ids=plugin_ids)
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
    service: RBACService = Depends(get_rbac_service),
) -> ResponseModel[WorkspaceRBACMatrixOut]:
    payload = await service.get_matrix(workspace_id=ctx.workspace_id)
    roles = payload["roles"]
    permissions = payload["permissions"]
    grants = payload["grants"]

    # Localize outputs.
    locale = get_current_locale()
    localized_roles = [WorkspaceRoleOut.model_validate(service.localize_role(r, locale=locale)) for r in roles]
    plugin_ids = {str(p.plugin_id) for p in permissions if p.plugin_id and str(p.plugin_id) != "core"}
    plugin_names = await _get_plugin_name_map(plugin_ids=plugin_ids)
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
    service: RBACService = Depends(get_rbac_service),
) -> ResponseModel[WorkspaceRoleOut]:
    locale = get_current_locale()
    name_l10n = body.name_l10n
    if name_l10n is None:
        # Single-locale UX: store the provided name under current locale.
        name_l10n = {locale: body.name or ""}

    description_l10n = body.description_l10n
    if description_l10n is None and body.description is not None:
        description_l10n = {locale: body.description}

    role = await service.create_custom_role(
        workspace_id=ctx.workspace_id,
        code=body.code,
        name_l10n=name_l10n,
        description_l10n=description_l10n,
        template_role_code=body.template_role_code,
    )
    return Response.success(data=WorkspaceRoleOut.model_validate(service.localize_role(role, locale=locale)))


@router.patch(
    "/roles/{role_code}",
    response_model=ResponseModel[WorkspaceRoleOut],
    summary="Update a custom role (i18n fields)",
    dependencies=[require_workspace_permission("rbac:roles:write")],
)
async def update_role(
    role_code: str,
    body: RoleUpdateRequest,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    service: RBACService = Depends(get_rbac_service),
) -> ResponseModel[WorkspaceRoleOut]:
    locale = get_current_locale()
    name_l10n = body.name_l10n
    if name_l10n is None and body.name is not None:
        name_l10n = {locale: body.name}

    description_l10n = body.description_l10n
    if description_l10n is None and body.description is not None:
        description_l10n = {locale: body.description}

    role = await service.update_custom_role(
        workspace_id=ctx.workspace_id,
        role_code=role_code,
        name_l10n=name_l10n,
        description_l10n=description_l10n,
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
    service: RBACService = Depends(get_rbac_service),
) -> ResponseModel[None]:
    await service.delete_custom_role(workspace_id=ctx.workspace_id, role_code=role_code)
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
    service: RBACService = Depends(get_rbac_service),
) -> ResponseModel[None]:
    await service.set_permission_custom_roles(
        workspace_id=ctx.workspace_id,
        permission_code=permission_code,
        role_codes=body.role_codes,
    )
    return Response.success()
