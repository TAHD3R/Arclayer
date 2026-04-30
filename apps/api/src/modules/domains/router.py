from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, Depends, Path, Request, status

from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.http.pagination import PageData, PageParams, get_page_params, paginate_items
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.auth.http.service import get_current_user_id
from src.modules.domains.schema import (
    DomainBindingCreateIn,
    DomainBindingCreateOut,
    DomainBindingDeleteOut,
    DomainBindingOut,
    DomainBindingUpdateIn,
    DomainBindingVerifyOut,
)
from src.modules.domains.service import DomainBindingService
from src.modules.projects.http.router_helpers import (
    get_project_runtime_context,
    get_project_runtime_service,
    require_project_permission,
)
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.http.service import get_project_context
from src.modules.projects.runtime.service import ProjectRuntimeService
from src.platform.cache.valkey import get_valkey

project_domains_router = APIRouter(prefix="/projects/{project_id}/domains", tags=["domain.projects.domains"])


def get_domain_binding_service(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> DomainBindingService:
    try:
        valkey = get_valkey(request)
    except RuntimeError:
        valkey = None
    return DomainBindingService(settings, valkey=valkey)


async def _get_project_runtime_identity(
    *,
    ctx: ProjectRequestContext,
    actor_user_id: UUID,
    runtime_service: ProjectRuntimeService,
) -> tuple[UUID, UUID, UUID]:
    runtime_context = await get_project_runtime_context(
        ctx=ctx,
        actor_user_id=actor_user_id,
        runtime_service=runtime_service,
    )
    return runtime_context.workspace_id, runtime_context.runtime_id, runtime_context.site_id


@project_domains_router.get(
    "",
    response_model=ResponseModel[PageData[DomainBindingOut]],
    response_model_exclude_none=True,
    summary="List project domain bindings",
    dependencies=[require_project_permission("project:domains:read")],
)
async def list_project_domains(
    params: PageParams = Depends(get_page_params),
    ctx: ProjectRequestContext = Depends(get_project_context),
    service: DomainBindingService = Depends(get_domain_binding_service),
) -> ResponseModel[PageData[DomainBindingOut]]:
    bindings = await service.list_bindings_for_project(project_id=ctx.project_id)
    items = [DomainBindingOut.model_validate(service.to_out(binding)) for binding in bindings]
    return ApiResponse.success(data=paginate_items(items, params=params))


@project_domains_router.post(
    "",
    response_model=ResponseModel[DomainBindingCreateOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Create a project custom domain binding",
    dependencies=[require_project_permission("project:domains:manage")],
)
async def create_project_domain(
    payload: Annotated[DomainBindingCreateIn, Body(description="Project custom domain binding request.")],
    ctx: ProjectRequestContext = Depends(get_project_context),
    actor_user_id: UUID = Depends(get_current_user_id),
    runtime_service: ProjectRuntimeService = Depends(get_project_runtime_service),
    service: DomainBindingService = Depends(get_domain_binding_service),
) -> ResponseModel[DomainBindingCreateOut]:
    workspace_id, runtime_id, site_id = await _get_project_runtime_identity(
        ctx=ctx,
        actor_user_id=actor_user_id,
        runtime_service=runtime_service,
    )
    binding = await service.create_custom_binding(
        workspace_id=workspace_id,
        project_id=ctx.project_id,
        runtime_id=runtime_id,
        site_id=site_id,
        hostname=payload.hostname,
        actor_user_id=actor_user_id,
    )
    return ApiResponse.success(
        data=DomainBindingCreateOut(binding=DomainBindingOut.model_validate(service.to_out(binding)))
    )


@project_domains_router.post(
    "/{binding_id}/verify",
    response_model=ResponseModel[DomainBindingVerifyOut],
    response_model_exclude_none=True,
    summary="Verify a project custom domain binding via DNS TXT",
    dependencies=[require_project_permission("project:domains:manage")],
)
async def verify_project_domain(
    binding_id: Annotated[PublicUUID, Path(..., description="Domain binding id.")],
    ctx: ProjectRequestContext = Depends(get_project_context),
    service: DomainBindingService = Depends(get_domain_binding_service),
) -> ResponseModel[DomainBindingVerifyOut]:
    binding, observed = await service.verify_custom_binding(
        project_id=ctx.project_id,
        binding_id=UUID(str(binding_id)),
    )
    return ApiResponse.success(
        data=DomainBindingVerifyOut(
            binding=DomainBindingOut.model_validate(service.to_out(binding)),
            observedTxtValues=observed,
        )
    )


@project_domains_router.patch(
    "/{binding_id}",
    response_model=ResponseModel[DomainBindingOut],
    response_model_exclude_none=True,
    summary="Update a project domain binding",
    dependencies=[require_project_permission("project:domains:manage")],
)
async def update_project_domain(
    binding_id: Annotated[PublicUUID, Path(..., description="Domain binding id.")],
    payload: Annotated[DomainBindingUpdateIn, Body(description="Update payload.")],
    ctx: ProjectRequestContext = Depends(get_project_context),
    service: DomainBindingService = Depends(get_domain_binding_service),
) -> ResponseModel[DomainBindingOut]:
    binding = await service.set_binding_active(
        project_id=ctx.project_id,
        binding_id=UUID(str(binding_id)),
        is_active=bool(payload.is_active),
    )
    return ApiResponse.success(data=DomainBindingOut.model_validate(service.to_out(binding)))


@project_domains_router.delete(
    "/{binding_id}",
    response_model=ResponseModel[DomainBindingDeleteOut],
    response_model_exclude_none=True,
    summary="Delete a project custom domain binding",
    dependencies=[require_project_permission("project:domains:manage")],
)
async def delete_project_domain(
    binding_id: Annotated[PublicUUID, Path(..., description="Domain binding id.")],
    ctx: ProjectRequestContext = Depends(get_project_context),
    service: DomainBindingService = Depends(get_domain_binding_service),
) -> ResponseModel[DomainBindingDeleteOut]:
    await service.delete_custom_binding(project_id=ctx.project_id, binding_id=UUID(str(binding_id)))
    return ApiResponse.success(data=DomainBindingDeleteOut(bindingId=binding_id))
