from __future__ import annotations

import secrets
import time
from typing import Literal, TypedDict
from uuid import UUID
from xml.sax.saxutils import escape as xml_escape

from apps.api.common.services.base import BaseService
from apps.api.core.exceptions import Conflict, Forbidden, NotFound, ServiceUnavailable
from apps.api.infra.cache.valkey import ValkeyClientLike
from apps.api.routers.v1.sites.repository import SitesRepository
from apps.api.routers.v1.sites.schema import (
    ContainerBlock,
    ContainerBlockProps,
    DividerBlock,
    DividerBlockProps,
    DocumentIR,
    DocumentMeta,
    HeadingBlock,
    HeadingBlockProps,
    ParagraphBlock,
    ParagraphBlockProps,
    SiteEntryDraftSaveIn,
    SiteEntryDraftSaveOut,
    SiteEntryPublishIn,
    SiteEntryPublishOut,
    SiteEntryRevisionOut,
    SiteFontOut,
    SitePageRevisionOut,
    SitePresenceHeartbeatIn,
    SitePresenceHeartbeatOut,
    SitePresenceListOut,
    SitePresenceRecordOut,
    SitePreviewTokenOut,
    SiteResolveOut,
    SiteRouteDraftSaveIn,
    SiteRouteDraftSaveOut,
    SiteRouteMatchOut,
    SiteRoutePublishIn,
    SiteRoutePublishOut,
    SiteRouteResolveOut,
    SiteRuntimeOut,
    SiteSettingGetOut,
    SiteSettingUpsertIn,
    SiteThemeOut,
)

DEMO_SITE_ID = "00000000-0000-0000-0000-000000000001"
# TODO(sprint-3): Replace in-memory stub state with bounded storage:
# - Add TTL cleanup (tokens/drafts) or persist to DB.
# - Add a max size / LRU policy to avoid unbounded memory growth during long-lived dev sessions.
DEMO_PREVIEW_TOKENS = {"demo"}


class RouteDraftRecord(TypedDict):
    revision: int
    saved_at_ms: int
    document: DocumentIR


DEMO_ROUTE_DRAFTS: dict[tuple[str, str], RouteDraftRecord] = {}

RUNTIME_SETTING_NAMESPACE = "site.runtime"


class SiteService(BaseService):
    """
    Stub-only Site service (no persistence, no database).

    This is intentionally minimal to validate protocol shape and SSR integration
    before implementing the actual RouteTemplate resolver and revision storage.
    """

    def assert_preview_access(self, *, mode: Literal["public", "preview"], token: str | None) -> None:
        # NOTE: This method is intentionally sync-like (no I/O) so routers can call it inline.
        # DB-backed preview tokens are validated via `assert_preview_access_async()`.
        if mode != "preview":
            return
        if token is None or not token.strip():
            raise Forbidden("Preview token required", error="PREVIEW_TOKEN_REQUIRED")
        if token not in DEMO_PREVIEW_TOKENS:
            # In Sprint 3, the canonical store is Valkey (TTL). Keep demo token as a dev fallback.
            raise Forbidden("Invalid preview token", error="PREVIEW_TOKEN_INVALID")

    async def assert_preview_access_async(
        self, *, site_id: str, mode: Literal["public", "preview"], token: str | None
    ) -> None:
        if mode != "preview":
            return
        if token is None or not token.strip():
            raise Forbidden("Preview token required", error="PREVIEW_TOKEN_REQUIRED")
        if token in DEMO_PREVIEW_TOKENS:
            return
        if self._preview_tokens is None:
            raise Forbidden("Invalid preview token", error="PREVIEW_TOKEN_INVALID")
        ok = await self._preview_tokens.validate(site_id=site_id, token=token)
        if not ok:
            raise Forbidden("Invalid preview token", error="PREVIEW_TOKEN_INVALID")

    def __init__(self, settings, valkey: ValkeyClientLike | None = None) -> None:
        super().__init__(settings)
        self._repo = SitesRepository()
        self._preview_tokens = PreviewTokenStore(valkey) if valkey is not None else None
        self._presence = PresenceStore(valkey) if valkey is not None else None

    async def create_preview_token(self, *, site_id: str, ttl_seconds: int = 600) -> SitePreviewTokenOut:
        """
        Stub-only token issuer.

        Sprint 2:
        - No persistence.
        - Tokens are stored in memory and lost on server restart.
        - Suitable for local dev and protocol validation only.
        """
        # Ensure the site exists when DB is enabled (avoid issuing tokens for unknown tenants).
        if self.settings.database.enabled:
            await self._repo.get_site_by_id(site_id=site_id)

        ttl = int(ttl_seconds)
        if ttl < 60:
            ttl = 60
        if ttl > 60 * 60:
            ttl = 60 * 60

        token = secrets.token_urlsafe(24)
        DEMO_PREVIEW_TOKENS.add(token)

        expires_at_ms = int((time.time() + ttl) * 1000)
        if self._preview_tokens is not None:
            await self._preview_tokens.issue(site_id=site_id, token=token, ttl_seconds=ttl, expires_at_ms=expires_at_ms)
        # Note: we return the input `site_id` so the protocol remains consistent with the URL.
        # The stub storage is still global (not per-site) until Sprint 3 introduces proper persistence.
        return SitePreviewTokenOut(site_id=site_id, token=token, expires_at_ms=expires_at_ms)

    async def resolve_site(self, *, host: str) -> SiteResolveOut:
        if not self.settings.database.enabled:
            # Fallback to deterministic demo behavior for local dev without DB.
            _ = host
            return SiteResolveOut(site_id=DEMO_SITE_ID, default_locale="zh-CN", fallback_locale="en-US")

        site = await self._repo.get_site_by_host(host=host)
        if site is None:
            # Dev-friendly fallback: if a demo site exists, return it.
            demo = await self._repo.get_site_by_id(site_id=DEMO_SITE_ID)
            site = demo

        return SiteResolveOut(
            site_id=str(site.id),
            default_locale=site.default_locale,
            fallback_locale=site.fallback_locale,
        )

    async def get_runtime(self, *, site_id: str, mode: Literal["public", "preview"]) -> SiteRuntimeOut:
        default_css_vars: dict[str, str] = {
            "--color-primary": "#1677ff",
            "--color-background": "#ffffff",
            "--color-foreground": "#111827",
            "--color-border": "rgba(17, 24, 39, 0.12)",
            "--font-sans": "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
        }

        if not self.settings.database.enabled:
            return SiteRuntimeOut(
                site_id=site_id,
                mode=mode,
                theme=SiteThemeOut(css_vars=default_css_vars),
                fonts=[],
            )

        await self._repo.get_site_by_id(site_id=site_id)

        # Sprint 3: read runtime tokens/fonts from site-scoped settings.
        # Keep strict validation + fallback to defaults to avoid breaking SSR.
        setting = await self._repo.get_site_setting(site_id=site_id, namespace=RUNTIME_SETTING_NAMESPACE)
        if not setting or not isinstance(setting.value, dict):
            return SiteRuntimeOut(
                site_id=site_id,
                mode=mode,
                theme=SiteThemeOut(css_vars=default_css_vars),
                fonts=[],
            )

        raw_theme = setting.value.get("theme")
        raw_fonts = setting.value.get("fonts")

        css_vars: dict[str, str] = default_css_vars
        if isinstance(raw_theme, dict) and isinstance(raw_theme.get("cssVars"), dict):
            maybe_vars = raw_theme.get("cssVars") or {}
            parsed = {
                str(k): str(v)
                for k, v in maybe_vars.items()
                if isinstance(k, str) and isinstance(v, (str, int, float)) and str(k).startswith("--")
            }
            if parsed:
                merged = dict(default_css_vars)
                merged.update(parsed)
                css_vars = merged

        fonts_out: list[SiteFontOut] = []
        if isinstance(raw_fonts, list):
            for item in raw_fonts:
                if not isinstance(item, dict):
                    continue
                try:
                    fonts_out.append(SiteFontOut.model_validate(item))
                except Exception:
                    # Ignore invalid font entries to keep SSR resilient.
                    continue

        return SiteRuntimeOut(
            site_id=site_id,
            mode=mode,
            theme=SiteThemeOut(css_vars=css_vars),
            fonts=fonts_out,
        )

    async def get_site_setting(self, *, site_id: str, namespace: str) -> SiteSettingGetOut:
        if not self.settings.database.enabled:
            raise Conflict("Site settings require database storage", error="SETTINGS_DB_REQUIRED")
        await self._repo.get_site_by_id(site_id=site_id)
        rec = await self._repo.get_site_setting(site_id=site_id, namespace=namespace)
        value = rec.value if rec and isinstance(rec.value, dict) else None
        return SiteSettingGetOut(namespace=namespace, value=value)

    async def upsert_site_setting(
        self, *, site_id: str, namespace: str, payload: SiteSettingUpsertIn
    ) -> SiteSettingGetOut:
        if not self.settings.database.enabled:
            raise Conflict("Site settings require database storage", error="SETTINGS_DB_REQUIRED")
        await self._repo.get_site_by_id(site_id=site_id)
        rec = await self._repo.upsert_site_setting(
            site_id=site_id, namespace=namespace, value=payload.value, updated_by=None
        )
        value = rec.value if isinstance(rec.value, dict) else None
        return SiteSettingGetOut(namespace=namespace, value=value)

    async def get_page_revision(
        self,
        *,
        site_id: str,
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
            page_id=str(page.id),
            state=state,
            revision=rev,
            created_at_ms=created_at_ms,
            document=doc,
        )

    async def get_entry_revision(
        self,
        *,
        site_id: str,
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
            entry_id=str(entry.id),
            state=state,
            revision=rev,
            created_at_ms=created_at_ms,
            document=doc,
            data=data,
        )

    async def save_entry_draft(
        self,
        *,
        site_id: str,
        payload: SiteEntryDraftSaveIn,
    ) -> SiteEntryDraftSaveOut:
        slug = (payload.slug or "").strip()
        now_ms = int(time.time() * 1000)

        if not self.settings.database.enabled:
            raise Conflict("Entry drafts require database storage", error="ENTRY_DRAFT_DB_REQUIRED")

        await self._repo.get_site_by_id(site_id=site_id)
        et = await self._repo.get_entry_type_by_code(site_id=site_id, code=payload.entry_type_code)

        entry_id, rev, saved_at_ms = await self._repo.save_entry_draft_by_slug(
            site_id=site_id,
            entry_type_id=UUID(str(et.id)),
            slug=slug,
            document=payload.document,
            data=(payload.data if isinstance(payload.data, dict) else None),
            expected_revision=payload.expected_revision,
            created_by_user_id=None,
        )
        return SiteEntryDraftSaveOut(
            site_id=site_id,
            entry_id=str(entry_id),
            entry_type_code=payload.entry_type_code,
            slug=slug,
            revision=rev,
            saved_at_ms=saved_at_ms or now_ms,
        )

    async def publish_entry(
        self,
        *,
        site_id: str,
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
        return SiteEntryPublishOut(
            site_id=site_id,
            entry_id=str(entry_id),
            entry_type_code=payload.entry_type_code,
            slug=slug,
            revision=rev,
            published_at_ms=published_at_ms or now_ms,
        )

    async def resolve_route(
        self,
        *,
        site_id: str,
        path: str,
        mode: Literal["public", "preview"],
    ) -> SiteRouteResolveOut:
        pathname = normalize_path(path)

        if not self.settings.database.enabled:
            # Legacy in-memory stub path (Sprint 1/2 compatibility).
            if mode == "preview":
                draft = DEMO_ROUTE_DRAFTS.get((DEMO_SITE_ID, pathname))
                if draft:
                    return SiteRouteResolveOut(
                        match=SiteRouteMatchOut(kind="page", params={}),
                        document=draft["document"],
                    )

            if pathname == "/old-about":
                return SiteRouteResolveOut(
                    match=SiteRouteMatchOut(kind="redirect", params={}, redirect_to="/about", redirect_status=301),
                    document=None,
                )

            if pathname == "/":
                return SiteRouteResolveOut(match=SiteRouteMatchOut(kind="page"), document=build_home_document())

            if pathname == "/about":
                return SiteRouteResolveOut(match=SiteRouteMatchOut(kind="page"), document=build_about_document())

            blog = match_blog_route(pathname)
            if blog is not None:
                slug = blog["slug"]
                return SiteRouteResolveOut(
                    match=SiteRouteMatchOut(kind="route_template", params={"slug": slug}),
                    document=build_blog_document(slug=slug),
                )

            return SiteRouteResolveOut(match=SiteRouteMatchOut(kind="not_found"), document=None)

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
            rev = page.published_rev if mode == "public" else page.draft_rev or page.published_rev
            if rev:
                rec = await self._repo.get_page_revision(page_id=UUID(str(page.id)), rev=int(rev))
                if rec is not None:
                    doc = DocumentIR.model_validate(rec.document)
                    return SiteRouteResolveOut(match=SiteRouteMatchOut(kind="page", params={}), document=doc)

            # No published revision in public mode -> treat as not found.
            return SiteRouteResolveOut(match=SiteRouteMatchOut(kind="not_found"), document=None)

        # 2) RouteTemplate match.
        tm = await self._repo.match_route_template(site_id=site_id, pathname=pathname)
        if tm is not None:
            slug = tm.params.get("slug")
            if slug:
                doc = await self._repo.resolve_entry_by_slug(
                    site_id=site_id,
                    entry_type_id=tm.entry_type_id,
                    slug=slug,
                    mode=mode,
                )
                if doc is not None:
                    return SiteRouteResolveOut(
                        match=SiteRouteMatchOut(kind="route_template", params=tm.params),
                        document=doc,
                    )

        return SiteRouteResolveOut(match=SiteRouteMatchOut(kind="not_found"), document=None)

    async def save_route_draft(
        self,
        *,
        site_id: str,
        payload: SiteRouteDraftSaveIn,
    ) -> SiteRouteDraftSaveOut:
        """
        Stub-only draft save.

        Sprint 2:
        - No DB persistence.
        - Save is stored in memory and lost on server restart.
        - Optional optimistic lock via `expected_revision` to validate the 409 flow early.
        """
        pathname = normalize_path(payload.path)
        now_ms = int(time.time() * 1000)

        if not self.settings.database.enabled:
            key = (DEMO_SITE_ID, pathname)
            existing = DEMO_ROUTE_DRAFTS.get(key)
            existing_rev = existing["revision"] if existing else 0
            if payload.expected_revision is not None and payload.expected_revision != existing_rev:
                raise Conflict(
                    "Draft revision mismatch",
                    error="DRAFT_REVISION_MISMATCH",
                    meta={"expectedRevision": payload.expected_revision, "currentRevision": existing_rev},
                )
            next_rev = existing_rev + 1 if existing_rev else 1
            DEMO_ROUTE_DRAFTS[key] = {
                "revision": next_rev,
                "saved_at_ms": now_ms,
                "document": payload.document,
            }
            return SiteRouteDraftSaveOut(site_id=DEMO_SITE_ID, path=pathname, revision=next_rev, saved_at_ms=now_ms)

        await self._repo.get_site_by_id(site_id=site_id)

        next_rev, saved_at_ms = await self._repo.save_page_draft_by_path(
            site_id=site_id,
            path=pathname,
            document=payload.document,
            expected_revision=payload.expected_revision,
            created_by_user_id=None,
        )

        return SiteRouteDraftSaveOut(
            site_id=site_id, path=pathname, revision=next_rev, saved_at_ms=saved_at_ms or now_ms
        )

    async def publish_route(
        self,
        *,
        site_id: str,
        payload: SiteRoutePublishIn,
    ) -> SiteRoutePublishOut:
        pathname = normalize_path(payload.path)
        now_ms = int(time.time() * 1000)

        if not self.settings.database.enabled:
            # Sprint 3: publishing requires persistence; keep legacy stub minimal.
            raise Conflict("Publishing requires database storage", error="PUBLISH_DB_REQUIRED")

        await self._repo.get_site_by_id(site_id=site_id)
        rev, published_at_ms = await self._repo.publish_page_by_path(
            site_id=site_id,
            path=pathname,
            revision=payload.revision,
        )
        return SiteRoutePublishOut(
            site_id=site_id,
            path=pathname,
            revision=rev,
            published_at_ms=published_at_ms or now_ms,
        )

    async def heartbeat_presence(
        self,
        *,
        site_id: str,
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

    async def list_presence(self, *, site_id: str, doc_key: str) -> SitePresenceListOut:
        if self._presence is None:
            raise ServiceUnavailable("Presence requires Valkey", error="PRESENCE_VALKEY_REQUIRED")
        await self._repo.get_site_by_id(site_id=site_id)
        items = await self._presence.list(site_id=site_id, doc_key=doc_key)
        return SitePresenceListOut(doc_key=doc_key, items=[SitePresenceRecordOut(**rec) for rec in items])

    async def get_sitemap_xml(self, *, site_id: str) -> str:
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


def normalize_path(path: str) -> str:
    if not path:
        return "/"
    pathname = path if path.startswith("/") else f"/{path}"
    if pathname == "/":
        return "/"
    return pathname[:-1] if pathname.endswith("/") else pathname


def match_blog_route(pathname: str) -> dict[str, str] | None:
    if not pathname.startswith("/blog/"):
        return None
    slug = pathname[len("/blog/") :]
    if not slug or "/" in slug:
        return None
    return {"slug": slug}


def build_home_document() -> DocumentIR:
    return DocumentIR(
        version=1,
        meta=DocumentMeta(
            title={"zh-CN": "Celestial Portal", "en-US": "Celestial Portal"},
            description={
                "zh-CN": "后端 stub：验证 sites/routes/resolve 协议与 Portal SSR 集成。",
                "en-US": "Backend stub: validate sites/routes/resolve protocol and Portal SSR integration.",
            },
        ),
        blocks=[
            ContainerBlock(
                id="b1",
                type="container",
                props=ContainerBlockProps(as_="section"),
                children=[
                    HeadingBlock(
                        id="b1-h1",
                        type="heading",
                        props=HeadingBlockProps(
                            level=1,
                            text={"zh-CN": "来自 API 的首页", "en-US": "Home from API"},
                        ),
                    ),
                    ParagraphBlock(
                        id="b1-p1",
                        type="paragraph",
                        props=ParagraphBlockProps(
                            text={
                                "zh-CN": "该页面数据来自 /api/v1/sites/{siteId}/routes/resolve（stub）。",
                                "en-US": "This page is served from /api/v1/sites/{siteId}/routes/resolve (stub).",
                            }
                        ),
                    ),
                    DividerBlock(
                        id="b1-div",
                        type="divider",
                        props=DividerBlockProps(variant="subtle"),
                    ),
                ],
            )
        ],
    )


def build_about_document() -> DocumentIR:
    return DocumentIR(
        version=1,
        meta=DocumentMeta(
            title={"zh-CN": "关于 Celestial", "en-US": "About Celestial"},
            description={
                "zh-CN": "后端 stub：/about 页面。",
                "en-US": "Backend stub: /about page.",
            },
        ),
        blocks=[
            ContainerBlock(
                id="about",
                type="container",
                props=ContainerBlockProps(as_="section"),
                children=[
                    HeadingBlock(
                        id="about-h1",
                        type="heading",
                        props=HeadingBlockProps(level=1, text={"zh-CN": "关于（API）", "en-US": "About (API)"}),
                    ),
                    ParagraphBlock(
                        id="about-p1",
                        type="paragraph",
                        props=ParagraphBlockProps(
                            text={
                                "zh-CN": "该页面用于验证「路径 -> route resolver -> DocumentIR」的后端协议。",
                                "en-US": "This page validates the backend protocol for route resolution.",
                            }
                        ),
                    ),
                ],
            )
        ],
    )


def build_blog_document(*, slug: str) -> DocumentIR:
    return DocumentIR(
        version=1,
        meta=DocumentMeta(
            title={"zh-CN": f"博客：{slug}", "en-US": f"Blog: {slug}"},
            description={
                "zh-CN": "后端 stub：RouteTemplate 示例 /blog/:slug。",
                "en-US": "Backend stub: RouteTemplate example /blog/:slug.",
            },
        ),
        blocks=[
            ContainerBlock(
                id="blog",
                type="container",
                props=ContainerBlockProps(as_="article"),
                children=[
                    HeadingBlock(
                        id="blog-h1",
                        type="heading",
                        props=HeadingBlockProps(level=1, text={"zh-CN": f"博客文章：{slug}", "en-US": f"Blog: {slug}"}),
                    ),
                    ParagraphBlock(
                        id="blog-p1",
                        type="paragraph",
                        props=ParagraphBlockProps(
                            text={
                                "zh-CN": "该内容来自后端 stub，用于模拟未来 RouteTemplate resolver 输出。",
                                "en-US": "This content is from backend stub to simulate future RouteTemplate resolver output.",
                            }
                        ),
                    ),
                ],
            )
        ],
    )


class PreviewTokenStore:
    """
    Preview token store backed by Valkey (TTL-based).

    Notes:
    - In-memory demo token fallback is kept in `DEMO_PREVIEW_TOKENS`.
    - For Sprint 3, we only validate token existence and TTL; binding to user/session
      will be added once the editor has real authentication and permission checks.
    """

    def __init__(self, client: ValkeyClientLike) -> None:
        self._client = client

    def _key(self, *, site_id: str, token: str) -> str:
        return f"sites:preview:{site_id}:{token}"

    async def issue(self, *, site_id: str, token: str, ttl_seconds: int, expires_at_ms: int) -> None:
        record = {"siteId": site_id, "token": token, "expiresAtMs": expires_at_ms}
        await self._client.set_json(self._key(site_id=site_id, token=token), record, ex=ttl_seconds)

    async def validate(self, *, site_id: str, token: str) -> bool:
        if not token.strip():
            return False
        data = await self._client.get_json(self._key(site_id=site_id, token=token))
        return isinstance(data, dict) and data.get("token") == token


class PresenceStore:
    """
    Presence store backed by Valkey (TTL-based).

    Storage model:
    - A presence set per document: `sites:presence:<siteId>:<docKey>:clients` (set of clientIds)
    - A record per clientId: `sites:presence:<siteId>:<docKey>:client:<clientId>` (json)
    """

    _TTL_SECONDS = 20

    def __init__(self, client: ValkeyClientLike) -> None:
        self._client = client

    def _set_key(self, *, site_id: str, doc_key: str) -> str:
        return f"sites:presence:{site_id}:{doc_key}:clients"

    def _record_key(self, *, site_id: str, doc_key: str, client_id: str) -> str:
        return f"sites:presence:{site_id}:{doc_key}:client:{client_id}"

    async def heartbeat(
        self,
        *,
        site_id: str,
        doc_key: str,
        client_id: str,
        actor: dict[str, str] | None,
    ) -> int:
        now_ms = int(time.time() * 1000)
        expires_at_ms = now_ms + self._TTL_SECONDS * 1000

        # Track client ids for listing.
        await self._client.sadd(self._set_key(site_id=site_id, doc_key=doc_key), client_id)
        await self._client.expire(self._set_key(site_id=site_id, doc_key=doc_key), self._TTL_SECONDS)

        record = {"client_id": client_id, "updated_at_ms": now_ms, "actor": actor}
        await self._client.set_json(
            self._record_key(site_id=site_id, doc_key=doc_key, client_id=client_id),
            record,
            ex=self._TTL_SECONDS,
        )
        return expires_at_ms

    async def list(self, *, site_id: str, doc_key: str) -> list[dict]:
        key = self._set_key(site_id=site_id, doc_key=doc_key)
        client_ids = sorted(await self._client.smembers(key))
        results: list[dict] = []
        stale: list[str] = []
        for cid in client_ids:
            data = await self._client.get_json(self._record_key(site_id=site_id, doc_key=doc_key, client_id=cid))
            if not isinstance(data, dict):
                stale.append(cid)
                continue
            # Defensive shaping: keep contract stable.
            rec = {
                "client_id": str(data.get("client_id") or cid),
                "updated_at_ms": int(data.get("updated_at_ms") or 0),
                "actor": data.get("actor") if isinstance(data.get("actor"), dict) else None,
            }
            results.append(rec)

        if stale:
            await self._client.srem(key, *stale)

        return results
