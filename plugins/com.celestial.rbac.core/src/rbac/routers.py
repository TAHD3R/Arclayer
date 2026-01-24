from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends

from apps.api.core.authz import require_permission_strict
from apps.api.core.response import Response, ResponseModel
from apps.api.http.pagination import PageData, PageParams, get_page_params
from apps.api.models.user import User
from apps.api.routers.v1.auth.deps import get_current_user
from rbac.deps import get_rbac_service
from rbac.schema import (
    AuthzSnapshot,
    BootstrapResult,
    PermissionOut,
    RoleCreate,
    RoleOut,
    RolePermissionSet,
    RoleUpdate,
    SyncResult,
)
from rbac.services import RBACService

public_router = APIRouter(tags=["Plugin: Role-based access control"])
admin_router = APIRouter(tags=["Plugin: Role-based access control"])


@admin_router.get(
    "/roles",
    response_model=ResponseModel[PageData[RoleOut]],
    dependencies=[require_permission_strict("rbac:roles:read")],
)
async def list_roles(
    params: PageParams = Depends(get_page_params),
    service: RBACService = Depends(get_rbac_service),
) -> ResponseModel[PageData[RoleOut]]:
    page = await service.list_roles_paginated(params=params)
    return Response.success(data=page)


@admin_router.get(
    "/roles/{role_code}",
    response_model=ResponseModel[RoleOut],
    dependencies=[require_permission_strict("rbac:roles:read")],
)
async def get_role(
    role_code: str,
    service: RBACService = Depends(get_rbac_service),
) -> ResponseModel[RoleOut]:
    role = await service.get_role(role_code=role_code)
    return Response.success(data=RoleOut.model_validate(role))


@admin_router.post(
    "/roles",
    response_model=ResponseModel[RoleOut],
    dependencies=[require_permission_strict("rbac:roles:write")],
)
async def create_role(
    body: RoleCreate,
    service: RBACService = Depends(get_rbac_service),
) -> ResponseModel[RoleOut]:
    role = await service.create_role(**body.model_dump())
    return Response.success(data=RoleOut.model_validate(role))


@admin_router.patch(
    "/roles/{role_code}",
    response_model=ResponseModel[RoleOut],
    dependencies=[require_permission_strict("rbac:roles:write")],
)
async def update_role(
    role_code: str,
    body: RoleUpdate,
    service: RBACService = Depends(get_rbac_service),
) -> ResponseModel[RoleOut]:
    role = await service.update_role(role_code=role_code, payload=body.model_dump(exclude_unset=True))
    return Response.success(data=RoleOut.model_validate(role))


@admin_router.delete(
    "/roles/{role_code}",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("rbac:roles:write")],
)
async def delete_role(
    role_code: str,
    service: RBACService = Depends(get_rbac_service),
) -> ResponseModel[None]:
    await service.delete_role(role_code=role_code)
    return Response.success()


@admin_router.get(
    "/permissions",
    response_model=ResponseModel[PageData[PermissionOut]],
    dependencies=[require_permission_strict("rbac:permissions:read")],
)
async def list_permissions(
    params: PageParams = Depends(get_page_params),
    service: RBACService = Depends(get_rbac_service),
) -> ResponseModel[PageData[PermissionOut]]:
    page = await service.list_permissions_paginated(params=params)
    return Response.success(data=page)


@admin_router.get(
    "/roles/{role_code}/permissions",
    response_model=ResponseModel[PageData[PermissionOut]],
    dependencies=[require_permission_strict("rbac:roles:read")],
)
async def list_role_permissions(
    role_code: str,
    params: PageParams = Depends(get_page_params),
    service: RBACService = Depends(get_rbac_service),
) -> ResponseModel[PageData[PermissionOut]]:
    page = await service.list_role_permissions_paginated(role_code=role_code, params=params)
    return Response.success(data=page)


@admin_router.put(
    "/roles/{role_code}/permissions",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("rbac:roles:write")],
)
async def set_role_permissions(
    role_code: str,
    body: RolePermissionSet,
    service: RBACService = Depends(get_rbac_service),
) -> ResponseModel[None]:
    await service.set_role_permissions(role_code=role_code, permission_codes=body.permission_codes)
    return Response.success()


@admin_router.post(
    "/permissions/sync",
    response_model=ResponseModel[SyncResult],
    dependencies=[require_permission_strict("rbac:permissions:sync")],
)
async def sync_permissions(
    service: RBACService = Depends(get_rbac_service),
) -> ResponseModel[SyncResult]:
    result = await service.sync_permissions()
    return Response.success(data=result)


@admin_router.get(
    "/users/{user_id}/roles",
    response_model=ResponseModel[PageData[RoleOut]],
    dependencies=[require_permission_strict("rbac:users:assign")],
)
async def list_user_roles(
    user_id: UUID,
    params: PageParams = Depends(get_page_params),
    service: RBACService = Depends(get_rbac_service),
) -> ResponseModel[PageData[RoleOut]]:
    page = await service.list_user_roles_paginated(user_id=user_id, params=params)
    return Response.success(data=page)


@admin_router.post(
    "/users/{user_id}/roles/{role_code}",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("rbac:users:assign")],
)
async def assign_role(
    user_id: UUID,
    role_code: str,
    service: RBACService = Depends(get_rbac_service),
) -> ResponseModel[None]:
    await service.assign_role(user_id=user_id, role_code=role_code)
    return Response.success()


@admin_router.delete(
    "/users/{user_id}/roles/{role_code}",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("rbac:users:assign")],
)
async def revoke_role(
    user_id: UUID,
    role_code: str,
    service: RBACService = Depends(get_rbac_service),
) -> ResponseModel[None]:
    await service.revoke_role(user_id=user_id, role_code=role_code)
    return Response.success()


@public_router.post(
    "/bootstrap/admin",
    response_model=ResponseModel[BootstrapResult],
)
async def bootstrap_admin(
    user: User = Depends(get_current_user),
    service: RBACService = Depends(get_rbac_service),
) -> ResponseModel[BootstrapResult]:
    payload = await service.bootstrap_admin(user_id=user.id)
    return Response.success(data=BootstrapResult.model_validate(payload))


@admin_router.get(
    "/me/authz",
    response_model=ResponseModel[AuthzSnapshot],
)
async def get_my_authz(
    user: User = Depends(get_current_user),
    service: RBACService = Depends(get_rbac_service),
) -> ResponseModel[AuthzSnapshot]:
    payload = await service.get_my_authz(user_id=user.id)
    return Response.success(data=payload)
