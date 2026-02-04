from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.transactions import in_transaction

from apps.api.config import Settings
from apps.api.core.logging import get_logger


class BaseService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.logger = get_logger(self.__class__.__module__)

    @asynccontextmanager
    async def tx(self) -> AsyncIterator[BaseDBAsyncClient]:
        async with in_transaction() as conn:
            yield conn
