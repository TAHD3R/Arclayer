from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, Depends, Path, status

from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.http.pagination import PageData, PageParams, get_page_params, paginate_items
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.auth.http.service import get_current_user_id
from src.modules.projects.facade.service import ProjectFacadeService
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.http.service import get_project_context
from src.modules.sites.domains.router import get_site_domains_service
from src.modules.sites.domains.schema import (
    SiteDomainCreateIn,
    SiteDomainCreateOut,
    SiteDomainDeleteOut,
    SiteDomainOut,
    SiteDomainUpdateIn,
    SiteDomainVerifyOut,
)
from src.modules.sites.domains.service import SiteDomainsService
from src.modules.workspaces.authz.http.service import ensure_workspace_permission_granted
from src.modules.workspaces.http.schema import WorkspaceContext

router = APIRouter(prefix="/projects/{project_id}/domains", tags=["domain.projects.domains"])


def get_project_facade_service(settings: Settings = Depends(get_settings)) -> ProjectFacadeService:
    return ProjectFacadeService(settings)


def _workspace_context_from_project(ctx: ProjectRequestContext) -> WorkspaceContext:
    return WorkspaceContext(
        workspace_id=ctx.workspace_id,
        organization_id=ctx.organization_id,
        workspace_kind=ctx.workspace_kind,
        access_type=ctx.access_type,
        org_membership_id=ctx.org_membership_id,
        is_org_owner=ctx.is_org_owner,
        workspace_membership_id=ctx.workspace_membership_id,
        visible_only=ctx.visible_only,
        is_creator_admin=ctx.is_creator_admin,
    )


def require_project_domain_permission(permission: str):
    async def _dep(
        ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
        user_id: Annotated[UUID, Depends(get_current_user_id)],
    ) -> None:
        await ensure_workspace_permission_granted(
            permission,
            user_id=user_id,
            ctx=_workspace_context_from_project(ctx),
        )

    return Depends(_dep)


async def _get_project_site_id(
    *,
    ctx: ProjectRequestContext,
    actor_user_id: UUID,
    facade_service: ProjectFacadeService,
) -> UUID:
    facade = await facade_service.get_context(project_id=ctx.project_id, actor_user_id=actor_user_id)
    return facade.site_id


@router.get(
    "",
    response_model=ResponseModel[PageData[SiteDomainOut]],
    response_model_exclude_none=True,
    summary="List project custom domains",
    dependencies=[require_project_domain_permission("system:domains:read")],
)
async def list_project_domains(
    params: PageParams = Depends(get_page_params),
    ctx: ProjectRequestContext = Depends(get_project_context),
    actor_user_id: UUID = Depends(get_current_user_id),
    facade_service: ProjectFacadeService = Depends(get_project_facade_service),
    service: SiteDomainsService = Depends(get_site_domains_service),
) -> ResponseModel[PageData[SiteDomainOut]]:
    site_id = await _get_project_site_id(ctx=ctx, actor_user_id=actor_user_id, facade_service=facade_service)
    domains = await service.list_domains_for_site(site_id=site_id)
    items = [SiteDomainOut.model_validate(service.to_out(domain)) for domain in domains]
    return ApiResponse.success(data=paginate_items(items, params=params))


@router.post(
    "",
    response_model=ResponseModel[SiteDomainCreateOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Bind a project custom domain",
    dependencies=[require_project_domain_permission("system:domains:manage")],
)
async def create_project_domain(
    payload: Annotated[SiteDomainCreateIn, Body(description="Project custom domain binding request.")],
    ctx: ProjectRequestContext = Depends(get_project_context),
    actor_user_id: UUID = Depends(get_current_user_id),
    facade_service: ProjectFacadeService = Depends(get_project_facade_service),
    service: SiteDomainsService = Depends(get_site_domains_service),
) -> ResponseModel[SiteDomainCreateOut]:
    site_id = await _get_project_site_id(ctx=ctx, actor_user_id=actor_user_id, facade_service=facade_service)
    record, dns = await service.create_domain_for_site(
        site_id=site_id,
        hostname=payload.hostname,
        actor_user_id=actor_user_id,
    )
    return ApiResponse.success(
        data=SiteDomainCreateOut(domain=SiteDomainOut.model_validate(service.to_out(record)), dns=dns)
    )


@router.post(
    "/{domain_id}/verify",
    response_model=ResponseModel[SiteDomainVerifyOut],
    response_model_exclude_none=True,
    summary="Verify a project custom domain via DNS TXT",
    dependencies=[require_project_domain_permission("system:domains:manage")],
)
async def verify_project_domain(
    domain_id: Annotated[PublicUUID, Path(..., description="Domain record id.")],
    ctx: ProjectRequestContext = Depends(get_project_context),
    actor_user_id: UUID = Depends(get_current_user_id),
    facade_service: ProjectFacadeService = Depends(get_project_facade_service),
    service: SiteDomainsService = Depends(get_site_domains_service),
) -> ResponseModel[SiteDomainVerifyOut]:
    site_id = await _get_project_site_id(ctx=ctx, actor_user_id=actor_user_id, facade_service=facade_service)
    record, dns, observed = await service.verify_domain_for_site(
        site_id=site_id,
        domain_id=UUID(str(domain_id)),
    )
    return ApiResponse.success(
        data=SiteDomainVerifyOut(
            domain=SiteDomainOut.model_validate(service.to_out(record)),
            dns=dns,
            observedTxtValues=observed,
        )
    )


@router.patch(
    "/{domain_id}",
    response_model=ResponseModel[SiteDomainOut],
    response_model_exclude_none=True,
    summary="Update a project custom domain binding",
    dependencies=[require_project_domain_permission("system:domains:manage")],
)
async def update_project_domain(
    domain_id: Annotated[PublicUUID, Path(..., description="Domain record id.")],
    payload: Annotated[SiteDomainUpdateIn, Body(description="Update payload.")],
    ctx: ProjectRequestContext = Depends(get_project_context),
    actor_user_id: UUID = Depends(get_current_user_id),
    facade_service: ProjectFacadeService = Depends(get_project_facade_service),
    service: SiteDomainsService = Depends(get_site_domains_service),
) -> ResponseModel[SiteDomainOut]:
    site_id = await _get_project_site_id(ctx=ctx, actor_user_id=actor_user_id, facade_service=facade_service)
    record = await service.set_domain_active_for_site(
        site_id=site_id,
        domain_id=UUID(str(domain_id)),
        is_active=bool(payload.is_active),
    )
    return ApiResponse.success(data=SiteDomainOut.model_validate(service.to_out(record)))


@router.delete(
    "/{domain_id}",
    response_model=ResponseModel[SiteDomainDeleteOut],
    response_model_exclude_none=True,
    summary="Unbind a project custom domain",
    dependencies=[require_project_domain_permission("system:domains:manage")],
)
async def delete_project_domain(
    domain_id: Annotated[PublicUUID, Path(..., description="Domain record id.")],
    ctx: ProjectRequestContext = Depends(get_project_context),
    actor_user_id: UUID = Depends(get_current_user_id),
    facade_service: ProjectFacadeService = Depends(get_project_facade_service),
    service: SiteDomainsService = Depends(get_site_domains_service),
) -> ResponseModel[SiteDomainDeleteOut]:
    site_id = await _get_project_site_id(ctx=ctx, actor_user_id=actor_user_id, facade_service=facade_service)
    await service.delete_domain_for_site(site_id=site_id, domain_id=UUID(str(domain_id)))
    return ApiResponse.success(data=SiteDomainDeleteOut(domainId=domain_id))
