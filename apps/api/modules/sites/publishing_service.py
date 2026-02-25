from __future__ import annotations

import time
from typing import Literal
from uuid import UUID
from xml.sax.saxutils import escape as xml_escape

from apps.api.common.services.base import BaseService
from apps.api.core.exceptions import Conflict, NotFound, ServiceUnavailable
from apps.api.modules.sites.constants import (
    ROUTE_TEMPLATES_VERSION_NAMESPACE,
    THEME_ACTIVE_NAMESPACE,
    THEME_CONFIG_NAMESPACE,
    THEME_VARS_NAMESPACE,
)
from apps.api.modules.sites.repository import SitesRepository
from apps.api.modules.sites.schema import (
    DocumentIR,
    SiteEntryDraftSaveIn,
    SiteEntryDraftSaveOut,
    SiteEntryPublishIn,
    SiteEntryPublishOut,
    SiteEntryRevisionOut,
    SiteEntryRollbackIn,
    SiteEntryRollbackOut,
    SitePageDraftSaveIn,
    SitePageDraftSaveOut,
    SitePagePublishIn,
    SitePagePublishOut,
    SitePageRevisionOut,
    SitePageRollbackIn,
    SitePageRollbackOut,
    SitePageUnpublishOut,
    SitePresenceHeartbeatIn,
    SitePresenceHeartbeatOut,
    SitePresenceListOut,
    SitePresenceRecordOut,
    SiteRouteDraftSaveIn,
    SiteRouteDraftSaveOut,
    SiteRouteMatchOut,
    SiteRoutePublishIn,
    SiteRoutePublishOut,
    SiteRouteResolveOut,
)
from apps.api.modules.sites.stores import PresenceStore, RouteTemplateVersionStore
from apps.api.modules.sites.utils import normalize_path as normalize_site_path


class SitePublishingService(BaseService):
    def __init__(
        self,
        settings,
        *,
        repo: SitesRepository,
        presence: PresenceStore | None,
        route_templates_version: RouteTemplateVersionStore | None,
    ) -> None:
        super().__init__(settings)
        self._repo = repo
        self._presence = presence
        self._route_templates_version = route_templates_version

    async def _get_route_templates_cache_version(self, *, site_id: UUID) -> int:
        """
        Return the current route template cache version for a site.

        This is used to provide cross-instance invalidation for the in-process matcher cache:
        - Writers bump a version number on successful mutations.
        - Readers include that version in the cache key; a bump forces a reload.
        """

        if self._route_templates_version is not None:
            v = await self._route_templates_version.get(site_id=site_id)
            if v is not None:
                return int(v)

        setting = await self._repo.get_site_setting(site_id=site_id, namespace=ROUTE_TEMPLATES_VERSION_NAMESPACE)
        version = 0
        if setting is not None and isinstance(setting.value, dict):
            raw = setting.value.get("version")
            if isinstance(raw, int) and raw >= 0:
                version = raw

        if self._route_templates_version is not None and version:
            await self._route_templates_version.set(site_id=site_id, version=version)

        return int(version)

    async def _build_revision_deps(self, *, site_id: UUID, deps: dict | None) -> dict:
        """
        Build revision deps with a minimal settings snapshot (v1).

        Current v1 snapshot scope:
        - theme.active / theme.vars / theme.config

        Notes:
        - We always override `settingsSnapshot` to keep it trustworthy.
        - Other deps fields (e.g. assetIds) are preserved as-is.
        """

        base = deps if isinstance(deps, dict) else {}
        out = dict(base)
        snapshot = await self._repo.get_site_settings_snapshot(
            site_id=site_id,
            namespaces=[
                THEME_ACTIVE_NAMESPACE,
                THEME_VARS_NAMESPACE,
                THEME_CONFIG_NAMESPACE,
            ],
        )
        out["settingsSnapshot"] = snapshot
        return out

    async def rollback_page_revision(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        payload: SitePageRollbackIn,
        actor_user_id: UUID | None,
    ) -> SitePageRollbackOut:
        if not self.settings.database.enabled:
            raise Conflict("Page revisions require database storage", error="PAGE_REVISION_DB_REQUIRED")
        await self._repo.get_site_by_id(site_id=site_id)

        from_rev, to_rev, rolled_back_at_ms = await self._repo.rollback_page_revision_pointer(
            site_id=site_id,
            page_id=page_id,
            target=payload.target,
            revision=payload.revision,
            updated_by_user_id=actor_user_id,
        )
        # Minimal audit trail via structured log (full audit log table is planned for later milestones).
        self.logger.info(
            "Rolled back page revision pointer",
            site_id=str(site_id),
            page_id=str(page_id),
            target=str(payload.target),
            from_revision=from_rev,
            to_revision=to_rev,
        )
        return SitePageRollbackOut(
            page_id=page_id,
            target=payload.target,
            from_revision=from_rev,
            to_revision=to_rev,
            rolled_back_at_ms=rolled_back_at_ms,
        )

    async def rollback_entry_revision(
        self,
        *,
        site_id: UUID,
        entry_id: UUID,
        payload: SiteEntryRollbackIn,
    ) -> SiteEntryRollbackOut:
        if not self.settings.database.enabled:
            raise Conflict("Entry revisions require database storage", error="ENTRY_REVISION_DB_REQUIRED")
        await self._repo.get_site_by_id(site_id=site_id)

        from_rev, to_rev, rolled_back_at_ms = await self._repo.rollback_entry_revision_pointer(
            site_id=site_id,
            entry_id=entry_id,
            target=payload.target,
            revision=payload.revision,
        )
        self.logger.info(
            "Rolled back entry revision pointer",
            site_id=str(site_id),
            entry_id=str(entry_id),
            target=str(payload.target),
            from_revision=from_rev,
            to_revision=to_rev,
        )
        return SiteEntryRollbackOut(
            entry_id=entry_id,
            target=payload.target,
            from_revision=from_rev,
            to_revision=to_rev,
            rolled_back_at_ms=rolled_back_at_ms,
        )

    async def get_page_revision(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        state: Literal["draft", "published"],
    ) -> SitePageRevisionOut:
        if not self.settings.database.enabled:
            raise Conflict("Page revisions require database storage", error="PAGE_REVISION_DB_REQUIRED")
        await self._repo.get_site_by_id(site_id=site_id)

        page = await self._repo.get_page_by_id(site_id=site_id, page_id=page_id)
        if page is None:
            raise NotFound("Page not found", error="PAGE_NOT_FOUND")

        rev = int(page.draft_rev or 0) if state == "draft" else int(page.published_rev or 0)
        if rev <= 0:
            raise NotFound("Revision not found", error="REVISION_NOT_FOUND")

        rec = await self._repo.get_page_revision(page_id=page_id, rev=rev)
        if rec is None:
            raise NotFound("Revision not found", error="REVISION_NOT_FOUND")

        doc = DocumentIR.model_validate(rec.document)
        created_at_ms = int(rec.created_at.timestamp() * 1000)
        return SitePageRevisionOut(
            page_id=UUID(str(page.id)),
            state=state,
            revision=rev,
            created_at_ms=created_at_ms,
            document=doc,
            meta=(rec.meta if isinstance(rec.meta, dict) else None),
            style_overrides=(rec.style_overrides if isinstance(rec.style_overrides, dict) else None),
            variant_id=(str(rec.variant_id) if rec.variant_id else None),
            deps=(rec.deps if isinstance(rec.deps, dict) else None),
        )

    async def get_entry_revision(
        self,
        *,
        site_id: UUID,
        entry_id: UUID,
        state: Literal["draft", "published"],
    ) -> SiteEntryRevisionOut:
        if not self.settings.database.enabled:
            raise Conflict("Entry revisions require database storage", error="ENTRY_REVISION_DB_REQUIRED")
        await self._repo.get_site_by_id(site_id=site_id)

        entry = await self._repo.get_entry_by_id(site_id=site_id, entry_id=entry_id)
        if entry is None:
            raise NotFound("Entry not found", error="ENTRY_NOT_FOUND")

        rev = int(entry.draft_rev or 0) if state == "draft" else int(entry.published_rev or 0)
        if rev <= 0:
            raise NotFound("Revision not found", error="REVISION_NOT_FOUND")

        rec = await self._repo.get_entry_revision(entry_id=entry_id, rev=rev)
        if rec is None:
            raise NotFound("Revision not found", error="REVISION_NOT_FOUND")

        doc = DocumentIR.model_validate(rec.document) if rec.document is not None else None
        data = rec.data if isinstance(rec.data, dict) else None
        created_at_ms = int(rec.created_at.timestamp() * 1000)
        return SiteEntryRevisionOut(
            entry_id=UUID(str(entry.id)),
            state=state,
            revision=rev,
            created_at_ms=created_at_ms,
            document=doc,
            data=data,
            meta=(rec.meta if isinstance(rec.meta, dict) else None),
            style_overrides=(rec.style_overrides if isinstance(rec.style_overrides, dict) else None),
            variant_id=(str(rec.variant_id) if rec.variant_id else None),
            deps=(rec.deps if isinstance(rec.deps, dict) else None),
        )

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

        await self._repo.get_site_by_id(site_id=site_id)
        et = await self._repo.get_entry_type_by_code(site_id=site_id, code=payload.entry_type_code)

        deps = await self._build_revision_deps(
            site_id=site_id,
            deps=(payload.deps if isinstance(payload.deps, dict) else None),
        )

        entry_id, rev, saved_at_ms = await self._repo.save_entry_draft_by_slug(
            site_id=site_id,
            entry_type_id=UUID(str(et.id)),
            slug=slug,
            document=payload.document,
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

    async def resolve_route(
        self,
        *,
        site_id: UUID,
        path: str,
        mode: Literal["public", "preview"],
    ) -> SiteRouteResolveOut:
        pathname = normalize_site_path(path)

        if not self.settings.database.enabled:
            raise Conflict("Route resolution requires database storage", error="ROUTE_RESOLVE_DB_REQUIRED")

        # Ensure site exists.
        await self._repo.get_site_by_id(site_id=site_id)

        # Redirect stub: validate redirect protocol and SSR integration.
        # Sprint 2/3: redirects will be driven by RouteTemplate resolver / site settings.
        if pathname == "/old-about":
            return SiteRouteResolveOut(
                match=SiteRouteMatchOut(
                    kind="redirect",
                    params={},
                    redirect_to="/about",
                    redirect_status=301,
                ),
                document=None,
            )

        # 1) Static page path match (exact) has priority.
        page = await self._repo.get_page_by_path(site_id=site_id, path=pathname)
        if page is not None:
            draft_rev = int(page.draft_rev or 0)
            published_rev = int(page.published_rev or 0)
            use_rev = published_rev if mode == "public" else (draft_rev or published_rev)
            state: Literal["draft", "published"] | None = None
            if use_rev:
                state = "published" if mode == "public" else ("draft" if draft_rev else "published")
            if use_rev:
                rec = await self._repo.get_page_revision(page_id=UUID(str(page.id)), rev=int(use_rev))
                if rec is not None:
                    doc = DocumentIR.model_validate(rec.document)
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
                        document=doc,
                    )

            # Page exists but has no usable revision.
            # In preview mode (editor), return an empty document so the canvas can load.
            # In public mode, the page is genuinely not ready → not_found.
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
                    document=DocumentIR(version=1, blocks=[]),
                )
            return SiteRouteResolveOut(match=SiteRouteMatchOut(kind="not_found"), document=None)

        # 2) RouteTemplate match.
        cache_version = await self._get_route_templates_cache_version(site_id=site_id)
        tm = await self._repo.match_route_template(site_id=site_id, pathname=pathname, cache_version=cache_version)
        if tm is not None:
            slug = tm.params.get("slug")
            if slug:
                resolved = await self._repo.resolve_entry_by_slug(
                    site_id=site_id,
                    entry_type_id=tm.entry_type_id,
                    slug=slug,
                    mode=mode,
                )
                if resolved is not None:
                    return SiteRouteResolveOut(
                        match=SiteRouteMatchOut(
                            kind="route_template",
                            params=tm.params,
                            entry_id=resolved.entry_id,
                            variant_id=resolved.variant_id,
                            revision=resolved.revision,
                            revision_state=resolved.revision_state,
                            draft_revision=resolved.draft_rev,
                            published_revision=(resolved.published_rev if resolved.published_rev else None),
                        ),
                        document=resolved.document,
                    )

        return SiteRouteResolveOut(match=SiteRouteMatchOut(kind="not_found"), document=None)

    async def save_route_draft(
        self,
        *,
        site_id: UUID,
        payload: SiteRouteDraftSaveIn,
    ) -> SiteRouteDraftSaveOut:
        """
        Save a page draft by pathname (editor helper).
        """
        pathname = normalize_site_path(payload.path)
        now_ms = int(time.time() * 1000)

        if not self.settings.database.enabled:
            raise Conflict("Route drafts require database storage", error="ROUTE_DRAFT_DB_REQUIRED")

        await self._repo.get_site_by_id(site_id=site_id)

        deps = await self._build_revision_deps(
            site_id=site_id,
            deps=(payload.deps if isinstance(payload.deps, dict) else None),
        )

        next_rev, saved_at_ms = await self._repo.save_page_draft_by_path(
            site_id=site_id,
            path=pathname,
            document=payload.document,
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

        await self._repo.get_site_by_id(site_id=site_id)

        deps = await self._build_revision_deps(
            site_id=site_id,
            deps=(payload.deps if isinstance(payload.deps, dict) else None),
        )

        path, revision, saved_at_ms = await self._repo.save_page_draft_by_id(
            site_id=site_id,
            page_id=page_id,
            document=payload.document,
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

    async def heartbeat_presence(
        self,
        *,
        site_id: UUID,
        payload: SitePresenceHeartbeatIn,
    ) -> SitePresenceHeartbeatOut:
        if self._presence is None:
            # Presence is a collaboration feature backed by Valkey TTL keys.
            raise ServiceUnavailable("Presence requires Valkey", error="PRESENCE_VALKEY_REQUIRED")
        await self._repo.get_site_by_id(site_id=site_id)
        expires_at_ms = await self._presence.heartbeat(
            site_id=site_id, doc_key=payload.doc_key, client_id=payload.client_id, actor=payload.actor
        )
        return SitePresenceHeartbeatOut(expires_at_ms=expires_at_ms)

    async def list_presence(self, *, site_id: UUID, doc_key: str) -> SitePresenceListOut:
        if self._presence is None:
            raise ServiceUnavailable("Presence requires Valkey", error="PRESENCE_VALKEY_REQUIRED")
        await self._repo.get_site_by_id(site_id=site_id)
        items = await self._presence.list(site_id=site_id, doc_key=doc_key)
        records: list[SitePresenceRecordOut] = []
        for rec in items:
            raw_actor = rec.get("actor")
            actor = {str(k): str(v) for k, v in raw_actor.items()} if isinstance(raw_actor, dict) else None
            raw_updated = rec.get("updated_at_ms")
            updated_at_ms = int(raw_updated) if isinstance(raw_updated, (int, str)) else 0
            records.append(
                SitePresenceRecordOut(
                    client_id=str(rec.get("client_id") or ""),
                    updated_at_ms=updated_at_ms,
                    actor=actor,
                )
            )
        return SitePresenceListOut(doc_key=doc_key, items=records)

    async def get_sitemap_xml(self, *, site_id: UUID) -> str:
        """
        Build a minimal `sitemap.xml` for public pages and entries.

        Sprint 3:
        - Only includes published + public pages.
        - Includes published entries for templates of the form `/x/:slug`.
        - Does not include hreflang/lastmod yet (to be added with richer revision metadata).
        """

        if not self.settings.database.enabled:
            raise Conflict("Sitemap requires database storage", error="SITEMAP_DB_REQUIRED")

        site = await self._repo.get_site_by_id(site_id=site_id)
        base = f"https://{site.primary_host}" if site.primary_host else "https://example.invalid"
        paths = await self._repo.list_public_sitemap_paths(site_id=site_id)

        lines: list[str] = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ]
        for p in paths:
            loc = xml_escape(f"{base}{p}")
            lines.append(f"  <url><loc>{loc}</loc></url>")
        lines.append("</urlset>")
        return "\n".join(lines) + "\n"
