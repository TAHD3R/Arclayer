from __future__ import annotations

import time
from typing import cast
from uuid import UUID

from apps.api.src.common.protocols.tortoise import HasWorkspaceId
from apps.api.src.common.services.base import BaseService
from apps.api.src.core.exceptions import Conflict
from apps.api.src.modules.sites.publishing.config.service import PublishingConfigService
from apps.api.src.modules.sites.repository import SitesRepository
from apps.api.src.modules.sites.schema import (
    SiteRouteDraftSaveIn,
    SiteRouteDraftSaveOut,
    SiteRoutePublishIn,
    SiteRoutePublishOut,
)
from apps.api.src.modules.sites.shared.service import normalize_path as normalize_site_path


class PublishingRoutesDraftsService(BaseService):
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

    async def save_route_draft(
        self,
        *,
        site_id: UUID,
        payload: SiteRouteDraftSaveIn,
    ) -> SiteRouteDraftSaveOut:
        pathname = normalize_site_path(payload.path)
        now_ms = int(time.time() * 1000)

        if not self.settings.database.enabled:
            raise Conflict("Route drafts require database storage", error="ROUTE_DRAFT_DB_REQUIRED")

        site = await self._repo.get_site_by_id(site_id=site_id)
        retain_last_n = await self._config.read_workspace_draft_retention_max_revisions(
            workspace_id=UUID(str(cast(HasWorkspaceId, site).workspace_id)),
        )

        deps = await self._config.build_revision_deps(
            site_id=site_id,
            deps=(payload.deps if isinstance(payload.deps, dict) else None),
        )

        next_rev, saved_at_ms = await self._repo.save_page_draft_by_path(
            site_id=site_id,
            path=pathname,
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
            created_by_user_id=None,
            retain_last_n=retain_last_n,
        )
        self.logger.info(
            "Saved page draft",
            site_id=str(site_id),
            path=str(pathname),
            revision=int(next_rev),
            expected_revision=payload.expected_revision,
        )

        return SiteRouteDraftSaveOut(
            site_id=site_id, path=pathname, revision=next_rev, saved_at_ms=saved_at_ms or now_ms
        )

    async def publish_route(
        self,
        *,
        site_id: UUID,
        payload: SiteRoutePublishIn,
    ) -> SiteRoutePublishOut:
        pathname = normalize_site_path(payload.path)
        now_ms = int(time.time() * 1000)

        if not self.settings.database.enabled:
            raise Conflict("Publishing requires database storage", error="PUBLISH_DB_REQUIRED")

        await self._repo.get_site_by_id(site_id=site_id)
        rev, published_at_ms = await self._repo.publish_page_by_path(
            site_id=site_id,
            path=pathname,
            revision=payload.revision,
            updated_by_user_id=None,
        )
        self.logger.info(
            "Published page",
            site_id=str(site_id),
            path=str(pathname),
            revision=int(rev),
        )
        return SiteRoutePublishOut(
            site_id=site_id,
            path=pathname,
            revision=rev,
            published_at_ms=published_at_ms or now_ms,
        )
