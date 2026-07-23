from __future__ import annotations

from contextlib import AbstractAsyncContextManager
from typing import Any, Protocol
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.email.provider import SendResult
from src.common.types.json_types import JsonObject
from src.config import Settings
from src.modules.analytics.audit import ActivityAuditPayload


class EmailTemplateRepositoryProtocol(Protocol):
    async def list_records(self) -> list[Any]: ...

    def transaction(self) -> AbstractAsyncContextManager[BaseDBAsyncClient | None]: ...

    async def get(
        self,
        template_id: UUID,
        *,
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> Any | None: ...

    async def create(self, *, data: dict[str, Any], conn: BaseDBAsyncClient | None = None) -> Any: ...

    async def update_fields(
        self,
        instance: Any,
        *,
        fields: dict[str, Any],
        conn: BaseDBAsyncClient | None = None,
    ) -> Any: ...

    async def delete(self, *, id: UUID, conn: BaseDBAsyncClient | None = None) -> Any: ...

    async def count_active_references(self, *, key: str, locale: str) -> int: ...

    async def create_revision(
        self,
        *,
        data: dict[str, Any],
        conn: BaseDBAsyncClient | None = None,
    ) -> Any: ...

    async def list_revisions(
        self,
        *,
        key: str,
        locale: str | None,
        offset: int,
        limit: int,
    ) -> tuple[list[Any], int]: ...

    async def get_revision(self, revision_id: UUID) -> Any | None: ...

    async def list_revision_actors(self, user_ids: set[UUID]) -> dict[UUID, Any]: ...


class ActivityWriter(Protocol):
    async def __call__(
        self,
        *,
        settings: Settings,
        payload: ActivityAuditPayload,
        conn: BaseDBAsyncClient | None = None,
    ) -> Any: ...


class EmailTemplateSender(Protocol):
    async def send_template_version(
        self,
        *,
        recipient: str,
        template_key: str,
        template_version: int,
        locale: str,
        variables: JsonObject,
        idempotency_key: str,
    ) -> SendResult: ...
