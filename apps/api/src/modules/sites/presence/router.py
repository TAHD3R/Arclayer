from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Body, Depends, Query

from apps.api.src.common.types.public_uuid import PublicUUID
from apps.api.src.core.http.response import Response, ResponseModel
from apps.api.src.modules.sites.http.service import get_site_service
from apps.api.src.modules.sites.schema import (
    SitePresenceHeartbeatIn,
    SitePresenceHeartbeatOut,
    SitePresenceListOut,
)
from apps.api.src.modules.sites.service import SiteService

router = APIRouter(tags=["Sites"])


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
