from __future__ import annotations

"""
Publishing pages service.
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
    SitePageDraftSaveIn,
    SitePageDraftSaveOut,
    SitePagePublishIn,
    SitePagePublishOut,
    SitePageUnpublishOut,
)


class PublishingPagesService(BaseService):
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

    async def save_page_draft(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        payload: SitePageDraftSaveIn,
        actor_user_id: UUID | None,
    ) -> SitePageDraftSaveOut:
        """
        Save a page draft by page id (preferred editor entrypoint).
        """

        now_ms = int(time.time() * 1000)

        if not self.settings.database.enabled:
            raise Conflict("Page drafts require database storage", error="PAGE_DRAFT_DB_REQUIRED")

        site = await self._repo.get_site_by_id(site_id=site_id)
        retain_last_n = await self._config.read_workspace_draft_retention_max_revisions(
            workspace_id=UUID(str(cast(HasWorkspaceId, site).workspace_id)),
        )

        deps = await self._config.build_revision_deps(
            site_id=site_id,
            deps=(payload.deps if isinstance(payload.deps, dict) else None),
        )

        path, revision, saved_at_ms = await self._repo.save_page_draft_by_id(
            site_id=site_id,
            page_id=page_id,
            page_blueprint=payload.page_blueprint,
            meta=(payload.meta if isinstance(payload.meta, dict) else None),
            style_overrides=(payload.style_overrides if isinstance(payload.style_overrides, dict) else None),
            variant_id=(
                payload.variant_id.strip()
                if isinstance(payload.variant_id, str) and payload.variant_id.strip()
                else None
            ),
            deps=deps,
            expected_revision=payload.expected_revision,
            created_by_user_id=actor_user_id,
            retain_last_n=retain_last_n,
        )

        self.logger.info(
            "Saved page draft",
            site_id=str(site_id),
            page_id=str(page_id),
            path=str(path),
            revision=int(revision),
            expected_revision=payload.expected_revision,
        )

        return SitePageDraftSaveOut(
            site_id=site_id,
            page_id=page_id,
            path=path,
            revision=revision,
            saved_at_ms=saved_at_ms or now_ms,
        )

    async def publish_page(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        payload: SitePagePublishIn,
        actor_user_id: UUID | None,
    ) -> SitePagePublishOut:
        """
        Publish a page by page id (preferred editor entrypoint).
        """

        now_ms = int(time.time() * 1000)

        if not self.settings.database.enabled:
            raise Conflict("Publishing requires database storage", error="PUBLISH_DB_REQUIRED")

        await self._repo.get_site_by_id(site_id=site_id)
        path, revision, published_at_ms = await self._repo.publish_page_by_id(
            site_id=site_id,
            page_id=page_id,
            revision=payload.revision,
            updated_by_user_id=actor_user_id,
        )

        self.logger.info(
            "Published page",
            site_id=str(site_id),
            page_id=str(page_id),
            path=str(path),
            revision=int(revision),
        )

        return SitePagePublishOut(
            site_id=site_id,
            page_id=page_id,
            path=path,
            revision=revision,
            published_at_ms=published_at_ms or now_ms,
        )

    async def unpublish_page(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        actor_user_id: UUID | None,
    ) -> SitePageUnpublishOut:
        """
        Unpublish a page (published -> draft-only).

        Notes:
        - Idempotent: calling unpublish on an already-unpublished page is safe.
        - Does not modify draft pointer or create a new revision.
        """

        now_ms = int(time.time() * 1000)

        if not self.settings.database.enabled:
            raise Conflict("Publishing requires database storage", error="PUBLISH_DB_REQUIRED")

        await self._repo.get_site_by_id(site_id=site_id)
        path, unpublished_at_ms = await self._repo.unpublish_page_by_id(
            site_id=site_id,
            page_id=page_id,
            updated_by_user_id=actor_user_id,
        )

        self.logger.info(
            "Unpublished page",
            site_id=str(site_id),
            page_id=str(page_id),
            path=str(path),
        )

        return SitePageUnpublishOut(
            site_id=site_id,
            page_id=page_id,
            path=path,
            unpublished_at_ms=unpublished_at_ms or now_ms,
        )
