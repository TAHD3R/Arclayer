from __future__ import annotations

from fastapi import Depends, Request

from apps.api.src.config import Settings, get_settings
from apps.api.src.infra.cache.valkey import get_valkey
from apps.api.src.modules.sites.service import SiteService


def get_site_service(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> SiteService:
    try:
        valkey = get_valkey(request)
    except RuntimeError:
        valkey = None
    return SiteService(settings, valkey=valkey)
