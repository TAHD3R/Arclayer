from __future__ import annotations

from fastapi import Depends

from src.config import Settings, get_settings
from src.modules.sites.search.service import ContentSearchService


def get_content_search_service(settings: Settings = Depends(get_settings)) -> ContentSearchService:
    return ContentSearchService(settings)
