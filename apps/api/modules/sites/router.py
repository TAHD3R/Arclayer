from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Body, Depends, Query, Request, status
from fastapi import Response as FastAPIResponse
from fastapi.responses import Response as RawResponse

from apps.api.common.types.public_uuid import PublicUUID
from apps.api.config import Settings, get_settings
from apps.api.core.http.pagination import PageData, PageParams, get_page_params
from apps.api.core.http.response import Response, ResponseModel
from apps.api.infra.cache.valkey import get_valkey
from apps.api.modules.sites.portal_extensions.router import router as portal_extensions_router
from apps.api.modules.sites.router_domains import router as site_domains_router
from apps.api.modules.sites.schema import (
    SiteEntryCreateIn,
    SiteEntryDeleteOut,
    SiteEntryDraftSaveIn,
    SiteEntryDraftSaveOut,
    SiteEntryOut,
    SiteEntryPublishIn,
    SiteEntryPublishOut,
    SiteEntryRevisionOut,
    SiteEntryRollbackIn,
    SiteEntryRollbackOut,
    SiteEntryTypeCreateIn,
    SiteEntryTypeDeleteOut,
    SiteEntryTypeOut,
    SiteEntryTypeUpdateIn,
    SiteEntryUnpublishIn,
    SiteEntryUnpublishOut,
    SiteEntryUpdateIn,
    SitePageCreateIn,
    SitePageDeleteOut,
    SitePageDraftSaveIn,
    SitePageDraftSaveOut,
    SitePageMoveIn,
    SitePagePublishIn,
    SitePagePublishOut,
    SitePageRevisionOut,
    SitePageRollbackIn,
    SitePageRollbackOut,
    SitePageTreeNodeOut,
    SitePageUpdateIn,
    SitePresenceHeartbeatIn,
    SitePresenceHeartbeatOut,
    SitePresenceListOut,
    SitePreviewTokenCreateIn,
    SitePreviewTokenOut,
    SiteRouteDraftSaveIn,
    SiteRouteDraftSaveOut,
    SiteRoutePublishIn,
    SiteRoutePublishOut,
    SiteRouteResolveOut,
    SiteRouteTemplateCreateIn,
    SiteRouteTemplateDeleteOut,
    SiteRouteTemplateOut,
    SiteRouteTemplateUpdateIn,
    SiteRuntimeOut,
    SiteSettingGetOut,
    SiteSettingUpsertIn,
)
from apps.api.modules.sites.service import SiteService

router = APIRouter(tags=["Sites"])
router.include_router(portal_extensions_router)
router.include_router(site_domains_router)


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
    "/sites/{site_id}/runtime",
    response_model=ResponseModel[SiteRuntimeOut],
    response_model_exclude_none=True,
    summary="Get site runtime config (theme tokens, fonts)",
)
async def get_site_runtime(
    site_id: PublicUUID,
    raw_response: FastAPIResponse,
    service: Annotated[SiteService, Depends(get_site_service)],
    mode: Annotated[Literal["public", "preview"], Query(description="Runtime mode.")] = "public",
    token: Annotated[str | None, Query(description="Preview token (required when mode=preview).")] = None,
) -> ResponseModel[SiteRuntimeOut]:
    await service.assert_preview_access_async(site_id=site_id, mode=mode, token=token)
    raw_response.headers["cache-control"] = (
        "no-store" if mode == "preview" else "public, max-age=300, stale-while-revalidate=3600"
    )
    data = await service.get_runtime(site_id=site_id, mode=mode)
    return Response.success(data=data)


@router.get(
    "/sites/{site_id}/routes/resolve",
    response_model=ResponseModel[SiteRouteResolveOut],
    response_model_exclude_none=True,
    summary="Resolve site route (pathname -> page blueprint)",
)
async def resolve_site_route(
    site_id: PublicUUID,
    path: Annotated[str, Query(..., description="Request pathname (e.g. /blog/hello).")],
    raw_response: FastAPIResponse,
    service: Annotated[SiteService, Depends(get_site_service)],
    mode: Annotated[Literal["public", "preview"], Query(description="Runtime mode.")] = "public",
    token: Annotated[str | None, Query(description="Preview token (required when mode=preview).")] = None,
) -> ResponseModel[SiteRouteResolveOut]:
    await service.assert_preview_access_async(site_id=site_id, mode=mode, token=token)
    raw_response.headers["cache-control"] = (
        "no-store" if mode == "preview" else "public, max-age=60, stale-while-revalidate=300"
    )
    data = await service.resolve_route(site_id=site_id, path=path, mode=mode)
    return Response.success(data=data)


@router.post(
    "/sites/{site_id}/preview-tokens",
    response_model=ResponseModel[SitePreviewTokenOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Create a preview token (stub)",
)
async def create_preview_token(
    site_id: PublicUUID,
    service: Annotated[SiteService, Depends(get_site_service)],
    payload: Annotated[
        SitePreviewTokenCreateIn,
        Body(description="Preview token request."),
    ] = SitePreviewTokenCreateIn(),
) -> ResponseModel[SitePreviewTokenOut]:
    data = await service.create_preview_token(site_id=site_id, ttl_seconds=payload.ttl_seconds)
    return Response.success(data=data)


@router.post(
    "/sites/{site_id}/routes/draft",
    response_model=ResponseModel[SiteRouteDraftSaveOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Save a draft page blueprint for a route (stub)",
)
async def save_site_route_draft(
    site_id: PublicUUID,
    payload: Annotated[
        SiteRouteDraftSaveIn,
        Body(description="Draft save payload."),
    ],
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SiteRouteDraftSaveOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.save_route_draft(site_id=site_id, payload=payload)
    return Response.success(data=data)


@router.post(
    "/sites/{site_id}/routes/publish",
    response_model=ResponseModel[SiteRoutePublishOut],
    response_model_exclude_none=True,
    summary="Publish a route (draft -> public)",
)
async def publish_site_route(
    site_id: PublicUUID,
    payload: Annotated[
        SiteRoutePublishIn,
        Body(description="Publish payload."),
    ],
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SiteRoutePublishOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.publish_route(site_id=site_id, payload=payload)
    return Response.success(data=data)


@router.post(
    "/sites/{site_id}/entries/draft",
    response_model=ResponseModel[SiteEntryDraftSaveOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Save a draft entry revision (v1)",
)
async def save_site_entry_draft(
    site_id: PublicUUID,
    payload: Annotated[
        SiteEntryDraftSaveIn,
        Body(description="Entry draft save payload."),
    ],
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SiteEntryDraftSaveOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.save_entry_draft(site_id=site_id, payload=payload)
    return Response.success(data=data)


@router.post(
    "/sites/{site_id}/entries/publish",
    response_model=ResponseModel[SiteEntryPublishOut],
    response_model_exclude_none=True,
    summary="Publish an entry (draft -> public)",
)
async def publish_site_entry(
    site_id: PublicUUID,
    payload: Annotated[
        SiteEntryPublishIn,
        Body(description="Entry publish payload."),
    ],
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SiteEntryPublishOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.publish_entry(site_id=site_id, payload=payload)
    return Response.success(data=data)


@router.post(
    "/sites/{site_id}/entries/unpublish",
    response_model=ResponseModel[SiteEntryUnpublishOut],
    response_model_exclude_none=True,
    summary="Unpublish an entry (published -> draft-only)",
)
async def unpublish_site_entry(
    site_id: PublicUUID,
    payload: Annotated[
        SiteEntryUnpublishIn,
        Body(description="Entry unpublish payload."),
    ],
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SiteEntryUnpublishOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.unpublish_entry(site_id=site_id, payload=payload)
    return Response.success(data=data)


@router.post(
    "/sites/{site_id}/presence/heartbeat",
    response_model=ResponseModel[SitePresenceHeartbeatOut],
    response_model_exclude_none=True,
    summary="Presence heartbeat (v1: TTL-based, Valkey-backed)",
)
async def heartbeat_presence(
    site_id: PublicUUID,
    payload: Annotated[
        SitePresenceHeartbeatIn,
        Body(description="Presence heartbeat payload."),
    ],
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SitePresenceHeartbeatOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.heartbeat_presence(site_id=site_id, payload=payload)
    return Response.success(data=data)


@router.get(
    "/sites/{site_id}/presence",
    response_model=ResponseModel[SitePresenceListOut],
    response_model_exclude_none=True,
    summary="List presence records for a document key (v1)",
)
async def list_presence(
    site_id: PublicUUID,
    doc_key: Annotated[str, Query(..., alias="docKey", description="Document key (e.g. route:/about).")],
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SitePresenceListOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.list_presence(site_id=site_id, doc_key=doc_key)
    return Response.success(data=data)


@router.get(
    "/sites/{site_id}/sitemap.xml",
    response_class=RawResponse,
    summary="Get sitemap.xml (public)",
)
async def get_sitemap_xml(
    site_id: PublicUUID,
    service: Annotated[SiteService, Depends(get_site_service)],
) -> RawResponse:
    xml = await service.get_sitemap_xml(site_id=site_id)
    return RawResponse(
        content=xml,
        media_type="application/xml",
        headers={"cache-control": "public, max-age=300"},
    )


@router.get(
    "/sites/{site_id}/settings",
    response_model=ResponseModel[SiteSettingGetOut],
    response_model_exclude_none=True,
    summary="Get a site setting (namespace-scoped)",
)
async def get_site_setting(
    site_id: PublicUUID,
    namespace: Annotated[str, Query(..., description="Setting namespace (e.g. site.runtime).")],
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SiteSettingGetOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.get_site_setting(site_id=site_id, namespace=namespace)
    return Response.success(data=data)


@router.put(
    "/sites/{site_id}/settings",
    response_model=ResponseModel[SiteSettingGetOut],
    response_model_exclude_none=True,
    summary="Upsert a site setting (namespace-scoped)",
)
async def upsert_site_setting(
    site_id: PublicUUID,
    namespace: Annotated[str, Query(..., description="Setting namespace (e.g. site.runtime).")],
    payload: Annotated[SiteSettingUpsertIn, Body(description="Upsert payload.")],
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SiteSettingGetOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.upsert_site_setting(site_id=site_id, namespace=namespace, payload=payload)
    return Response.success(data=data)


@router.get(
    "/sites/{site_id}/pages",
    response_model=ResponseModel[PageData[SitePageTreeNodeOut]],
    response_model_exclude_none=True,
    summary="List site pages as a tree (preview token required)",
)
async def list_site_pages_tree(
    site_id: PublicUUID,
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[PageData[SitePageTreeNodeOut]]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.list_pages_tree(site_id=site_id)
    return Response.success(data=data)


@router.post(
    "/sites/{site_id}/pages",
    response_model=ResponseModel[SitePageTreeNodeOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Create a site page (preview token required)",
)
async def create_site_page(
    site_id: PublicUUID,
    payload: Annotated[SitePageCreateIn, Body(description="Create payload.")],
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SitePageTreeNodeOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.create_page(site_id=site_id, payload=payload)
    return Response.success(data=data)


@router.patch(
    "/sites/{site_id}/pages/{page_id}",
    response_model=ResponseModel[SitePageTreeNodeOut],
    response_model_exclude_none=True,
    summary="Update a site page (preview token required)",
)
async def update_site_page(
    site_id: PublicUUID,
    page_id: PublicUUID,
    payload: Annotated[SitePageUpdateIn, Body(description="Update payload.")],
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SitePageTreeNodeOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.update_page(site_id=site_id, page_id=page_id, payload=payload)
    return Response.success(data=data)


@router.post(
    "/sites/{site_id}/pages/{page_id}/move",
    response_model=ResponseModel[SitePageTreeNodeOut],
    response_model_exclude_none=True,
    summary="Move/reorder a site page within the tree (preview token required)",
)
async def move_site_page(
    site_id: PublicUUID,
    page_id: PublicUUID,
    payload: Annotated[SitePageMoveIn, Body(description="Move payload.")],
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SitePageTreeNodeOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.move_page(site_id=site_id, page_id=page_id, payload=payload)
    return Response.success(data=data)


@router.delete(
    "/sites/{site_id}/pages/{page_id}",
    response_model=ResponseModel[SitePageDeleteOut],
    response_model_exclude_none=True,
    summary="Delete a site page (preview token required)",
)
async def delete_site_page(
    site_id: PublicUUID,
    page_id: PublicUUID,
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SitePageDeleteOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.delete_page(site_id=site_id, page_id=page_id)
    return Response.success(data=data)


@router.get(
    "/sites/{site_id}/route-templates",
    response_model=ResponseModel[PageData[SiteRouteTemplateOut]],
    response_model_exclude_none=True,
    summary="List route templates (preview token required)",
)
async def list_site_route_templates(
    site_id: PublicUUID,
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
    params: PageParams = Depends(get_page_params),
) -> ResponseModel[PageData[SiteRouteTemplateOut]]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.list_route_templates_paginated(site_id=site_id, params=params)
    return Response.success(data=data)


@router.post(
    "/sites/{site_id}/route-templates",
    response_model=ResponseModel[SiteRouteTemplateOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Create a route template (preview token required)",
)
async def create_site_route_template(
    site_id: PublicUUID,
    payload: Annotated[SiteRouteTemplateCreateIn, Body(description="Create payload.")],
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SiteRouteTemplateOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.create_route_template(site_id=site_id, payload=payload)
    return Response.success(data=data)


@router.patch(
    "/sites/{site_id}/route-templates/{template_id}",
    response_model=ResponseModel[SiteRouteTemplateOut],
    response_model_exclude_none=True,
    summary="Update a route template (preview token required)",
)
async def update_site_route_template(
    site_id: PublicUUID,
    template_id: PublicUUID,
    payload: Annotated[SiteRouteTemplateUpdateIn, Body(description="Update payload.")],
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SiteRouteTemplateOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.update_route_template(site_id=site_id, template_id=template_id, payload=payload)
    return Response.success(data=data)


@router.delete(
    "/sites/{site_id}/route-templates/{template_id}",
    response_model=ResponseModel[SiteRouteTemplateDeleteOut],
    response_model_exclude_none=True,
    summary="Delete a route template (preview token required)",
)
async def delete_site_route_template(
    site_id: PublicUUID,
    template_id: PublicUUID,
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SiteRouteTemplateDeleteOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.delete_route_template(site_id=site_id, template_id=template_id)
    return Response.success(data=data)


@router.get(
    "/sites/{site_id}/entry-types",
    response_model=ResponseModel[PageData[SiteEntryTypeOut]],
    response_model_exclude_none=True,
    summary="List entry types (preview token required)",
)
async def list_entry_types(
    site_id: PublicUUID,
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
    params: PageParams = Depends(get_page_params),
) -> ResponseModel[PageData[SiteEntryTypeOut]]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.list_entry_types_paginated(site_id=site_id, params=params)
    return Response.success(data=data)


@router.post(
    "/sites/{site_id}/entry-types",
    response_model=ResponseModel[SiteEntryTypeOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Create an entry type (preview token required)",
)
async def create_entry_type(
    site_id: PublicUUID,
    payload: Annotated[SiteEntryTypeCreateIn, Body(description="Create payload.")],
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SiteEntryTypeOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.create_entry_type(site_id=site_id, payload=payload)
    return Response.success(data=data)


@router.patch(
    "/sites/{site_id}/entry-types/{entry_type_id}",
    response_model=ResponseModel[SiteEntryTypeOut],
    response_model_exclude_none=True,
    summary="Update an entry type (preview token required)",
)
async def update_entry_type(
    site_id: PublicUUID,
    entry_type_id: PublicUUID,
    payload: Annotated[SiteEntryTypeUpdateIn, Body(description="Update payload.")],
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SiteEntryTypeOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.update_entry_type(site_id=site_id, entry_type_id=entry_type_id, payload=payload)
    return Response.success(data=data)


@router.delete(
    "/sites/{site_id}/entry-types/{entry_type_id}",
    response_model=ResponseModel[SiteEntryTypeDeleteOut],
    response_model_exclude_none=True,
    summary="Delete an entry type (preview token required)",
)
async def delete_entry_type(
    site_id: PublicUUID,
    entry_type_id: PublicUUID,
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SiteEntryTypeDeleteOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.delete_entry_type(site_id=site_id, entry_type_id=entry_type_id)
    return Response.success(data=data)


@router.get(
    "/sites/{site_id}/entries",
    response_model=ResponseModel[PageData[SiteEntryOut]],
    response_model_exclude_none=True,
    summary="List entries (preview token required)",
)
async def list_entries(
    site_id: PublicUUID,
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
    params: PageParams = Depends(get_page_params),
    entry_type_code: Annotated[
        str | None,
        Query(
            alias="entryTypeCode",
            description="Optional entry type code filter (e.g. blog_post).",
        ),
    ] = None,
) -> ResponseModel[PageData[SiteEntryOut]]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.list_entries_paginated(site_id=site_id, params=params, entry_type_code=entry_type_code)
    return Response.success(data=data)


@router.post(
    "/sites/{site_id}/entries",
    response_model=ResponseModel[SiteEntryOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Create an entry (preview token required)",
)
async def create_entry(
    site_id: PublicUUID,
    payload: Annotated[SiteEntryCreateIn, Body(description="Create payload.")],
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SiteEntryOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.create_entry(site_id=site_id, payload=payload)
    return Response.success(data=data)


@router.patch(
    "/sites/{site_id}/entries/{entry_id}",
    response_model=ResponseModel[SiteEntryOut],
    response_model_exclude_none=True,
    summary="Update an entry (preview token required)",
)
async def update_entry(
    site_id: PublicUUID,
    entry_id: PublicUUID,
    payload: Annotated[SiteEntryUpdateIn, Body(description="Update payload.")],
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SiteEntryOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.update_entry(site_id=site_id, entry_id=entry_id, payload=payload)
    return Response.success(data=data)


@router.delete(
    "/sites/{site_id}/entries/{entry_id}",
    response_model=ResponseModel[SiteEntryDeleteOut],
    response_model_exclude_none=True,
    summary="Delete an entry (must unpublish first; preview token required)",
)
async def delete_entry(
    site_id: PublicUUID,
    entry_id: PublicUUID,
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SiteEntryDeleteOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.delete_entry(site_id=site_id, entry_id=entry_id)
    return Response.success(data=data)


@router.post(
    "/sites/{site_id}/pages/{page_id}/revisions/rollback",
    response_model=ResponseModel[SitePageRollbackOut],
    response_model_exclude_none=True,
    summary="Rollback a page revision pointer (draft or published; preview token required)",
)
async def rollback_page_revision(
    site_id: PublicUUID,
    page_id: PublicUUID,
    payload: Annotated[SitePageRollbackIn, Body(description="Rollback payload.")],
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SitePageRollbackOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.rollback_page_revision(site_id=site_id, page_id=page_id, payload=payload)
    return Response.success(data=data)


@router.post(
    "/sites/{site_id}/entries/{entry_id}/revisions/rollback",
    response_model=ResponseModel[SiteEntryRollbackOut],
    response_model_exclude_none=True,
    summary="Rollback an entry revision pointer (draft or published; preview token required)",
)
async def rollback_entry_revision(
    site_id: PublicUUID,
    entry_id: PublicUUID,
    payload: Annotated[SiteEntryRollbackIn, Body(description="Rollback payload.")],
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SiteEntryRollbackOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.rollback_entry_revision(site_id=site_id, entry_id=entry_id, payload=payload)
    return Response.success(data=data)


@router.get(
    "/sites/{site_id}/pages/{page_id}/revisions/published",
    response_model=ResponseModel[SitePageRevisionOut],
    response_model_exclude_none=True,
    summary="Get a published page revision snapshot",
)
async def get_published_page_revision(
    site_id: PublicUUID,
    page_id: PublicUUID,
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[SitePageRevisionOut]:
    data = await service.get_page_revision(site_id=site_id, page_id=page_id, state="published")
    return Response.success(data=data)


@router.get(
    "/sites/{site_id}/pages/{page_id}/revisions/draft",
    response_model=ResponseModel[SitePageRevisionOut],
    response_model_exclude_none=True,
    summary="Get a draft page revision snapshot (preview token required)",
)
async def get_draft_page_revision(
    site_id: PublicUUID,
    page_id: PublicUUID,
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SitePageRevisionOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.get_page_revision(site_id=site_id, page_id=page_id, state="draft")
    return Response.success(data=data)


@router.post(
    "/sites/{site_id}/pages/{page_id}/revisions/draft",
    response_model=ResponseModel[SitePageDraftSaveOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Save a draft page revision (preview token required)",
)
async def save_page_revision_draft(
    site_id: PublicUUID,
    page_id: PublicUUID,
    payload: Annotated[SitePageDraftSaveIn, Body(description="Page draft save payload.")],
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SitePageDraftSaveOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.save_page_draft(site_id=site_id, page_id=page_id, payload=payload)
    return Response.success(data=data)


@router.post(
    "/sites/{site_id}/pages/{page_id}/revisions/publish",
    response_model=ResponseModel[SitePagePublishOut],
    response_model_exclude_none=True,
    summary="Publish a page revision (draft -> public; preview token required)",
)
async def publish_page_revision(
    site_id: PublicUUID,
    page_id: PublicUUID,
    payload: Annotated[SitePagePublishIn, Body(description="Page publish payload.")],
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SitePagePublishOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.publish_page(site_id=site_id, page_id=page_id, payload=payload)
    return Response.success(data=data)


@router.get(
    "/sites/{site_id}/entries/{entry_id}/revisions/published",
    response_model=ResponseModel[SiteEntryRevisionOut],
    response_model_exclude_none=True,
    summary="Get a published entry revision snapshot",
)
async def get_published_entry_revision(
    site_id: PublicUUID,
    entry_id: PublicUUID,
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[SiteEntryRevisionOut]:
    data = await service.get_entry_revision(site_id=site_id, entry_id=entry_id, state="published")
    return Response.success(data=data)


@router.get(
    "/sites/{site_id}/entries/{entry_id}/revisions/draft",
    response_model=ResponseModel[SiteEntryRevisionOut],
    response_model_exclude_none=True,
    summary="Get a draft entry revision snapshot (preview token required)",
)
async def get_draft_entry_revision(
    site_id: PublicUUID,
    entry_id: PublicUUID,
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SiteEntryRevisionOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.get_entry_revision(site_id=site_id, entry_id=entry_id, state="draft")
    return Response.success(data=data)
