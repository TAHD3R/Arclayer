from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, Depends, Path, Request, status

from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.exceptions import Conflict
from src.core.http.pagination import PageData, PageParams, get_page_params, paginate_items
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.auth.http.service import get_current_user_id
from src.modules.sites.domains.schema import (
    SiteDomainCreateIn,
    SiteDomainCreateOut,
    SiteDomainDeleteOut,
    SiteDomainOut,
    SiteDomainUpdateIn,
    SiteDomainVerifyOut,
)
from src.modules.sites.domains.service import SiteDomainsService
from src.modules.workspaces.authz.http.service import require_workspace_permission
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.http.service import require_workspace_manage_access
from src.platform.cache.valkey import get_valkey

router = APIRouter(
    prefix="/_internal/workspaces/{workspace_id}/site/domains",
    tags=["domain.sites.domains"],
    dependencies=[require_workspace_permission("system:domains:read")],
)


def get_site_domains_service(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> SiteDomainsService:
    try:
        valkey = get_valkey(request)
    except RuntimeError:
        valkey = None
    return SiteDomainsService(settings, valkey=valkey)


@router.get(
    "",
    response_model=ResponseModel[PageData[SiteDomainOut]],
    response_model_exclude_none=True,
    summary="List site custom domains for current workspace site",
)
async def list_site_domains(
    params: PageParams = Depends(get_page_params),
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user_id: UUID = Depends(get_current_user_id),
    service: SiteDomainsService = Depends(get_site_domains_service),
) -> ResponseModel[PageData[SiteDomainOut]]:
    """List site custom domains for current workspace site."""
    domains = await service.list_domains(workspace_id=ctx.workspace_id, actor_user_id=user_id)
    items = [SiteDomainOut.model_validate(service.to_out(d)) for d in domains]
    page = paginate_items(items, params=params)
    return ApiResponse.success(data=page)


@router.post(
    "",
    response_model=ResponseModel[SiteDomainCreateOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Bind a custom domain (DNS TXT verification required)",
    dependencies=[require_workspace_permission("system:domains:manage")],
)
async def create_site_domain(
    payload: Annotated[SiteDomainCreateIn, Body(description="Custom domain binding request.")],
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user_id: UUID = Depends(get_current_user_id),
    service: SiteDomainsService = Depends(get_site_domains_service),
) -> ResponseModel[SiteDomainCreateOut]:
    """Bind a custom domain (DNS TXT verification required)."""
    rec, dns = await service.create_domain(
        workspace_id=ctx.workspace_id,
        hostname=payload.hostname,
        actor_user_id=user_id,
    )
    out = SiteDomainOut.model_validate(service.to_out(rec))
    return ApiResponse.success(data=SiteDomainCreateOut(domain=out, dns=dns))


@router.post(
    "/{domain_id}/verify",
    response_model=ResponseModel[SiteDomainVerifyOut],
    response_model_exclude_none=True,
    summary="Verify a custom domain via DNS TXT",
    dependencies=[require_workspace_permission("system:domains:manage")],
)
async def verify_site_domain(
    domain_id: Annotated[PublicUUID, Path(..., description="Domain record id.")],
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user_id: UUID = Depends(get_current_user_id),
    service: SiteDomainsService = Depends(get_site_domains_service),
) -> ResponseModel[SiteDomainVerifyOut]:
    """Verify a custom domain via DNS TXT."""
    rec, dns, observed = await service.verify_domain(
        workspace_id=ctx.workspace_id,
        domain_id=UUID(str(domain_id)),
        actor_user_id=user_id,
    )
    out = SiteDomainOut.model_validate(service.to_out(rec))
    return ApiResponse.success(
        data=SiteDomainVerifyOut(
            domain=out,
            dns=dns,
            observedTxtValues=observed,
        )
    )


@router.patch(
    "/{domain_id}",
    response_model=ResponseModel[SiteDomainOut],
    response_model_exclude_none=True,
    summary="Update a custom domain binding",
    dependencies=[require_workspace_permission("system:domains:manage")],
)
async def update_site_domain(
    domain_id: Annotated[PublicUUID, Path(..., description="Domain record id.")],
    payload: Annotated[SiteDomainUpdateIn, Body(description="Update payload.")],
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user_id: UUID = Depends(get_current_user_id),
    service: SiteDomainsService = Depends(get_site_domains_service),
) -> ResponseModel[SiteDomainOut]:
    """Update a custom domain binding."""
    if payload.is_active is None:
        # Keep this endpoint strict: require at least one field.
        raise Conflict("No updatable fields provided", error="SITE_DOMAIN_UPDATE_EMPTY")

    rec = await service.set_domain_active(
        workspace_id=ctx.workspace_id,
        domain_id=UUID(str(domain_id)),
        is_active=bool(payload.is_active),
        actor_user_id=user_id,
    )
    out = SiteDomainOut.model_validate(service.to_out(rec))
    return ApiResponse.success(data=out)


@router.delete(
    "/{domain_id}",
    response_model=ResponseModel[SiteDomainDeleteOut],
    response_model_exclude_none=True,
    summary="Unbind a custom domain",
    dependencies=[require_workspace_permission("system:domains:manage")],
)
async def delete_site_domain(
    domain_id: Annotated[PublicUUID, Path(..., description="Domain record id.")],
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user_id: UUID = Depends(get_current_user_id),
    service: SiteDomainsService = Depends(get_site_domains_service),
) -> ResponseModel[SiteDomainDeleteOut]:
    """Unbind a custom domain."""
    await service.delete_domain(
        workspace_id=ctx.workspace_id,
        domain_id=UUID(str(domain_id)),
        actor_user_id=user_id,
    )
    return ApiResponse.success(data=SiteDomainDeleteOut(domainId=domain_id))
