from __future__ import annotations

from typing import Literal
from uuid import UUID

from apps.api.src.common.services.base import BaseService
from apps.api.src.common.utils.public_ids import PublicIdDecodeError, decode_public_id
from apps.api.src.core.exceptions import ServiceUnavailable
from apps.api.src.modules.sites.design_document.schema import PageBlueprint
from apps.api.src.modules.sites.publishing.includes.service import PublishingIncludesService
from apps.api.src.modules.sites.repository import SitesRepository
from apps.api.src.modules.sites.schema import (
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
        entry = await self._repo.get_content_page_entry_by_path(site_id=site_id, path=pathname)
        if entry is None:
            return None

        meta_title = entry.title if isinstance(entry.title, str) and entry.title.strip() else None
        meta_desc = None
        raw_fields = getattr(entry, "field_values", None)
        if isinstance(raw_fields, dict):
            raw_desc = raw_fields.get("description")
            if isinstance(raw_desc, str) and raw_desc.strip():
                meta_desc = raw_desc.strip()
        page_meta = (
            SiteResolvedPageMetaOut(title=meta_title, description=meta_desc)
            if meta_title is not None or meta_desc is not None
            else None
        )

        draft_rev = int(entry.draft_revision or 0)
        published_rev = int(entry.published_revision or 0)
        use_rev = published_rev if mode == "public" else (draft_rev or published_rev)
        state: Literal["draft", "published"] | None = None
        if use_rev:
            state = "published" if mode == "public" else ("draft" if draft_rev else "published")

        if use_rev:
            rev_rec = await self._repo.get_content_revision_by_number(
                entry_id=UUID(str(entry.id)), revision=int(use_rev)
            )
            if rev_rec is not None and isinstance(rev_rec.snapshot, dict):
                snapshot = rev_rec.snapshot
                raw_doc = snapshot.get("page_blueprint")
                if raw_doc is None:
                    raw_doc = snapshot.get("design_document")
                if raw_doc is not None:
                    try:
                        doc = PageBlueprint.model_validate(raw_doc)
                    except Exception as exc:
                        raise ServiceUnavailable(
                            "Failed to load page blueprint", error="PAGE_BLUEPRINT_INVALID"
                        ) from exc

                    primary_fields_raw = snapshot.get("field_values")
                    primary_fields: dict = primary_fields_raw if isinstance(primary_fields_raw, dict) else {}
                    if isinstance(entry.title, str) and entry.title.strip():
                        primary_fields = {**primary_fields, "title": entry.title.strip()}
                    if meta_desc is not None:
                        primary_fields = {**primary_fields, "description": meta_desc}

                    root = doc.nodes_by_id.get(doc.root_id)
                    root_ds = getattr(root, "data_sources", None)
                    preferred_primary_public = (
                        getattr(root_ds, "primary_entry_id", None) if root_ds is not None else None
                    )

                    primary_entry_id = UUID(str(entry.id))
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
                            page_id=UUID(str(entry.id)),
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
                    page_id=UUID(str(entry.id)),
                    revision=None,
                    revision_state=None,
                    draft_revision=draft_rev,
                    published_revision=published_rev or None,
                ),
                pageMeta=page_meta,
                pageBlueprint=self._includes.create_empty_page_blueprint(),
            )
        return SiteRouteResolveOut(match=SiteRouteMatchOut(kind="not_found"), pageBlueprint=None)
