from __future__ import annotations

import secrets
import time
from typing import Literal
from uuid import UUID

from src.common.services import BaseService
from src.core.exceptions import Conflict, Forbidden, ServiceUnavailable
from src.models.sites.site import SiteRecord
from src.modules.sites import schema as sites_schema
from src.modules.sites.content.service import SiteContentService
from src.modules.sites.publishing.service import SitePublishingService
from src.modules.sites.repository import SitesRepository
from src.modules.sites.runtime.config.service import SiteRuntimeConfigMixin
from src.modules.sites.runtime.context.service import SiteRuntimeContextMixin
from src.modules.sites.runtime_access.service import SiteContentPublishingAccessMixin
from src.modules.sites.settings.service import SiteSettingsMixin
from src.modules.sites.stores.service import PresenceStore, PreviewTokenStore
from src.platform.cache.valkey import ValkeyClientLike

MIN_PREVIEW_TOKEN_TTL_SECONDS = 60
MAX_PREVIEW_TOKEN_TTL_SECONDS = 60 * 60


class SiteService(
    BaseService,
    SiteRuntimeContextMixin,
    SiteRuntimeConfigMixin,
    SiteSettingsMixin,
    SiteContentPublishingAccessMixin,
):
    """
    Sites service (Portal consumption + editor/management APIs).

    Notes:
    - Portal should not run as a standalone app without backend dependencies.
    - Preview token and presence are Valkey-backed (TTL).
    """

    def __init__(
        self,
        settings,
        valkey: ValkeyClientLike | None = None,
        *,
        repo: SitesRepository | None = None,
    ) -> None:
        super().__init__(settings)
        self._repo = repo or SitesRepository()
        self._preview_tokens = PreviewTokenStore(valkey) if valkey is not None else None
        self._presence = PresenceStore(valkey) if valkey is not None else None

        self._content = SiteContentService(
            settings,
            repo=self._repo,
        )
        self._publishing = SitePublishingService(
            settings,
            repo=self._repo,
            presence=self._presence,
        )

    async def assert_preview_access_async(
        self, *, site_id: UUID, mode: Literal["public", "preview"], token: str | None
    ) -> None:
        if mode != "preview":
            return
        if token is None or not token.strip():
            raise Forbidden("Preview token required", error="PREVIEW_TOKEN_REQUIRED")
        if self._preview_tokens is None:
            raise ServiceUnavailable("Preview token store unavailable", error="PREVIEW_TOKEN_STORE_UNAVAILABLE")
        ok = await self._preview_tokens.validate(site_id=site_id, token=token)
        if not ok:
            raise Forbidden("Invalid preview token", error="PREVIEW_TOKEN_INVALID")

    async def get_site_by_id(self, *, site_id: UUID) -> SiteRecord:
        if not self.settings.database.enabled:
            raise Conflict("Sites require database storage", error="SITE_DB_REQUIRED")
        return await self._repo.get_site_by_id(site_id=site_id)

    async def get_site_by_runtime_id(self, *, runtime_id: UUID) -> SiteRecord:
        if not self.settings.database.enabled:
            raise Conflict("Sites require database storage", error="SITE_DB_REQUIRED")
        return await self._repo.get_site_by_runtime_id(runtime_id=runtime_id)

    async def create_preview_token(self, *, site_id: UUID, ttl_seconds: int = 600) -> sites_schema.SitePreviewTokenOut:
        if not self.settings.database.enabled:
            raise Conflict("Preview tokens require database storage", error="PREVIEW_TOKEN_DB_REQUIRED")
        if self._preview_tokens is None:
            raise ServiceUnavailable("Preview token store unavailable", error="PREVIEW_TOKEN_STORE_UNAVAILABLE")

        await self._repo.get_site_by_id(site_id=site_id)

        ttl = int(ttl_seconds)
        if ttl < MIN_PREVIEW_TOKEN_TTL_SECONDS:
            ttl = MIN_PREVIEW_TOKEN_TTL_SECONDS
        if ttl > MAX_PREVIEW_TOKEN_TTL_SECONDS:
            ttl = MAX_PREVIEW_TOKEN_TTL_SECONDS

        token = secrets.token_urlsafe(24)
        expires_at_ms = int((time.time() + ttl) * 1000)
        await self._preview_tokens.issue(site_id=site_id, token=token, ttl_seconds=ttl, expires_at_ms=expires_at_ms)
        return sites_schema.SitePreviewTokenOut(site_id=site_id, token=token, expires_at_ms=expires_at_ms)
