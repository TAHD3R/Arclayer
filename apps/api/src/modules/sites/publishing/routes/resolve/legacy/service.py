from __future__ import annotations

from typing import Literal
from uuid import UUID

from apps.api.src.common.services.base import BaseService
from apps.api.src.core.exceptions import ServiceUnavailable
from apps.api.src.modules.sites.publishing.includes.service import PublishingIncludesService
from apps.api.src.modules.sites.repository import SitesRepository
from apps.api.src.modules.sites.schema import (
    SitePrimaryEntryOut,
    SiteResolvedPageMetaOut,
    SiteRouteDataSourcesOut,
    SiteRouteMatchOut,
    SiteRouteResolveOut,
)


class LegacyPageRouteResolver(BaseService):
    def __init__(
        self,
        settings,
        *,
        repo: SitesRepository,
        includes: PublishingIncludesService,
    ) -> None:
        super().__init__(settings)
        self._repo = repo
        self._includes = includes

    async def resolve(
        self,
        *,
        site_id: UUID,
        pathname: str,
        mode: Literal["public", "preview"],
    ) -> SiteRouteResolveOut | None:
        page = await self._repo.get_page_by_path(site_id=site_id, path=pathname)
        if page is None:
            return None

        page_meta = (
            SiteResolvedPageMetaOut(
                title=(page.title if isinstance(page.title, str) and page.title.strip() else None),
                description=(
                    page.description if isinstance(page.description, str) and page.description.strip() else None
                ),
            )
            if (
                (isinstance(page.title, str) and page.title.strip())
                or (isinstance(page.description, str) and page.description.strip())
            )
            else None
        )

        draft_rev = int(page.draft_rev or 0)
        published_rev = int(page.published_rev or 0)
        use_rev = published_rev if mode == "public" else (draft_rev or published_rev)
        state: Literal["draft", "published"] | None = None
        if use_rev:
            state = "published" if mode == "public" else ("draft" if draft_rev else "published")
        if use_rev:
            rec = await self._repo.get_page_revision(page_id=UUID(str(page.id)), rev=int(use_rev))
            if rec is not None:
                doc = await self._includes.load_page_blueprint_from_revision(rec)
                if doc is None:
                    raise ServiceUnavailable("Failed to load page blueprint", error="PAGE_BLUEPRINT_INVALID")

                includes, warnings = await self._includes.resolve_content_refs(document=doc, site_id=site_id, mode=mode)
                return SiteRouteResolveOut(
                    match=SiteRouteMatchOut(
                        kind="page",
                        params={},
                        page_id=UUID(str(page.id)),
                        variant_id=(str(rec.variant_id) if rec.variant_id else None),
                        revision=int(use_rev),
                        revision_state=state,
                        draft_revision=draft_rev,
                        published_revision=(published_rev if published_rev else None),
                    ),
                    pageMeta=page_meta,
                    pageBlueprint=doc,
                    dataSources=SiteRouteDataSourcesOut(
                        primaryEntry=SitePrimaryEntryOut(
                            id=UUID(str(page.id)),
                            data={
                                "fields": {
                                    **(
                                        {"title": page.title.strip()}
                                        if isinstance(page.title, str) and page.title.strip()
                                        else {}
                                    ),
                                    **(
                                        {"description": page.description.strip()}
                                        if isinstance(page.description, str) and page.description.strip()
                                        else {}
                                    ),
                                }
                            },
                        )
                    ),
                    includes=includes or None,
                    warnings=warnings or None,
                )

        if mode == "preview":
            return SiteRouteResolveOut(
                match=SiteRouteMatchOut(
                    kind="page",
                    params={},
                    page_id=UUID(str(page.id)),
                    revision=None,
                    revision_state=None,
                    draft_revision=draft_rev,
                    published_revision=published_rev or None,
                ),
                pageMeta=page_meta,
                pageBlueprint=self._includes.create_empty_page_blueprint(),
            )
        return SiteRouteResolveOut(match=SiteRouteMatchOut(kind="not_found"), pageBlueprint=None)
