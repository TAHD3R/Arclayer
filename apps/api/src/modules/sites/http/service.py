from __future__ import annotations

from fastapi import Depends, Request

from src.config import Settings, get_settings
from src.modules.sites.service import SiteService
from src.platform.cache.valkey import get_valkey


def get_site_service(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> SiteService:
    try:
        valkey = get_valkey(request)
    except RuntimeError:
        valkey = None
    return SiteService(settings, valkey=valkey)
