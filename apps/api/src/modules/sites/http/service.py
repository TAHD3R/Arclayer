from __future__ import annotations

from fastapi import Depends, Request

from src.config import Settings, get_settings
from src.infra.cache.valkey import get_valkey
from src.modules.sites.service import SiteService


def get_site_service(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> SiteService:
    try:
        valkey = get_valkey(request)
    except RuntimeError:
        valkey = None
    return SiteService(settings, valkey=valkey)
