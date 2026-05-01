from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from src.core.http.response import ApiResponse, ResponseModel
from src.modules.auth.content_api.service import ContentApiAuthService
from src.modules.projects.runtime.router import get_runtime_context
from src.modules.projects.runtime.service import ProjectRuntimeContext
from src.modules.sites.content_api.entries_router import (
    authorize_content_entry_read,
    get_content_api_auth_service,
)
from src.modules.sites.content_api.rate_limit import enforce_content_api_rate_limit
from src.modules.sites.http.service import get_site_service
from src.modules.sites.search.deps import get_content_search_service
from src.modules.sites.search.schema import ContentSearchResultOut
from src.modules.sites.search.service import ContentSearchService
from src.modules.sites.service import SiteService

router = APIRouter(prefix="/runtimes/{runtime_id}/search", tags=["external.runtimes.search"])


@router.get(
    "",
    response_model=ResponseModel[ContentSearchResultOut],
    response_model_exclude_none=True,
    summary="Search published content entries",
)
async def search_published_content_entries(
    request: Request,
    runtime_context: Annotated[ProjectRuntimeContext, Depends(get_runtime_context)],
    _rate_limit: Annotated[None, Depends(enforce_content_api_rate_limit)],
    auth_service: Annotated[ContentApiAuthService, Depends(get_content_api_auth_service)],
    site_service: Annotated[SiteService, Depends(get_site_service)],
    search_service: Annotated[ContentSearchService, Depends(get_content_search_service)],
    query: Annotated[str, Query(alias="q", min_length=1, description="Full-text query.")],
    model_key: Annotated[str, Query(alias="modelKey", min_length=1, description="Content model key.")],
    locale: Annotated[str | None, Query(description="Locale filter, e.g. en-US.")] = None,
    limit: Annotated[int, Query(ge=1, le=100, description="Page size.")] = 20,
    offset: Annotated[int, Query(ge=0, description="Page offset.")] = 0,
) -> ResponseModel[ContentSearchResultOut]:
    """Search published content entries."""
    await authorize_content_entry_read(
        request=request,
        runtime_context=runtime_context,
        perspective="published",
        preview_token=None,
        auth_service=auth_service,
        site_service=site_service,
    )
    return ApiResponse.success(
        data=await search_service.search_published(
            runtime_context=runtime_context,
            model_key=model_key,
            query=query,
            locale=locale,
            limit=limit,
            offset=offset,
        )
    )
