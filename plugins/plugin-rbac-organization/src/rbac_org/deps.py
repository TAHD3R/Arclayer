from __future__ import annotations

from fastapi import Depends

from apps.api.config import Settings, get_settings
from rbac_org.services import RBACOrgService


def get_rbac_org_service(settings: Settings = Depends(get_settings)) -> RBACOrgService:
    return RBACOrgService(settings)
