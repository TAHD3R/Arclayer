from __future__ import annotations

"""
Publishing entries service.
"""

import time
from typing import cast
from uuid import UUID

from apps.api.src.common.protocols.tortoise import HasWorkspaceId
from apps.api.src.common.services.base import BaseService
from apps.api.src.core.exceptions import Conflict
from apps.api.src.modules.sites.publishing.config.service import PublishingConfigService
from apps.api.src.modules.sites.repository import SitesRepository
from apps.api.src.modules.sites.schema import (
    SiteEntryDraftSaveIn,
    SiteEntryDraftSaveOut,
    SiteEntryPublishIn,
    SiteEntryPublishOut,
)


class PublishingEntriesService(BaseService):
    def __init__(
        self,
        settings,
        *,
        repo: SitesRepository,
        config: PublishingConfigService,
    ) -> None:
        super().__init__(settings)
        self._repo = repo
        self._config = config

    async def save_entry_draft(
        self,
        *,
        site_id: UUID,
        payload: SiteEntryDraftSaveIn,
    ) -> SiteEntryDraftSaveOut:
        slug = (payload.slug or "").strip()
        now_ms = int(time.time() * 1000)

        if not self.settings.database.enabled:
            raise Conflict("Entry drafts require database storage", error="ENTRY_DRAFT_DB_REQUIRED")

        site = await self._repo.get_site_by_id(site_id=site_id)
        retain_last_n = await self._config.read_workspace_draft_retention_max_revisions(
            workspace_id=UUID(str(cast(HasWorkspaceId, site).workspace_id)),
        )
        et = await self._repo.get_entry_type_by_code(site_id=site_id, code=payload.entry_type_code)

        deps = await self._config.build_revision_deps(
            site_id=site_id,
            deps=(payload.deps if isinstance(payload.deps, dict) else None),
        )

        entry_id, rev, saved_at_ms = await self._repo.save_entry_draft_by_slug(
            site_id=site_id,
            entry_type_id=UUID(str(et.id)),
            slug=slug,
            page_blueprint=payload.page_blueprint,
            data=(payload.data if isinstance(payload.data, dict) else None),
            meta=(payload.meta if isinstance(payload.meta, dict) else None),
            style_overrides=(payload.style_overrides if isinstance(payload.style_overrides, dict) else None),
            variant_id=(
                payload.variant_id.strip()
                if isinstance(payload.variant_id, str) and payload.variant_id.strip()
                else None
            ),
            deps=deps,
            expected_revision=payload.expected_revision,
            created_by_user_id=None,
            retain_last_n=retain_last_n,
        )
        self.logger.info(
            "Saved entry draft",
            site_id=str(site_id),
            entry_id=str(entry_id),
            entry_type_code=str(payload.entry_type_code),
            slug=str(slug),
            revision=int(rev),
            expected_revision=payload.expected_revision,
        )
        return SiteEntryDraftSaveOut(
            site_id=site_id,
            entry_id=entry_id,
            entry_type_code=payload.entry_type_code,
            slug=slug,
            revision=rev,
            saved_at_ms=saved_at_ms or now_ms,
        )

    async def publish_entry(
        self,
        *,
        site_id: UUID,
        payload: SiteEntryPublishIn,
    ) -> SiteEntryPublishOut:
        slug = (payload.slug or "").strip()
        now_ms = int(time.time() * 1000)

        if not self.settings.database.enabled:
            raise Conflict("Publishing requires database storage", error="PUBLISH_DB_REQUIRED")

        await self._repo.get_site_by_id(site_id=site_id)
        et = await self._repo.get_entry_type_by_code(site_id=site_id, code=payload.entry_type_code)
        entry_id, rev, published_at_ms = await self._repo.publish_entry_by_slug(
            site_id=site_id,
            entry_type_id=UUID(str(et.id)),
            slug=slug,
            revision=payload.revision,
        )
        self.logger.info(
            "Published entry",
            site_id=str(site_id),
            entry_id=str(entry_id),
            entry_type_code=str(payload.entry_type_code),
            slug=str(slug),
            revision=int(rev),
        )
        return SiteEntryPublishOut(
            site_id=site_id,
            entry_id=entry_id,
            entry_type_code=payload.entry_type_code,
            slug=slug,
            revision=rev,
            published_at_ms=published_at_ms or now_ms,
        )
