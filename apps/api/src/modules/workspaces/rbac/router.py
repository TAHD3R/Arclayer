from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Header, Response, status

from src.config import Settings, get_settings
from src.core.http.pagination import PageData, PageParams, get_page_params, paginate_items
from src.core.http.response import ApiResponse, ResponseModel
from src.core.i18n import get_current_locale, t
from src.models.system.rbac import PermissionScope
from src.modules.auth.http.service import get_current_user_id
from src.modules.commerce.dunning.command_policy import build_restricted_recovery_command_policy
from src.modules.commerce.dunning.schema import RestrictedRecoveryEffect
from src.modules.workspaces.authz.http.service import require_workspace_permission
from src.modules.workspaces.authz.role_management import build_workspace_role_management_availability_reader
from src.modules.workspaces.authz.snapshot.service import get_workspace_authz_snapshot
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.http.service import require_workspace_manage_access
from src.modules.workspaces.permissions import get_permission_action_registry
from src.modules.workspaces.permissions.registry import list_permission_condition_templates
from src.modules.workspaces.rbac.catalog import (
    PERMISSION_CATALOG_GROUPS,
    RolePermissionBatchUpdate,
    build_catalog_etag,
    build_catalog_revision,
    build_permission_metadata,
    etag_matches,
    role_revision,
)
from src.modules.workspaces.rbac.schema import (
    PermissionRoleSetRequest,
    RoleCreateFromTemplateRequest,
    RolePermissionBatchSetOut,
    RolePermissionBatchSetRequest,
    RolePermissionGrantOut,
    RolePermissionSetRequest,
    RoleUpdateRequest,
    WorkspacePermissionActionOut,
    WorkspacePermissionCatalogOut,
    WorkspacePermissionConditionTemplateOut,
    WorkspacePermissionGroupOut,
    WorkspacePermissionOut,
    WorkspaceRoleOut,
)
from src.modules.workspaces.rbac.service import WorkspaceRBACService, build_workspace_rbac_service

router = APIRouter(prefix="/workspaces/{workspace_id}/rbac", tags=["domain.workspaces.rbac"])


def get_rbac_service(settings: Settings = Depends(get_settings)) -> WorkspaceRBACService:
    return build_workspace_rbac_service(settings)


async def _to_workspace_role_out(*, service: WorkspaceRBACService, role, locale: str) -> WorkspaceRoleOut:
    permission_codes = await service.list_permission_codes_for_role(role=role)
    condition_sets = await service.list_permission_condition_sets_for_role(role=role)
    return _workspace_role_out(
        service=service,
        role=role,
        locale=locale,
        permission_codes=permission_codes,
        condition_sets=condition_sets,
    )


def _workspace_role_out(
    *,
    service: WorkspaceRBACService,
    role,
    locale: str,
    permission_codes: list[str],
    condition_sets: dict[str, list],
) -> WorkspaceRoleOut:
    return WorkspaceRoleOut.model_validate({
        **service.localize_role(role, locale=locale),
        "permission_codes": permission_codes,
        "permission_grants": [
            RolePermissionGrantOut(permission_code=code, condition_sets=condition_sets.get(code, []))
            for code in permission_codes
        ],
        "source": "system" if role.is_system else "custom",
        "immutable": bool(role.is_system),
        "revision": role_revision(role),
    })


def _localize_ref(value: str | None, *, default: str) -> str:
    if not value or ":" not in value:
        return default
    namespace, key = value.split(":", 1)
    return t(namespace, key, default=default)


async def _workspace_permission_outs(
    *,
    service: WorkspaceRBACService,
    permissions,
) -> list[WorkspacePermissionOut]:
    metadata_by_code = build_permission_metadata(permissions)
    group_name_by_code = {
        group.code: _localize_ref(group.name_i18n, default=group.code) for group in PERMISSION_CATALOG_GROUPS
    }
    owner_keys = {
        str(permission.owner_key)
        for permission in permissions
        if permission.owner_key and str(permission.owner_key) != "core"
    }
    owner_names = await service.get_owner_name_map(owner_keys=owner_keys)
    items: list[WorkspacePermissionOut] = []
    for permission in permissions:
        localized = service.localize_permission(permission)
        metadata = metadata_by_code[permission.code]
        owner_key = str(permission.owner_key or "core")
        owner_name = (
            _localize_ref("rbac:RBAC_PERMISSION_OWNER_CORE", default="Core")
            if owner_key == "core"
            else owner_names.get(owner_key, owner_key)
        )
        items.append(
            WorkspacePermissionOut.model_validate({
                "id": permission.id,
                "code": permission.code,
                "scope": permission.scope.value,
                "name": localized["name"],
                "description": localized["description"],
                "name_i18n": permission.name_i18n,
                "description_i18n": permission.description_i18n,
                "group_code": metadata.group_code,
                "group_name": group_name_by_code[metadata.group_code],
                "sort_order": metadata.sort_order,
                "owner_key": owner_key,
                "owner_name": owner_name,
                "lifecycle": metadata.lifecycle,
                "replacement_code": metadata.replacement_code,
                "action_codes": list(metadata.action_codes),
                "condition_templates": list(metadata.condition_templates),
            })
        )
    return sorted(items, key=lambda item: item.sort_order)


def _workspace_action_outs() -> list[WorkspacePermissionActionOut]:
    return [
        WorkspacePermissionActionOut(
            code=action,
            module=definition.module,
            name=_localize_ref(definition.name_i18n, default=definition.name or action),
            description=_localize_ref(
                definition.description_i18n,
                default=definition.description or action,
            ),
            subject_kinds=list(definition.subject_kinds),
            permission_codes=list(definition.permission_codes),
            condition_templates=list(definition.condition_templates),
        )
        for action, definition in sorted(get_permission_action_registry().items(), key=lambda entry: entry[0])
    ]


def _workspace_condition_template_outs() -> list[WorkspacePermissionConditionTemplateOut]:
    return [
        WorkspacePermissionConditionTemplateOut.model_validate({
            **template.model_dump(),
            "description": t(
                "rbac",
                f"RBAC_CONDITION_{template.key.upper()}_DESC",
                default=template.description,
            ),
        })
        for template in list_permission_condition_templates()
    ]


async def _build_workspace_permission_catalog(
    *,
    service: WorkspaceRBACService,
    workspace_id: UUID,
) -> WorkspacePermissionCatalogOut:
    locale = get_current_locale()
    role_rows = await service.list_roles_with_permission_codes(workspace_id=workspace_id)
    roles: list[WorkspaceRoleOut] = []
    for role, permission_codes in role_rows:
        condition_sets = await service.list_permission_condition_sets_for_role(role=role)
        roles.append(
            _workspace_role_out(
                service=service,
                role=role,
                locale=locale,
                permission_codes=permission_codes,
                condition_sets=condition_sets,
            )
        )

    permissions = await service.repo.list_permissions(scope=PermissionScope.WORKSPACE)
    catalog_revision = build_catalog_revision(permissions)
    raw_roles = [role for role, _permission_codes in role_rows]
    return WorkspacePermissionCatalogOut(
        catalog_revision=catalog_revision,
        etag=build_catalog_etag(catalog_revision, raw_roles),
        groups=[
            WorkspacePermissionGroupOut(
                code=group.code,
                name=_localize_ref(group.name_i18n, default=group.code),
                order=group.order,
            )
            for group in PERMISSION_CATALOG_GROUPS
        ],
        permissions=await _workspace_permission_outs(service=service, permissions=permissions),
        roles=roles,
        actions=_workspace_action_outs(),
        condition_templates=_workspace_condition_template_outs(),
    )


@router.get(
    "/catalog",
    response_model=ResponseModel[WorkspacePermissionCatalogOut],
    responses={status.HTTP_304_NOT_MODIFIED: {"description": "Permission catalog unchanged."}},
    summary="Get revisioned workspace permission catalog and role projections",
    dependencies=[require_workspace_permission("rbac:permissions:read")],
)
async def get_permission_catalog(
    raw_response: Response,
    if_none_match: str | None = Header(default=None, alias="If-None-Match"),
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    service: WorkspaceRBACService = Depends(get_rbac_service),
) -> ResponseModel[WorkspacePermissionCatalogOut] | Response:
    payload = await _build_workspace_permission_catalog(
        service=service,
        workspace_id=ctx.workspace_id,
    )
    etag = payload.etag
    cache_headers = {"ETag": etag, "Cache-Control": "private, no-cache"}
    if etag_matches(if_none_match, etag):
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers=cache_headers)
    raw_response.headers.update(cache_headers)
    return ApiResponse.success(data=payload)


@router.get(
    "/roles",
    response_model=ResponseModel[PageData[WorkspaceRoleOut]],
    summary="List roles in current workspace",
    dependencies=[require_workspace_permission("rbac:roles:read")],
)
async def list_roles(
    params: PageParams = Depends(get_page_params),
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
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
            _workspace_role_out(
                service=service,
                role=role,
                locale=locale,
                permission_codes=permission_codes,
                condition_sets=condition_sets,
            )
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
    _ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    service: WorkspaceRBACService = Depends(get_rbac_service),
) -> ResponseModel[PageData[WorkspacePermissionOut]]:
    """List permissions (workspace scope)."""
    perms = await service.repo.list_permissions(scope=PermissionScope.WORKSPACE)
    items = await _workspace_permission_outs(service=service, permissions=perms)
    page = paginate_items(items, params=params)
    return ApiResponse.success(data=page)


@router.get(
    "/actions",
    response_model=ResponseModel[list[WorkspacePermissionActionOut]],
    summary="List canonical permission actions for current workspace",
    dependencies=[require_workspace_permission("rbac:permissions:read")],
)
async def list_actions(
    _ctx: WorkspaceContext = Depends(require_workspace_manage_access),
) -> ResponseModel[list[WorkspacePermissionActionOut]]:
    return ApiResponse.success(data=_workspace_action_outs())


@router.get(
    "/condition-templates",
    response_model=ResponseModel[list[WorkspacePermissionConditionTemplateOut]],
    summary="List supported conditional permission templates",
    dependencies=[require_workspace_permission("rbac:permissions:read")],
)
async def list_condition_templates(
    _ctx: WorkspaceContext = Depends(require_workspace_manage_access),
) -> ResponseModel[list[WorkspacePermissionConditionTemplateOut]]:
    """List supported conditional permission templates."""
    return ApiResponse.success(data=_workspace_condition_template_outs())


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
    """Create a custom role from template."""
    await build_restricted_recovery_command_policy().authorize(
        workspace_id=ctx.workspace_id,
        effects={RestrictedRecoveryEffect.ACCESS_EXPANSION},
    )
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
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user_id=Depends(get_current_user_id),
    service: WorkspaceRBACService = Depends(get_rbac_service),
) -> ResponseModel[WorkspaceRoleOut]:
    """Update a custom role."""
    await build_restricted_recovery_command_policy().authorize(
        workspace_id=ctx.workspace_id,
        effects={RestrictedRecoveryEffect.ACCESS_EXPANSION},
    )
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
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
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
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user_id=Depends(get_current_user_id),
    service: WorkspaceRBACService = Depends(get_rbac_service),
) -> ResponseModel[None]:
    """Set custom roles that can perform a permission (system roles are immutable)."""
    await build_restricted_recovery_command_policy().authorize(
        workspace_id=ctx.workspace_id,
        effects={RestrictedRecoveryEffect.ACCESS_EXPANSION},
    )
    await service.set_permission_custom_roles(
        organization_id=ctx.organization_id,
        workspace_id=ctx.workspace_id,
        actor_user_id=user_id,
        permission_code=permission_code,
        role_codes=body.role_codes,
    )
    return ApiResponse.success()


@router.put(
    "/role-permissions",
    response_model=ResponseModel[RolePermissionBatchSetOut],
    summary="Atomically replace permission grants for custom roles",
    dependencies=[require_workspace_permission("rbac:roles:write")],
)
async def set_role_permissions_batch(
    body: RolePermissionBatchSetRequest,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user_id=Depends(get_current_user_id),
    service: WorkspaceRBACService = Depends(get_rbac_service),
) -> ResponseModel[RolePermissionBatchSetOut]:
    await build_restricted_recovery_command_policy().authorize(
        workspace_id=ctx.workspace_id,
        effects={RestrictedRecoveryEffect.ACCESS_EXPANSION},
    )
    snapshot = await get_workspace_authz_snapshot(
        user_id=user_id,
        workspace_id=ctx.workspace_id,
        role_management_reader=build_workspace_role_management_availability_reader(),
    )
    revision, roles = await service.set_custom_role_permissions_batch(
        organization_id=ctx.organization_id,
        workspace_id=ctx.workspace_id,
        actor_user_id=user_id,
        catalog_revision=body.catalog_revision,
        idempotency_key=body.idempotency_key,
        updates=tuple(
            RolePermissionBatchUpdate(
                role_code=item.role_code,
                role_revision=item.role_revision,
                permission_grants=tuple(
                    (grant.permission_code, tuple(grant.condition_sets)) for grant in item.permission_grants
                ),
            )
            for item in body.roles
        ),
        actor_permission_codes=frozenset(snapshot.permission_codes),
        actor_is_superuser=snapshot.is_workspace_owner or snapshot.is_superuser,
    )
    locale = get_current_locale()
    return ApiResponse.success(
        data=RolePermissionBatchSetOut(
            catalog_revision=revision,
            roles=[await _to_workspace_role_out(service=service, role=role, locale=locale) for role in roles],
        )
    )


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
    """Replace permissions granted to a custom role (system roles are immutable)."""
    await build_restricted_recovery_command_policy().authorize(
        workspace_id=ctx.workspace_id,
        effects={RestrictedRecoveryEffect.ACCESS_EXPANSION},
    )
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
