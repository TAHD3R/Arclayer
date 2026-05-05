from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends

from src.config import Settings, get_settings
from src.core.http.pagination import PageData, PageParams, get_page_params, paginate_items
from src.core.http.response import ApiResponse, ResponseModel
from src.core.i18n import get_current_locale
from src.models.system.rbac import PermissionScope
from src.modules.auth.http.service import get_current_user_id
from src.modules.workspaces.authz.http.service import require_workspace_permission
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.http.service import require_team_workspace_manage_access
from src.modules.workspaces.permissions import get_permission_action_registry
from src.modules.workspaces.permissions.registry import list_permission_condition_templates
from src.modules.workspaces.rbac.schema import (
    PermissionRoleSetRequest,
    RoleCreateFromTemplateRequest,
    RolePermissionGrantOut,
    RolePermissionSetRequest,
    RoleUpdateRequest,
    WorkspacePermissionActionOut,
    WorkspacePermissionConditionTemplateOut,
    WorkspacePermissionOut,
    WorkspaceRoleOut,
)
from src.modules.workspaces.rbac.service import WorkspaceRBACService

router = APIRouter(prefix="/workspaces/{workspace_id}/rbac", tags=["domain.workspaces.rbac"])


def get_rbac_service(settings: Settings = Depends(get_settings)) -> WorkspaceRBACService:
    return WorkspaceRBACService(settings)


async def _to_workspace_role_out(*, service: WorkspaceRBACService, role, locale: str) -> WorkspaceRoleOut:
    permission_codes = await service.list_permission_codes_for_role(role=role)
    condition_sets = await service.list_permission_condition_sets_for_role(role=role)
    return WorkspaceRoleOut.model_validate({
        **service.localize_role(role, locale=locale),
        "permission_codes": permission_codes,
        "permission_grants": [
            RolePermissionGrantOut(permission_code=code, condition_sets=condition_sets.get(code, []))
            for code in permission_codes
        ],
    })


@router.get(
    "/roles",
    response_model=ResponseModel[PageData[WorkspaceRoleOut]],
    summary="List roles in current workspace",
    dependencies=[require_workspace_permission("rbac:roles:read")],
)
async def list_roles(
    params: PageParams = Depends(get_page_params),
    ctx: WorkspaceContext = Depends(require_team_workspace_manage_access),
    service: WorkspaceRBACService = Depends(get_rbac_service),
) -> ResponseModel[PageData[WorkspaceRoleOut]]:
    """List roles in current workspace."""
    # Role counts are typically small; do in-memory pagination so we can localize deterministically.
    roles = await service.list_roles_with_permission_codes(workspace_id=ctx.workspace_id)
    locale = get_current_locale()
    items: list[WorkspaceRoleOut] = []
    for role, permission_codes in roles:
        condition_sets = await service.list_permission_condition_sets_for_role(role=role)
        items.append(
            WorkspaceRoleOut.model_validate({
                **service.localize_role(role, locale=locale),
                "permission_codes": permission_codes,
                "permission_grants": [
                    RolePermissionGrantOut(
                        permission_code=code,
                        condition_sets=condition_sets.get(code, []),
                    )
                    for code in permission_codes
                ],
            })
        )
    page = paginate_items(items, params=params)
    return ApiResponse.success(data=page)


@router.get(
    "/permissions",
    response_model=ResponseModel[PageData[WorkspacePermissionOut]],
    summary="List permissions (workspace scope)",
    dependencies=[require_workspace_permission("rbac:permissions:read")],
)
async def list_permissions(
    params: PageParams = Depends(get_page_params),
    _ctx: WorkspaceContext = Depends(require_team_workspace_manage_access),
    service: WorkspaceRBACService = Depends(get_rbac_service),
) -> ResponseModel[PageData[WorkspacePermissionOut]]:
    """List permissions (workspace scope)."""
    perms = await service.repo.list_permissions(scope=PermissionScope.WORKSPACE)
    owner_keys = {str(p.owner_key) for p in perms if p.owner_key and str(p.owner_key) != "core"}
    owner_names = await service.get_owner_name_map(owner_keys=owner_keys)
    items: list[WorkspacePermissionOut] = []
    for p in perms:
        lp = service.localize_permission(p)
        owner_key_raw = lp.get("owner_key")
        owner_key = owner_key_raw if isinstance(owner_key_raw, str) else None
        desc_raw = lp.get("description")
        description = desc_raw if isinstance(desc_raw, str) else None
        items.append(
            WorkspacePermissionOut(
                id=UUID(str(lp["id"])),
                code=str(lp["code"]),
                name=str(lp["name"]),
                description=description,
                owner_key=owner_key,
                owner_name=owner_names.get(str(owner_key)) if owner_key else None,
            )
        )
    page = paginate_items(items, params=params)
    return ApiResponse.success(data=page)


@router.get(
    "/actions",
    response_model=ResponseModel[list[WorkspacePermissionActionOut]],
    summary="List canonical permission actions for current workspace",
    dependencies=[require_workspace_permission("rbac:permissions:read")],
)
async def list_actions(
    _ctx: WorkspaceContext = Depends(require_team_workspace_manage_access),
) -> ResponseModel[list[WorkspacePermissionActionOut]]:
    items = [
        WorkspacePermissionActionOut(
            code=action,
            description=definition.description,
            subject_kinds=list(definition.subject_kinds),
            permission_codes=list(definition.permission_codes),
            condition_templates=list(definition.condition_templates),
        )
        for action, definition in sorted(get_permission_action_registry().items(), key=lambda entry: entry[0])
    ]
    return ApiResponse.success(data=items)


@router.get(
    "/condition-templates",
    response_model=ResponseModel[list[WorkspacePermissionConditionTemplateOut]],
    summary="List supported conditional permission templates",
    dependencies=[require_workspace_permission("rbac:permissions:read")],
)
async def list_condition_templates(
    _ctx: WorkspaceContext = Depends(require_team_workspace_manage_access),
) -> ResponseModel[list[WorkspacePermissionConditionTemplateOut]]:
    """List supported conditional permission templates."""
    items = [
        WorkspacePermissionConditionTemplateOut.model_validate(template)
        for template in list_permission_condition_templates()
    ]
    return ApiResponse.success(data=items)


@router.post(
    "/roles",
    response_model=ResponseModel[WorkspaceRoleOut],
    summary="Create a custom role from template",
    dependencies=[require_workspace_permission("rbac:roles:write")],
)
async def create_role(
    body: RoleCreateFromTemplateRequest,
    ctx: WorkspaceContext = Depends(require_team_workspace_manage_access),
    user_id=Depends(get_current_user_id),
    service: WorkspaceRBACService = Depends(get_rbac_service),
) -> ResponseModel[WorkspaceRoleOut]:
    """Create a custom role from template."""
    locale = get_current_locale()
    role = await service.create_custom_role(
        organization_id=ctx.organization_id,
        workspace_id=ctx.workspace_id,
        actor_user_id=user_id,
        code=body.code,
        name=str(body.name or "").strip(),
        description=body.description,
        template_role_code=body.template_role_code,
    )
    return ApiResponse.success(data=await _to_workspace_role_out(service=service, role=role, locale=locale))


@router.patch(
    "/roles/{role_code}",
    response_model=ResponseModel[WorkspaceRoleOut],
    summary="Update a custom role",
    dependencies=[require_workspace_permission("rbac:roles:write")],
)
async def update_role(
    role_code: str,
    body: RoleUpdateRequest,
    ctx: WorkspaceContext = Depends(require_team_workspace_manage_access),
    user_id=Depends(get_current_user_id),
    service: WorkspaceRBACService = Depends(get_rbac_service),
) -> ResponseModel[WorkspaceRoleOut]:
    """Update a custom role."""
    locale = get_current_locale()
    role = await service.update_custom_role(
        organization_id=ctx.organization_id,
        workspace_id=ctx.workspace_id,
        actor_user_id=user_id,
        role_code=role_code,
        name=body.name,
        description=body.description,
    )
    return ApiResponse.success(data=await _to_workspace_role_out(service=service, role=role, locale=locale))


@router.delete(
    "/roles/{role_code}",
    response_model=ResponseModel[None],
    summary="Delete a custom role (auto-unbind from members)",
    dependencies=[require_workspace_permission("rbac:roles:write")],
)
async def delete_role(
    role_code: str,
    ctx: WorkspaceContext = Depends(require_team_workspace_manage_access),
    user_id=Depends(get_current_user_id),
    service: WorkspaceRBACService = Depends(get_rbac_service),
) -> ResponseModel[None]:
    """Delete a custom role (auto-unbind from members)."""
    await service.delete_custom_role(
        organization_id=ctx.organization_id,
        workspace_id=ctx.workspace_id,
        actor_user_id=user_id,
        role_code=role_code,
    )
    return ApiResponse.success()


@router.put(
    "/permissions/{permission_code}/roles",
    response_model=ResponseModel[None],
    summary="Set custom roles that can perform a permission (system roles are immutable)",
    dependencies=[require_workspace_permission("rbac:roles:write")],
)
async def set_permission_roles(
    permission_code: str,
    body: PermissionRoleSetRequest,
    ctx: WorkspaceContext = Depends(require_team_workspace_manage_access),
    user_id=Depends(get_current_user_id),
    service: WorkspaceRBACService = Depends(get_rbac_service),
) -> ResponseModel[None]:
    """Set custom roles that can perform a permission (system roles are immutable)."""
    await service.set_permission_custom_roles(
        organization_id=ctx.organization_id,
        workspace_id=ctx.workspace_id,
        actor_user_id=user_id,
        permission_code=permission_code,
        role_codes=body.role_codes,
    )
    return ApiResponse.success()


@router.put(
    "/roles/{role_code}/permissions",
    response_model=ResponseModel[None],
    summary="Replace permissions granted to a custom role (system roles are immutable)",
    dependencies=[require_workspace_permission("rbac:roles:write")],
)
async def set_role_permissions(
    role_code: str,
    body: RolePermissionSetRequest,
    ctx: WorkspaceContext = Depends(require_team_workspace_manage_access),
    user_id=Depends(get_current_user_id),
    service: WorkspaceRBACService = Depends(get_rbac_service),
) -> ResponseModel[None]:
    """Replace permissions granted to a custom role (system roles are immutable)."""
    await service.set_custom_role_permissions(
        organization_id=ctx.organization_id,
        workspace_id=ctx.workspace_id,
        actor_user_id=user_id,
        role_code=role_code,
        permission_codes=body.permission_codes,
        permission_condition_sets_by_code={
            str(grant.permission_code): grant.condition_sets for grant in body.permission_grants
        },
    )
    return ApiResponse.success()
