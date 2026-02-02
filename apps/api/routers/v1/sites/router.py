from __future__ import annotations

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Body, Depends, Query, Request, status
from fastapi.responses import Response as RawResponse

from apps.api.config import Settings, get_settings
from apps.api.core.http.response import Response, ResponseModel
from apps.api.infra.cache.valkey import get_valkey
from apps.api.routers.v1.sites.schema import (
    SiteEntryDraftSaveIn,
    SiteEntryDraftSaveOut,
    SiteEntryPublishIn,
    SiteEntryPublishOut,
    SiteEntryRevisionOut,
    SitePageRevisionOut,
    SitePresenceHeartbeatIn,
    SitePresenceHeartbeatOut,
    SitePresenceListOut,
    SitePreviewTokenCreateIn,
    SitePreviewTokenOut,
    SiteResolveOut,
    SiteRouteDraftSaveIn,
    SiteRouteDraftSaveOut,
    SiteRoutePublishIn,
    SiteRoutePublishOut,
    SiteRouteResolveOut,
    SiteRuntimeOut,
    SiteSettingGetOut,
    SiteSettingUpsertIn,
)
from apps.api.routers.v1.sites.service import SiteService

router = APIRouter(tags=["Sites"])


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
    "/sites/resolve",
    response_model=ResponseModel[SiteResolveOut],
    response_model_exclude_none=True,
    summary="Resolve site by request host",
)
async def resolve_site(
    host: Annotated[str, Query(..., description="Request host (e.g. example.com).")],
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[SiteResolveOut]:
    data = await service.resolve_site(host=host)
    return Response.success(data=data)


@router.get(
    "/sites/{site_id}/runtime",
    response_model=ResponseModel[SiteRuntimeOut],
    response_model_exclude_none=True,
    summary="Get site runtime config (theme tokens, fonts)",
)
async def get_site_runtime(
    site_id: str,
    service: Annotated[SiteService, Depends(get_site_service)],
    mode: Annotated[Literal["public", "preview"], Query(description="Runtime mode.")] = "public",
    token: Annotated[str | None, Query(description="Preview token (required when mode=preview).")] = None,
) -> ResponseModel[SiteRuntimeOut]:
    await service.assert_preview_access_async(site_id=site_id, mode=mode, token=token)
    data = await service.get_runtime(site_id=site_id, mode=mode)
    return Response.success(data=data)


@router.get(
    "/sites/{site_id}/routes/resolve",
    response_model=ResponseModel[SiteRouteResolveOut],
    response_model_exclude_none=True,
    summary="Resolve site route (pathname -> document)",
)
async def resolve_site_route(
    site_id: str,
    path: Annotated[str, Query(..., description="Request pathname (e.g. /blog/hello).")],
    service: Annotated[SiteService, Depends(get_site_service)],
    mode: Annotated[Literal["public", "preview"], Query(description="Runtime mode.")] = "public",
    token: Annotated[str | None, Query(description="Preview token (required when mode=preview).")] = None,
) -> ResponseModel[SiteRouteResolveOut]:
    await service.assert_preview_access_async(site_id=site_id, mode=mode, token=token)
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
    site_id: str,
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
    summary="Save a draft document for a route (stub)",
)
async def save_site_route_draft(
    site_id: str,
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
    site_id: str,
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
    site_id: str,
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
    site_id: str,
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
    "/sites/{site_id}/presence/heartbeat",
    response_model=ResponseModel[SitePresenceHeartbeatOut],
    response_model_exclude_none=True,
    summary="Presence heartbeat (v1: TTL-based, Valkey-backed)",
)
async def heartbeat_presence(
    site_id: str,
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
    summary="List presence records for a document (v1)",
)
async def list_presence(
    site_id: str,
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
    site_id: str,
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
    site_id: str,
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
    site_id: str,
    namespace: Annotated[str, Query(..., description="Setting namespace (e.g. site.runtime).")],
    payload: Annotated[SiteSettingUpsertIn, Body(description="Upsert payload.")],
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SiteSettingGetOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.upsert_site_setting(site_id=site_id, namespace=namespace, payload=payload)
    return Response.success(data=data)


@router.get(
    "/sites/{site_id}/pages/{page_id}/revisions/published",
    response_model=ResponseModel[SitePageRevisionOut],
    response_model_exclude_none=True,
    summary="Get a published page revision snapshot",
)
async def get_published_page_revision(
    site_id: str,
    page_id: UUID,
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
    site_id: str,
    page_id: UUID,
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SitePageRevisionOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.get_page_revision(site_id=site_id, page_id=page_id, state="draft")
    return Response.success(data=data)


@router.get(
    "/sites/{site_id}/entries/{entry_id}/revisions/published",
    response_model=ResponseModel[SiteEntryRevisionOut],
    response_model_exclude_none=True,
    summary="Get a published entry revision snapshot",
)
async def get_published_entry_revision(
    site_id: str,
    entry_id: UUID,
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
    site_id: str,
    entry_id: UUID,
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SiteEntryRevisionOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.get_entry_revision(site_id=site_id, entry_id=entry_id, state="draft")
    return Response.success(data=data)
