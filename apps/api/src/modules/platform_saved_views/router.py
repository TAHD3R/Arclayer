from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from src.common.types.public_uuid import PublicUUID
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.platform_identity.http import get_current_platform_session
from src.modules.platform_identity.session_schema import PlatformSessionPrincipal
from src.modules.platform_saved_views.composition import get_platform_saved_views_service
from src.modules.platform_saved_views.schema import (
    PlatformSavedViewCreateCommand,
    PlatformSavedViewDeleteCommand,
    PlatformSavedViewOut,
    PlatformSavedViewReadOut,
    PlatformSavedViewUpdateCommand,
)
from src.modules.platform_saved_views.service import PlatformSavedViewsService

router = APIRouter(prefix="/saved-views", tags=["platform.saved-views"])


@router.get(
    "/capabilities/{capability_id}",
    response_model=ResponseModel[tuple[PlatformSavedViewReadOut, ...]],
    response_model_exclude_none=True,
    summary="List the current Platform actor's saved views for one capability",
)
async def list_saved_views(
    capability_id: str,
    actor: Annotated[PlatformSessionPrincipal, Depends(get_current_platform_session)],
    service: Annotated[PlatformSavedViewsService, Depends(get_platform_saved_views_service)],
) -> ResponseModel[tuple[PlatformSavedViewReadOut, ...]]:
    return ApiResponse.success(data=await service.list(actor=actor, capability_id=capability_id))


@router.post(
    "/capabilities/{capability_id}",
    response_model=ResponseModel[PlatformSavedViewOut],
    response_model_exclude_none=True,
    summary="Create an actor-private Platform saved view",
)
async def create_saved_view(
    capability_id: str,
    payload: PlatformSavedViewCreateCommand,
    actor: Annotated[PlatformSessionPrincipal, Depends(get_current_platform_session)],
    service: Annotated[PlatformSavedViewsService, Depends(get_platform_saved_views_service)],
) -> ResponseModel[PlatformSavedViewOut]:
    return ApiResponse.success(data=await service.create(actor=actor, capability_id=capability_id, draft=payload))


@router.get(
    "/{view_id}",
    response_model=ResponseModel[PlatformSavedViewReadOut],
    response_model_exclude_none=True,
    summary="Get one actor-private Platform saved view",
)
async def get_saved_view(
    view_id: PublicUUID,
    actor: Annotated[PlatformSessionPrincipal, Depends(get_current_platform_session)],
    service: Annotated[PlatformSavedViewsService, Depends(get_platform_saved_views_service)],
) -> ResponseModel[PlatformSavedViewReadOut]:
    return ApiResponse.success(data=await service.get(actor=actor, view_id=view_id))


@router.patch(
    "/{view_id}",
    response_model=ResponseModel[PlatformSavedViewOut],
    response_model_exclude_none=True,
    summary="Revision-check and update an actor-private Platform saved view",
)
async def update_saved_view(
    view_id: PublicUUID,
    payload: PlatformSavedViewUpdateCommand,
    actor: Annotated[PlatformSessionPrincipal, Depends(get_current_platform_session)],
    service: Annotated[PlatformSavedViewsService, Depends(get_platform_saved_views_service)],
) -> ResponseModel[PlatformSavedViewOut]:
    return ApiResponse.success(
        data=await service.update(
            actor=actor, view_id=view_id, expected_revision=payload.expected_revision, draft=payload
        )
    )


@router.delete(
    "/{view_id}",
    response_model=ResponseModel[None],
    response_model_exclude_none=True,
    summary="Revision-check and delete an actor-private Platform saved view",
)
async def delete_saved_view(
    view_id: PublicUUID,
    payload: PlatformSavedViewDeleteCommand,
    actor: Annotated[PlatformSessionPrincipal, Depends(get_current_platform_session)],
    service: Annotated[PlatformSavedViewsService, Depends(get_platform_saved_views_service)],
) -> ResponseModel[None]:
    await service.delete(actor=actor, view_id=view_id, expected_revision=payload.expected_revision)
    return ApiResponse.success()
