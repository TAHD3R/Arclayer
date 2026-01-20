from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from rbac.deps import get_rbac_service, require_admin
from rbac.schema import BootstrapResult, PermissionOut, RoleOut, SyncResult
from rbac.services import RBACService

from apps.api.core.response import Response, ResponseModel
from apps.api.models.user import User
from apps.api.routers.v1.auth.deps import get_current_user

admin_router = APIRouter(tags=["rbac"])


@admin_router.get(
    "/roles",
    response_model=ResponseModel[list[RoleOut]],
    dependencies=[Depends(require_admin)],
)
async def list_roles(
    service: RBACService = Depends(get_rbac_service),
) -> ResponseModel[list[RoleOut]]:
    roles = await service.list_roles()
    payload = [RoleOut.model_validate(role) for role in roles]
    return Response.success(data=payload)


@admin_router.get(
    "/permissions",
    response_model=ResponseModel[list[PermissionOut]],
    dependencies=[Depends(require_admin)],
)
async def list_permissions(
    service: RBACService = Depends(get_rbac_service),
) -> ResponseModel[list[PermissionOut]]:
    permissions = await service.list_permissions()
    payload = [PermissionOut.model_validate(permission) for permission in permissions]
    return Response.success(data=payload)


@admin_router.post(
    "/permissions/sync",
    response_model=ResponseModel[SyncResult],
    dependencies=[Depends(require_admin)],
)
async def sync_permissions(
    service: RBACService = Depends(get_rbac_service),
) -> ResponseModel[SyncResult]:
    result = await service.sync_permissions()
    return Response.success(data=SyncResult.model_validate(result))


@admin_router.get(
    "/users/{user_id}/roles",
    response_model=ResponseModel[list[RoleOut]],
    dependencies=[Depends(require_admin)],
)
async def list_user_roles(
    user_id: UUID,
    service: RBACService = Depends(get_rbac_service),
) -> ResponseModel[list[RoleOut]]:
    roles = await service.list_user_roles(user_id=user_id)
    payload = [RoleOut.model_validate(role) for role in roles]
    return Response.success(data=payload)


@admin_router.post(
    "/users/{user_id}/roles/{role_code}",
    response_model=ResponseModel[None],
    dependencies=[Depends(require_admin)],
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
    dependencies=[Depends(require_admin)],
)
async def revoke_role(
    user_id: UUID,
    role_code: str,
    service: RBACService = Depends(get_rbac_service),
) -> ResponseModel[None]:
    await service.revoke_role(user_id=user_id, role_code=role_code)
    return Response.success()


@admin_router.post(
    "/bootstrap/admin",
    response_model=ResponseModel[BootstrapResult],
)
async def bootstrap_admin(
    user: User = Depends(get_current_user),
    service: RBACService = Depends(get_rbac_service),
) -> ResponseModel[BootstrapResult]:
    payload = await service.bootstrap_admin(user_id=user.id)
    return Response.success(data=BootstrapResult.model_validate(payload))
