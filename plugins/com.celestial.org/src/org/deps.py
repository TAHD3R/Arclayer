from __future__ import annotations

from fastapi import Depends

from apps.api.config import Settings, get_settings
from org.services import OrgService


def get_org_service(settings: Settings = Depends(get_settings)) -> OrgService:
    return OrgService(settings)
