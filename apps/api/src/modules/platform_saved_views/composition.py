from __future__ import annotations

from typing import Annotated

from fastapi import Depends

from src.config import Settings, get_settings
from src.modules.platform_identity.http import get_platform_identity_repository
from src.modules.platform_identity.repository import PlatformIdentityRepository
from src.modules.platform_saved_views.service import PlatformSavedViewsService


def get_platform_saved_views_service(
    settings: Annotated[Settings, Depends(get_settings)],
    identity_repository: Annotated[PlatformIdentityRepository, Depends(get_platform_identity_repository)],
) -> PlatformSavedViewsService:
    return PlatformSavedViewsService(settings=settings, identity_repository=identity_repository)
