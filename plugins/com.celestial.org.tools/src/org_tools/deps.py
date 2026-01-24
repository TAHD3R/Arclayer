from __future__ import annotations

from fastapi import Depends

from apps.api.config import Settings, get_settings
from org_tools.services import OrgToolsService


def get_org_tools_service(settings: Settings = Depends(get_settings)) -> OrgToolsService:
    return OrgToolsService(settings)
