from __future__ import annotations

from typing import Literal
from uuid import UUID

from src.common.services import BaseService
from src.common.utils.public_ids import PublicIdDecodeError, decode_public_id
from src.core.exceptions import ServiceUnavailable
from src.modules.sites.design.schema import PageBlueprint
from src.modules.sites.publishing.content_snapshot import build_canonical_content_snapshot
from src.modules.sites.publishing.includes.service import PublishingIncludesService
from src.modules.sites.repository import SitesRepository
from src.modules.sites.schema import (
    SitePrimaryEntryOut,
    SiteResolvedPageMetaOut,
    SiteRouteDataSourcesOut,
    SiteRouteMatchOut,
    SiteRouteResolveOut,
)


class ContentPageRouteResolver(BaseService):
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
        item = await self._repo.get_content_page_entry_by_path(site_id=site_id, path=pathname)
        if item is None:
            return None

        meta_title = item.title if isinstance(item.title, str) and item.title.strip() else None
        meta_desc = None
        page_meta = (
            SiteResolvedPageMetaOut(title=meta_title, description=meta_desc)
            if meta_title is not None or meta_desc is not None
            else None
        )

        draft_rev = int(item.draft_version or 0)
        published_rev = int(item.published_version or 0)
        use_rev = published_rev if mode == "public" else (draft_rev or published_rev)
        state: Literal["draft", "published"] | None = None
        if use_rev:
            state = "published" if mode == "public" else ("draft" if draft_rev else "published")

        if use_rev:
            version = await self._repo.get_content_revision_by_number(
                entry_id=UUID(str(item.id)), revision=int(use_rev)
            )
            if version is not None:
                presentations = await self._repo.list_content_presentations(version_id=version.id)
                seo_profile = await self._repo.get_content_seo_profile(version_id=version.id)
                snapshot = build_canonical_content_snapshot(
                    item=item,
                    version=version,
                    presentations=presentations,
                    seo_profile=seo_profile,
                )
                meta_title = snapshot.meta_title
                meta_desc = snapshot.meta_description
                page_meta = (
                    SiteResolvedPageMetaOut(title=meta_title, description=meta_desc)
                    if meta_title is not None or meta_desc is not None
                    else None
                )
                raw_doc = snapshot.raw_page_blueprint
                if raw_doc is not None:
                    try:
                        doc = PageBlueprint.model_validate(raw_doc)
                    except Exception as exc:
                        raise ServiceUnavailable(
                            "Failed to load page blueprint", error="PAGE_BLUEPRINT_INVALID"
                        ) from exc

                    primary_fields = snapshot.fields
                    root = doc.nodes_by_id.get(doc.root_id)
                    root_ds = getattr(root, "data_sources", None)
                    preferred_primary_public = (
                        getattr(root_ds, "primary_entry_id", None) if root_ds is not None else None
                    )

                    primary_entry_id = UUID(str(item.id))
                    primary_entry_fields = primary_fields

                    if isinstance(preferred_primary_public, str) and preferred_primary_public.strip():
                        try:
                            preferred_uuid = decode_public_id(preferred_primary_public.strip())
                        except PublicIdDecodeError:
                            preferred_uuid = None

                        if preferred_uuid is not None and preferred_uuid != primary_entry_id:
                            preferred_state: Literal["draft", "published"] = (
                                "published" if mode == "public" else "draft"
                            )
                            _, data, _, err = await self._includes.load_content_ref_entry(
                                site_id=site_id,
                                entry_id_public=preferred_primary_public.strip(),
                                state=preferred_state,
                            )
                            if err is not None and mode == "preview":
                                _, data, _, err = await self._includes.load_content_ref_entry(
                                    site_id=site_id,
                                    entry_id_public=preferred_primary_public.strip(),
                                    state="published",
                                )
                            if err is None and isinstance(data, dict):
                                primary_entry_id = preferred_uuid
                                primary_entry_fields = data

                    includes, warnings = await self._includes.resolve_content_refs(
                        document=doc,
                        site_id=site_id,
                        mode=mode,
                    )
                    return SiteRouteResolveOut(
                        match=SiteRouteMatchOut(
                            kind="page",
                            params={},
                            page_id=UUID(str(item.id)),
                            variant_id=None,
                            revision=int(use_rev),
                            revision_state=state,
                            draft_revision=draft_rev,
                            published_revision=(published_rev if published_rev else None),
                        ),
                        pageMeta=page_meta,
                        pageBlueprint=doc,
                        dataSources=SiteRouteDataSourcesOut(
                            primaryEntry=SitePrimaryEntryOut(
                                id=primary_entry_id,
                                data={"fields": primary_entry_fields},
                            )
                        ),
                        includes=includes or None,
                        warnings=warnings or None,
                    )

        # Entry exists but has no usable revision.
        if mode == "preview":
            return SiteRouteResolveOut(
                match=SiteRouteMatchOut(
                    kind="page",
                    params={},
                    page_id=UUID(str(item.id)),
                    revision=None,
                    revision_state=None,
                    draft_revision=draft_rev,
                    published_revision=published_rev or None,
                ),
                pageMeta=page_meta,
                pageBlueprint=self._includes.create_empty_page_blueprint(),
            )
        return SiteRouteResolveOut(match=SiteRouteMatchOut(kind="not_found"), pageBlueprint=None)
