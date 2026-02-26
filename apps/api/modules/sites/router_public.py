"""Public site resolution endpoint (no auth required)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Request
from fastapi import Response as FastAPIResponse

from apps.api.common.types.public_uuid import PublicUUID
from apps.api.config import Settings, get_settings
from apps.api.core.http.response import Response, ResponseModel
from apps.api.infra.cache.valkey import get_valkey
from apps.api.modules.sites.schema import SiteResolveOut
from apps.api.modules.sites.service import SiteService

router = APIRouter(prefix="/sites", tags=["Sites (Public)"])


def get_site_service(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> SiteService:
    try:
        valkey = get_valkey(request)
    except RuntimeError:
        valkey = None
    return SiteService(settings, valkey=valkey)


@router.get(
    "/resolve",
    response_model=ResponseModel[SiteResolveOut],
    summary="Resolve a site (workspaceSlug or host)",
    description="Public endpoint for Portal SSR to resolve a workspaceSlug/host to a site.",
)
async def resolve_site_by_host(
    raw_response: FastAPIResponse,
    workspace_slug: str | None = Query(
        default=None,
        alias="workspaceSlug",
        description="Workspace slug to resolve (e.g. philipcole).",
    ),
    host: str | None = Query(
        default=None,
        description="Request host (e.g. philipcole.celestial.app, localhost:3100).",
    ),
    svc: SiteService = Depends(get_site_service),
) -> ResponseModel[SiteResolveOut]:
    # Low-frequency mapping, safe to cache briefly.
    raw_response.headers["cache-control"] = "public, max-age=300, stale-while-revalidate=600"
    data = await svc.resolve_site(host=host, workspace_slug=workspace_slug)
    return Response.success(data=data)


@router.get(
    "/{site_id}/context",
    response_model=ResponseModel[SiteResolveOut],
    summary="Get site context by ID",
    description="Public endpoint for Portal editor to get site context by ID.",
)
async def get_site_context(
    site_id: Annotated[PublicUUID, Path(..., description="Site ID.")],
    svc: SiteService = Depends(get_site_service),
) -> ResponseModel[SiteResolveOut]:
    data = await svc.get_site_context(site_id=site_id)
    return Response.success(data=data)
