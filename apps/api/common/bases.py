from __future__ import annotations

from apps.api.config import Settings
from apps.api.core.logging import get_logger


class BaseRepository:
    def __init__(self) -> None:
        self.logger = get_logger(self.__class__.__module__)


class BaseService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.logger = get_logger(self.__class__.__module__)
