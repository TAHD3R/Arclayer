from __future__ import annotations

from apps.api.core.logging import get_logger


class BaseRepository:
    def __init__(self) -> None:
        self.logger = get_logger(self.__class__.__module__)
