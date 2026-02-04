from __future__ import annotations

import secrets
import time
from typing import Literal, cast
from uuid import UUID
from xml.sax.saxutils import escape as xml_escape

from apps.api.common.protocols.tortoise import HasEntryTypeId, HasParentId, HasWorkspaceId, RouteTemplateIds
from apps.api.common.services.base import BaseService
from apps.api.core.exceptions import Conflict, Forbidden, NotFound, ServiceUnavailable
from apps.api.core.http.pagination import PageData, PageParams, paginate_items
from apps.api.infra.cache.valkey import ValkeyClientLike
from apps.api.modules.sites.constants import (
    ROUTE_TEMPLATES_VERSION_NAMESPACE,
    RUNTIME_SETTING_NAMESPACE,
    THEME_ACTIVE_NAMESPACE,
    THEME_CONFIG_NAMESPACE,
    THEME_VARS_NAMESPACE,
)
from apps.api.modules.sites.repository import SitesRepository
from apps.api.modules.sites.schema import (
    DocumentIR,
    SiteEntryCreateIn,
    SiteEntryDeleteOut,
    SiteEntryDraftSaveIn,
    SiteEntryDraftSaveOut,
    SiteEntryOut,
    SiteEntryPublishIn,
    SiteEntryPublishOut,
    SiteEntryRevisionOut,
    SiteEntryRollbackIn,
    SiteEntryRollbackOut,
    SiteEntryTypeCreateIn,
    SiteEntryTypeDeleteOut,
    SiteEntryTypeOut,
    SiteEntryTypeUpdateIn,
    SiteEntryUnpublishIn,
    SiteEntryUnpublishOut,
    SiteEntryUpdateIn,
    SiteFontOut,
    SitePageCreateIn,
    SitePageDeleteOut,
    SitePageDraftSaveIn,
    SitePageDraftSaveOut,
    SitePageMoveIn,
    SitePagePublishIn,
    SitePagePublishOut,
    SitePageRevisionOut,
    SitePageRollbackIn,
    SitePageRollbackOut,
    SitePageTreeNodeOut,
    SitePageUnpublishOut,
    SitePageUpdateIn,
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
    SiteRouteTemplateCreateIn,
    SiteRouteTemplateDeleteOut,
    SiteRouteTemplateOut,
    SiteRouteTemplateUpdateIn,
    SiteRuntimeOut,
    SiteSettingGetOut,
    SiteSettingUpsertIn,
    SiteThemeOut,
)
from apps.api.modules.sites.stores import PresenceStore, PreviewTokenStore, RouteTemplateVersionStore
from apps.api.modules.sites.utils import (
    build_pages_tree,
    is_descendant_or_self,
    validate_entry_type_code,
    validate_page_pathname,
    validate_route_template_pattern,
)
from apps.api.modules.sites.utils import (
    normalize_path as normalize_site_path,
)


def _as_visibility(value: str) -> Literal["public", "private"]:
    return cast(Literal["public", "private"], value)


def _get_parent_id(value: object) -> UUID | None:
    raw = cast(HasParentId, value).parent_id
    return UUID(str(raw)) if raw is not None else None


def _get_entry_type_id(value: object) -> UUID:
    raw = cast(HasEntryTypeId, value).entry_type_id
    return UUID(str(raw))


def _get_template_page_revision_id(value: object) -> UUID | None:
    raw = cast(RouteTemplateIds, value).template_page_revision_id
    return UUID(str(raw)) if raw is not None else None


class SiteService(BaseService):
    """
    Sites service (Portal consumption + editor/management APIs).

    Notes:
    - Portal should not run as a standalone app without backend dependencies.
    - Preview token and presence are Valkey-backed (TTL).
    """

    async def assert_preview_access_async(
        self, *, site_id: str, mode: Literal["public", "preview"], token: str | None
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

    def __init__(self, settings, valkey: ValkeyClientLike | None = None) -> None:
        super().__init__(settings)
        self._repo = SitesRepository()
        self._preview_tokens = PreviewTokenStore(valkey) if valkey is not None else None
        self._presence = PresenceStore(valkey) if valkey is not None else None
        self._route_templates_version = RouteTemplateVersionStore(valkey) if valkey is not None else None

    async def create_preview_token(self, *, site_id: str, ttl_seconds: int = 600) -> SitePreviewTokenOut:
        """
        Create a preview token (Valkey TTL).
        """
        if not self.settings.database.enabled:
            raise Conflict("Preview tokens require database storage", error="PREVIEW_TOKEN_DB_REQUIRED")
        if self._preview_tokens is None:
            raise ServiceUnavailable("Preview token store unavailable", error="PREVIEW_TOKEN_STORE_UNAVAILABLE")

        # Ensure the site exists (avoid issuing tokens for unknown tenants).
        await self._repo.get_site_by_id(site_id=site_id)

        ttl = int(ttl_seconds)
        if ttl < 60:
            ttl = 60
        if ttl > 60 * 60:
            ttl = 60 * 60

        token = secrets.token_urlsafe(24)

        expires_at_ms = int((time.time() + ttl) * 1000)
        await self._preview_tokens.issue(site_id=site_id, token=token, ttl_seconds=ttl, expires_at_ms=expires_at_ms)
        return SitePreviewTokenOut(site_id=site_id, token=token, expires_at_ms=expires_at_ms)

    async def resolve_site(self, *, host: str) -> SiteResolveOut:
        if not self.settings.database.enabled:
            raise Conflict("Site resolution requires database storage", error="SITE_RESOLVE_DB_REQUIRED")

        site = await self._repo.get_site_by_host(host=host)
        if site is None:
            raise NotFound("Site not found", error="SITE_NOT_FOUND")

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
            raise Conflict("Site runtime requires database storage", error="SITE_RUNTIME_DB_REQUIRED")

        site = await self._repo.get_site_by_id(site_id=site_id)
        workspace_id = UUID(str(cast(HasWorkspaceId, site).workspace_id))

        # Theme contract v0:
        # - theme.vars provides site-scoped CSS vars (overrides)
        # - theme.active references an installed theme package (entrypoint CSS URLs)
        # - theme.config is optional site-scoped JSON (future renderer consumption)
        theme_active = await self._repo.get_site_setting(site_id=site_id, namespace=THEME_ACTIVE_NAMESPACE)
        theme_vars = await self._repo.get_site_setting(site_id=site_id, namespace=THEME_VARS_NAMESPACE)
        theme_config = await self._repo.get_site_setting(site_id=site_id, namespace=THEME_CONFIG_NAMESPACE)

        active_theme_id = None
        active_version = None
        active_preset_id = None
        if theme_active and isinstance(theme_active.value, dict):
            active_theme_id = str(theme_active.value.get("themeId") or "").strip() or None
            active_version = str(theme_active.value.get("version") or "").strip() or None
            active_preset_id = str(theme_active.value.get("presetId") or "").strip() or None

        css_vars: dict[str, str] = dict(default_css_vars)
        if theme_vars and isinstance(theme_vars.value, dict) and isinstance(theme_vars.value.get("cssVars"), dict):
            maybe_vars = theme_vars.value.get("cssVars") or {}
            parsed = {
                str(k): str(v)
                for k, v in maybe_vars.items()
                if isinstance(k, str) and isinstance(v, (str, int, float)) and str(k).startswith("--")
            }
            css_vars.update(parsed)
        else:
            # Backward-compatible fallback to legacy `site.runtime.theme.cssVars`.
            # Keep strict validation + fallback to defaults to avoid breaking SSR.
            setting = await self._repo.get_site_setting(site_id=site_id, namespace=RUNTIME_SETTING_NAMESPACE)
            if setting and isinstance(setting.value, dict):
                raw_theme = setting.value.get("theme")
                if isinstance(raw_theme, dict) and isinstance(raw_theme.get("cssVars"), dict):
                    maybe_vars = raw_theme.get("cssVars") or {}
                    parsed = {
                        str(k): str(v)
                        for k, v in maybe_vars.items()
                        if isinstance(k, str) and isinstance(v, (str, int, float)) and str(k).startswith("--")
                    }
                    css_vars.update(parsed)

        # Fonts remain in `site.runtime` for now (Sprint 3).
        fonts_setting = await self._repo.get_site_setting(site_id=site_id, namespace=RUNTIME_SETTING_NAMESPACE)
        raw_fonts = (
            fonts_setting.value.get("fonts") if fonts_setting and isinstance(fonts_setting.value, dict) else None
        )

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

        tokens_css_url = None
        base_css_url = None
        if active_theme_id and active_version:
            # Workspace-scoped theme packages: look up the installed theme by (theme_id, version).
            from apps.api.modules.workspaces.models.theme_package import ThemePackageRecord

            theme_pkg = await ThemePackageRecord.get_or_none(
                workspace_id=workspace_id,
                theme_id=active_theme_id,
                version=active_version,
            )
            if theme_pkg is not None:
                # Prefer canonical asset URLs to avoid extra redirects in SSR <link> usage.
                from apps.api.modules.assets.models.asset import AssetRecord

                tokens_asset = await AssetRecord.get_or_none(
                    id=theme_pkg.tokens_css_asset_id,
                    workspace_id=workspace_id,
                    deleted_at=None,
                )
                if tokens_asset is not None:
                    slug = (tokens_asset.slug or "asset").strip() or "asset"
                    ext = (tokens_asset.ext or "css").lstrip(".").lower() or "css"
                    tokens_css_url = f"/assets/{tokens_asset.id}/{slug}.{ext}"

                if theme_pkg.base_css_asset_id:
                    base_asset = await AssetRecord.get_or_none(
                        id=theme_pkg.base_css_asset_id,
                        workspace_id=workspace_id,
                        deleted_at=None,
                    )
                    if base_asset is not None:
                        slug = (base_asset.slug or "asset").strip() or "asset"
                        ext = (base_asset.ext or "css").lstrip(".").lower() or "css"
                        base_css_url = f"/assets/{base_asset.id}/{slug}.{ext}"

        # Theme config v0:
        # - Stored under site settings namespace `theme.config`.
        # - Treated as public-safe configuration that affects SSR output (e.g. list limits).
        # - Secrets must NOT be stored here; use secret-capable settings namespaces instead.
        config_out = theme_config.value if theme_config and isinstance(theme_config.value, dict) else None

        return SiteRuntimeOut(
            site_id=site_id,
            mode=mode,
            theme=SiteThemeOut(
                css_vars=css_vars,
                theme_id=active_theme_id,
                version=active_version,
                tokens_css_url=tokens_css_url,
                base_css_url=base_css_url,
                preset_id=active_preset_id,
                config=config_out,
            ),
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

    async def list_pages_tree(self, *, site_id: str) -> PageData[SitePageTreeNodeOut]:
        """
        List pages as a deterministic tree (root -> children).

        Notes:
        - This endpoint is currently intended for Admin/editor use, so it is gated behind preview token.
        - We return a PageData wrapper for consistency with other list endpoints, but the data itself
          is a full tree (no pagination applied in v1).
        """

        if not self.settings.database.enabled:
            raise Conflict("Site pages require database storage", error="PAGES_DB_REQUIRED")

        await self._repo.get_site_by_id(site_id=site_id)
        pages = await self._repo.list_pages_by_site(site_id=site_id)

        nodes = [
            SitePageTreeNodeOut(
                id=UUID(str(p.id)),
                path=p.path,
                parent_id=_get_parent_id(p),
                sort_order=int(p.sort_order or 0),
                visibility=_as_visibility(str(p.visibility)),
                draft_revision=int(p.draft_rev or 0),
                published_revision=(int(p.published_rev) if p.published_rev is not None else None),
                children=[],
            )
            for p in pages
        ]

        tree = build_pages_tree(nodes)
        total = int(len(pages))
        size = max(total, 1)
        return PageData[SitePageTreeNodeOut](
            items=tree,
            total=total,
            page=1,
            size=size,
            pages=(1 if total > 0 else 0),
            next=None,
            prev=None,
        )

    async def create_page(self, *, site_id: str, payload: SitePageCreateIn) -> SitePageTreeNodeOut:
        if not self.settings.database.enabled:
            raise Conflict("Site pages require database storage", error="PAGES_DB_REQUIRED")

        await self._repo.get_site_by_id(site_id=site_id)

        path = validate_page_pathname(payload.path)
        parent_id = payload.parent_id
        if parent_id is not None:
            parent = await self._repo.get_page_by_id(site_id=site_id, page_id=parent_id)
            if parent is None:
                raise NotFound("Parent page not found", error="PARENT_PAGE_NOT_FOUND")

        page = await self._repo.create_page(
            site_id=site_id,
            path=path,
            parent_id=parent_id,
            sort_order=int(payload.sort_order or 0),
            visibility=payload.visibility,
            created_by_user_id=None,
        )

        return SitePageTreeNodeOut(
            id=UUID(str(page.id)),
            path=page.path,
            parent_id=_get_parent_id(page),
            sort_order=int(page.sort_order or 0),
            visibility=_as_visibility(str(page.visibility)),
            draft_revision=int(page.draft_rev or 0),
            published_revision=(int(page.published_rev) if page.published_rev is not None else None),
            children=[],
        )

    async def update_page(self, *, site_id: str, page_id: UUID, payload: SitePageUpdateIn) -> SitePageTreeNodeOut:
        if not self.settings.database.enabled:
            raise Conflict("Site pages require database storage", error="PAGES_DB_REQUIRED")

        await self._repo.get_site_by_id(site_id=site_id)

        page = await self._repo.get_page_by_id(site_id=site_id, page_id=page_id)
        if page is None:
            raise NotFound("Page not found", error="PAGE_NOT_FOUND")

        # Pydantic v2 lets us detect whether fields were provided vs omitted.
        fields_set = payload.model_fields_set

        new_path = page.path
        if "path" in fields_set and payload.path is not None:
            new_path = validate_page_pathname(payload.path)

        new_parent_id: UUID | None = _get_parent_id(page)
        if "parent_id" in fields_set:
            new_parent_id = payload.parent_id
            if new_parent_id is not None:
                parent = await self._repo.get_page_by_id(site_id=site_id, page_id=new_parent_id)
                if parent is None:
                    raise NotFound("Parent page not found", error="PARENT_PAGE_NOT_FOUND")

                pages = await self._repo.list_pages_by_site(site_id=site_id)
                parent_by_id = {UUID(str(p.id)): _get_parent_id(p) for p in pages}
                if is_descendant_or_self(
                    node_id=UUID(str(page.id)),
                    candidate_parent_id=new_parent_id,
                    parent_by_id=parent_by_id,
                ):
                    raise Conflict("Invalid parent: cycle detected", error="PAGE_TREE_CYCLE")

        new_sort_order = int(page.sort_order or 0)
        if "sort_order" in fields_set and payload.sort_order is not None:
            new_sort_order = int(payload.sort_order)

        new_visibility: Literal["public", "private"] = _as_visibility(str(page.visibility))
        if "visibility" in fields_set and payload.visibility is not None:
            new_visibility = payload.visibility

        updated = await self._repo.update_page(
            site_id=site_id,
            page_id=UUID(str(page.id)),
            path=new_path,
            parent_id=new_parent_id,
            sort_order=new_sort_order,
            visibility=new_visibility,
        )

        return SitePageTreeNodeOut(
            id=UUID(str(updated.id)),
            path=updated.path,
            parent_id=_get_parent_id(updated),
            sort_order=int(updated.sort_order or 0),
            visibility=_as_visibility(str(updated.visibility)),
            draft_revision=int(updated.draft_rev or 0),
            published_revision=(int(updated.published_rev) if updated.published_rev is not None else None),
            children=[],
        )

    async def get_page(self, *, site_id: str, page_id: UUID) -> SitePageTreeNodeOut:
        if not self.settings.database.enabled:
            raise Conflict("Site pages require database storage", error="PAGES_DB_REQUIRED")

        await self._repo.get_site_by_id(site_id=site_id)
        page = await self._repo.get_page_by_id(site_id=site_id, page_id=page_id)
        if page is None:
            raise NotFound("Page not found", error="PAGE_NOT_FOUND")

        return SitePageTreeNodeOut(
            id=UUID(str(page.id)),
            path=str(page.path),
            parent_id=_get_parent_id(page),
            sort_order=int(page.sort_order or 0),
            visibility=_as_visibility(str(page.visibility)),
            draft_revision=int(page.draft_rev or 0),
            published_revision=(int(page.published_rev) if page.published_rev is not None else None),
            children=[],
        )

    async def move_page(self, *, site_id: str, page_id: UUID, payload: SitePageMoveIn) -> SitePageTreeNodeOut:
        if not self.settings.database.enabled:
            raise Conflict("Site pages require database storage", error="PAGES_DB_REQUIRED")

        await self._repo.get_site_by_id(site_id=site_id)
        page = await self._repo.get_page_by_id(site_id=site_id, page_id=page_id)
        if page is None:
            raise NotFound("Page not found", error="PAGE_NOT_FOUND")

        new_parent_id = payload.parent_id
        if new_parent_id is not None:
            parent = await self._repo.get_page_by_id(site_id=site_id, page_id=new_parent_id)
            if parent is None:
                raise NotFound("Parent page not found", error="PARENT_PAGE_NOT_FOUND")

            pages = await self._repo.list_pages_by_site(site_id=site_id)
            parent_by_id = {UUID(str(p.id)): _get_parent_id(p) for p in pages}
            if is_descendant_or_self(
                node_id=UUID(str(page.id)),
                candidate_parent_id=new_parent_id,
                parent_by_id=parent_by_id,
            ):
                raise Conflict("Invalid parent: cycle detected", error="PAGE_TREE_CYCLE")

        updated = await self._repo.update_page(
            site_id=site_id,
            page_id=UUID(str(page.id)),
            path=page.path,
            parent_id=new_parent_id,
            sort_order=int(payload.sort_order or 0),
            visibility=str(page.visibility),
        )

        return SitePageTreeNodeOut(
            id=UUID(str(updated.id)),
            path=updated.path,
            parent_id=_get_parent_id(updated),
            sort_order=int(updated.sort_order or 0),
            visibility=_as_visibility(str(updated.visibility)),
            draft_revision=int(updated.draft_rev or 0),
            published_revision=(int(updated.published_rev) if updated.published_rev is not None else None),
            children=[],
        )

    async def delete_page(self, *, site_id: str, page_id: UUID) -> SitePageDeleteOut:
        if not self.settings.database.enabled:
            raise Conflict("Site pages require database storage", error="PAGES_DB_REQUIRED")

        await self._repo.get_site_by_id(site_id=site_id)
        page = await self._repo.get_page_by_id(site_id=site_id, page_id=page_id)
        if page is None:
            raise NotFound("Page not found", error="PAGE_NOT_FOUND")

        has_children = await self._repo.page_has_children(site_id=site_id, page_id=UUID(str(page.id)))
        if has_children:
            raise Conflict("Page has children", error="PAGE_HAS_CHILDREN")

        await self._repo.delete_page(site_id=site_id, page_id=UUID(str(page.id)))
        return SitePageDeleteOut(page_id=str(page.id))

    async def list_route_templates_paginated(
        self, *, site_id: str, params: PageParams
    ) -> PageData[SiteRouteTemplateOut]:
        if not self.settings.database.enabled:
            raise Conflict("Route templates require database storage", error="ROUTE_TEMPLATE_DB_REQUIRED")

        await self._repo.get_site_by_id(site_id=site_id)
        templates = await self._repo.list_route_templates_all(site_id=site_id)

        items: list[SiteRouteTemplateOut] = []
        for tm in templates:
            tm_like = cast(RouteTemplateIds, tm)
            entry_type_code = getattr(tm.entry_type, "code", "") if getattr(tm, "entry_type", None) is not None else ""
            tpl_rev_id = tm_like.template_page_revision_id
            items.append(
                SiteRouteTemplateOut(
                    id=UUID(str(tm.id)),
                    site_id=str(site_id),
                    path_pattern=tm.path_pattern,
                    entry_type_id=str(tm_like.entry_type_id),
                    entry_type_code=str(entry_type_code),
                    template_page_revision_id=(str(tpl_rev_id) if tpl_rev_id is not None else None),
                    is_active=bool(tm.is_active),
                )
            )

        return paginate_items(items, params=params)

    async def _get_route_templates_cache_version(self, *, site_id: str) -> int:
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

    async def _bump_route_templates_cache_version(self, *, site_id: str) -> int:
        """
        Bump route template cache version (best-effort).

        We use a monotonic-ish integer (ms timestamp) to avoid relying on Valkey atomic ops.
        """

        now_ms = int(time.time() * 1000)
        await self._repo.upsert_site_setting(
            site_id=site_id,
            namespace=ROUTE_TEMPLATES_VERSION_NAMESPACE,
            value={"version": now_ms},
            updated_by=None,
        )
        if self._route_templates_version is not None:
            await self._route_templates_version.set(site_id=site_id, version=now_ms)
        return now_ms

    async def _build_revision_deps(self, *, site_id: str, deps: dict | None) -> dict:
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

    async def create_route_template(self, *, site_id: str, payload: SiteRouteTemplateCreateIn) -> SiteRouteTemplateOut:
        if not self.settings.database.enabled:
            raise Conflict("Route templates require database storage", error="ROUTE_TEMPLATE_DB_REQUIRED")

        await self._repo.get_site_by_id(site_id=site_id)
        path_pattern = validate_route_template_pattern(payload.path_pattern)
        et = await self._repo.get_entry_type_by_code(site_id=site_id, code=payload.entry_type_code)

        tpl_rev_id: UUID | None = payload.template_page_revision_id
        if tpl_rev_id is not None:
            rev = await self._repo.get_page_revision_by_id(site_id=site_id, revision_id=tpl_rev_id)
            if rev is None:
                raise NotFound("Template page revision not found", error="TEMPLATE_REVISION_NOT_FOUND")

        rec = await self._repo.create_route_template(
            site_id=site_id,
            path_pattern=path_pattern,
            entry_type_id=UUID(str(et.id)),
            template_page_revision_id=tpl_rev_id,
            is_active=bool(payload.is_active),
        )
        await self._bump_route_templates_cache_version(site_id=site_id)
        self._repo.invalidate_route_template_cache(site_id=site_id)

        entry_type_code = getattr(rec.entry_type, "code", "")
        rec_like = cast(RouteTemplateIds, rec)
        return SiteRouteTemplateOut(
            id=UUID(str(rec.id)),
            site_id=str(site_id),
            path_pattern=rec.path_pattern,
            entry_type_id=str(rec_like.entry_type_id),
            entry_type_code=str(entry_type_code),
            template_page_revision_id=(
                str(rec_like.template_page_revision_id) if rec_like.template_page_revision_id is not None else None
            ),
            is_active=bool(rec.is_active),
        )

    async def update_route_template(
        self, *, site_id: str, template_id: UUID, payload: SiteRouteTemplateUpdateIn
    ) -> SiteRouteTemplateOut:
        if not self.settings.database.enabled:
            raise Conflict("Route templates require database storage", error="ROUTE_TEMPLATE_DB_REQUIRED")

        await self._repo.get_site_by_id(site_id=site_id)

        rec = await self._repo.get_route_template_by_id(site_id=site_id, template_id=template_id)
        if rec is None:
            raise NotFound("Route template not found", error="ROUTE_TEMPLATE_NOT_FOUND")

        fields_set = payload.model_fields_set

        path_pattern = rec.path_pattern
        if "path_pattern" in fields_set and payload.path_pattern is not None:
            path_pattern = validate_route_template_pattern(payload.path_pattern)

        entry_type_id = _get_entry_type_id(rec)
        entry_type_code = getattr(rec.entry_type, "code", "")
        if "entry_type_code" in fields_set and payload.entry_type_code is not None:
            et = await self._repo.get_entry_type_by_code(site_id=site_id, code=payload.entry_type_code)
            entry_type_id = UUID(str(et.id))
            entry_type_code = payload.entry_type_code

        tpl_rev_id: UUID | None = _get_template_page_revision_id(rec)
        if "template_page_revision_id" in fields_set:
            tpl_rev_id = payload.template_page_revision_id
            if tpl_rev_id is not None:
                rev = await self._repo.get_page_revision_by_id(site_id=site_id, revision_id=tpl_rev_id)
                if rev is None:
                    raise NotFound("Template page revision not found", error="TEMPLATE_REVISION_NOT_FOUND")

        is_active = bool(rec.is_active)
        if "is_active" in fields_set and payload.is_active is not None:
            is_active = bool(payload.is_active)

        updated = await self._repo.update_route_template(
            site_id=site_id,
            template_id=UUID(str(rec.id)),
            path_pattern=path_pattern,
            entry_type_id=entry_type_id,
            template_page_revision_id=tpl_rev_id,
            is_active=is_active,
        )
        await self._bump_route_templates_cache_version(site_id=site_id)
        self._repo.invalidate_route_template_cache(site_id=site_id)

        entry_type_code2 = getattr(updated.entry_type, "code", "") or entry_type_code
        updated_like = cast(RouteTemplateIds, updated)
        return SiteRouteTemplateOut(
            id=UUID(str(updated.id)),
            site_id=str(site_id),
            path_pattern=updated.path_pattern,
            entry_type_id=str(updated_like.entry_type_id),
            entry_type_code=str(entry_type_code2),
            template_page_revision_id=(
                str(updated_like.template_page_revision_id)
                if updated_like.template_page_revision_id is not None
                else None
            ),
            is_active=bool(updated.is_active),
        )

    async def delete_route_template(self, *, site_id: str, template_id: UUID) -> SiteRouteTemplateDeleteOut:
        if not self.settings.database.enabled:
            raise Conflict("Route templates require database storage", error="ROUTE_TEMPLATE_DB_REQUIRED")

        await self._repo.get_site_by_id(site_id=site_id)
        await self._repo.delete_route_template(site_id=site_id, template_id=template_id)
        await self._bump_route_templates_cache_version(site_id=site_id)
        self._repo.invalidate_route_template_cache(site_id=site_id)
        return SiteRouteTemplateDeleteOut(template_id=str(template_id))

    async def list_entry_types_paginated(self, *, site_id: str, params: PageParams) -> PageData[SiteEntryTypeOut]:
        if not self.settings.database.enabled:
            raise Conflict("Entry types require database storage", error="ENTRY_TYPE_DB_REQUIRED")
        await self._repo.get_site_by_id(site_id=site_id)

        items = [
            SiteEntryTypeOut(
                id=UUID(str(et.id)),
                site_id=str(site_id),
                code=str(et.code),
                name=str(et.name),
                fields_schema=(et.fields_schema if isinstance(et.fields_schema, dict) else None),
            )
            for et in await self._repo.list_entry_types(site_id=site_id)
        ]
        return paginate_items(items, params=params)

    async def create_entry_type(self, *, site_id: str, payload: SiteEntryTypeCreateIn) -> SiteEntryTypeOut:
        if not self.settings.database.enabled:
            raise Conflict("Entry types require database storage", error="ENTRY_TYPE_DB_REQUIRED")
        await self._repo.get_site_by_id(site_id=site_id)

        code = validate_entry_type_code(payload.code)
        name = (payload.name or "").strip()
        if not name:
            raise Conflict("Invalid entry type name", error="ENTRY_TYPE_NAME_INVALID")

        rec = await self._repo.create_entry_type(
            site_id=site_id,
            code=code,
            name=name,
            fields_schema=(payload.fields_schema if isinstance(payload.fields_schema, dict) else None),
        )
        return SiteEntryTypeOut(
            id=UUID(str(rec.id)),
            site_id=str(site_id),
            code=str(rec.code),
            name=str(rec.name),
            fields_schema=(rec.fields_schema if isinstance(rec.fields_schema, dict) else None),
        )

    async def update_entry_type(
        self,
        *,
        site_id: str,
        entry_type_id: UUID,
        payload: SiteEntryTypeUpdateIn,
    ) -> SiteEntryTypeOut:
        if not self.settings.database.enabled:
            raise Conflict("Entry types require database storage", error="ENTRY_TYPE_DB_REQUIRED")
        await self._repo.get_site_by_id(site_id=site_id)

        # v1: allow partial update (name/fields_schema).
        fields_set = payload.model_fields_set
        if "name" not in fields_set and "fields_schema" not in fields_set:
            raise Conflict("No fields to update", error="NO_UPDATES")

        existing = await self._repo.get_entry_type_by_id(site_id=site_id, entry_type_id=entry_type_id)
        if existing is None:
            raise NotFound("Entry type not found", error="ENTRY_TYPE_NOT_FOUND")

        name = str(existing.name)
        if "name" in fields_set and payload.name is not None:
            name = (payload.name or "").strip()
            if not name:
                raise Conflict("Invalid entry type name", error="ENTRY_TYPE_NAME_INVALID")

        fields_schema = existing.fields_schema if isinstance(existing.fields_schema, dict) else None
        if "fields_schema" in fields_set:
            fields_schema = payload.fields_schema if isinstance(payload.fields_schema, dict) else None

        updated = await self._repo.update_entry_type(
            site_id=site_id,
            entry_type_id=entry_type_id,
            name=name,
            fields_schema=(fields_schema if isinstance(fields_schema, dict) else None),
        )
        return SiteEntryTypeOut(
            id=UUID(str(updated.id)),
            site_id=str(site_id),
            code=str(updated.code),
            name=str(updated.name),
            fields_schema=(updated.fields_schema if isinstance(updated.fields_schema, dict) else None),
        )

    async def delete_entry_type(self, *, site_id: str, entry_type_id: UUID) -> SiteEntryTypeDeleteOut:
        if not self.settings.database.enabled:
            raise Conflict("Entry types require database storage", error="ENTRY_TYPE_DB_REQUIRED")
        await self._repo.get_site_by_id(site_id=site_id)
        await self._repo.delete_entry_type(site_id=site_id, entry_type_id=entry_type_id)
        return SiteEntryTypeDeleteOut(entry_type_id=str(entry_type_id))

    async def list_entries_paginated(
        self,
        *,
        site_id: str,
        params: PageParams,
        entry_type_code: str | None,
    ) -> PageData[SiteEntryOut]:
        if not self.settings.database.enabled:
            raise Conflict("Entries require database storage", error="ENTRY_DB_REQUIRED")
        await self._repo.get_site_by_id(site_id=site_id)

        entry_type_id: UUID | None = None
        if entry_type_code is not None:
            et = await self._repo.get_entry_type_by_code(site_id=site_id, code=entry_type_code)
            entry_type_id = UUID(str(et.id))

        entries = await self._repo.list_entries(site_id=site_id, entry_type_id=entry_type_id)
        items: list[SiteEntryOut] = []
        for e in entries:
            et_code = getattr(e.entry_type, "code", "") if getattr(e, "entry_type", None) is not None else ""
            entry_type_id_value = _get_entry_type_id(e)
            items.append(
                SiteEntryOut(
                    id=UUID(str(e.id)),
                    site_id=str(site_id),
                    entry_type_id=str(entry_type_id_value),
                    entry_type_code=str(et_code),
                    slug=str(e.slug),
                    draft_revision=int(e.draft_rev or 0),
                    published_revision=(int(e.published_rev) if e.published_rev is not None else None),
                )
            )
        return paginate_items(items, params=params)

    async def create_entry(self, *, site_id: str, payload: SiteEntryCreateIn) -> SiteEntryOut:
        if not self.settings.database.enabled:
            raise Conflict("Entries require database storage", error="ENTRY_DB_REQUIRED")
        await self._repo.get_site_by_id(site_id=site_id)

        et = await self._repo.get_entry_type_by_code(site_id=site_id, code=payload.entry_type_code)
        entry = await self._repo.create_entry(
            site_id=site_id,
            entry_type_id=UUID(str(et.id)),
            slug=payload.slug,
            created_by_user_id=None,
        )
        entry_type_id_value = _get_entry_type_id(entry)
        return SiteEntryOut(
            id=UUID(str(entry.id)),
            site_id=str(site_id),
            entry_type_id=str(entry_type_id_value),
            entry_type_code=str(payload.entry_type_code),
            slug=str(entry.slug),
            draft_revision=int(entry.draft_rev or 0),
            published_revision=(int(entry.published_rev) if entry.published_rev is not None else None),
        )

    async def update_entry(self, *, site_id: str, entry_id: UUID, payload: SiteEntryUpdateIn) -> SiteEntryOut:
        if not self.settings.database.enabled:
            raise Conflict("Entries require database storage", error="ENTRY_DB_REQUIRED")
        await self._repo.get_site_by_id(site_id=site_id)

        fields_set = payload.model_fields_set
        if "slug" not in fields_set or payload.slug is None:
            raise Conflict("No fields to update", error="NO_UPDATES")

        updated = await self._repo.update_entry_slug(site_id=site_id, entry_id=entry_id, slug=payload.slug)
        entry_type_id_value = _get_entry_type_id(updated)
        et = await self._repo.get_entry_type_by_id(site_id=site_id, entry_type_id=entry_type_id_value)
        if et is None:
            raise NotFound("Entry type not found", error="ENTRY_TYPE_NOT_FOUND")
        return SiteEntryOut(
            id=UUID(str(updated.id)),
            site_id=str(site_id),
            entry_type_id=str(entry_type_id_value),
            entry_type_code=str(et.code),
            slug=str(updated.slug),
            draft_revision=int(updated.draft_rev or 0),
            published_revision=(int(updated.published_rev) if updated.published_rev is not None else None),
        )

    async def unpublish_entry(self, *, site_id: str, payload: SiteEntryUnpublishIn) -> SiteEntryUnpublishOut:
        if not self.settings.database.enabled:
            raise Conflict("Publishing requires database storage", error="PUBLISH_DB_REQUIRED")

        await self._repo.get_site_by_id(site_id=site_id)
        et = await self._repo.get_entry_type_by_code(site_id=site_id, code=payload.entry_type_code)
        entry_id, now_ms = await self._repo.unpublish_entry_by_slug(
            site_id=site_id,
            entry_type_id=UUID(str(et.id)),
            slug=payload.slug,
        )
        return SiteEntryUnpublishOut(
            site_id=site_id,
            entry_id=str(entry_id),
            entry_type_code=payload.entry_type_code,
            slug=(payload.slug or "").strip(),
            unpublished_at_ms=now_ms,
        )

    async def delete_entry(self, *, site_id: str, entry_id: UUID) -> SiteEntryDeleteOut:
        if not self.settings.database.enabled:
            raise Conflict("Entries require database storage", error="ENTRY_DB_REQUIRED")
        await self._repo.get_site_by_id(site_id=site_id)
        await self._repo.delete_entry(site_id=site_id, entry_id=entry_id)
        return SiteEntryDeleteOut(entry_id=str(entry_id))

    async def rollback_page_revision(
        self,
        *,
        site_id: str,
        page_id: UUID,
        payload: SitePageRollbackIn,
    ) -> SitePageRollbackOut:
        if not self.settings.database.enabled:
            raise Conflict("Page revisions require database storage", error="PAGE_REVISION_DB_REQUIRED")
        await self._repo.get_site_by_id(site_id=site_id)

        from_rev, to_rev, rolled_back_at_ms = await self._repo.rollback_page_revision_pointer(
            site_id=site_id,
            page_id=page_id,
            target=payload.target,
            revision=payload.revision,
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
            page_id=str(page_id),
            target=payload.target,
            from_revision=from_rev,
            to_revision=to_rev,
            rolled_back_at_ms=rolled_back_at_ms,
        )

    async def rollback_entry_revision(
        self,
        *,
        site_id: str,
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
            entry_id=str(entry_id),
            target=payload.target,
            from_revision=from_rev,
            to_revision=to_rev,
            rolled_back_at_ms=rolled_back_at_ms,
        )

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
            meta=(rec.meta if isinstance(rec.meta, dict) else None),
            style_overrides=(rec.style_overrides if isinstance(rec.style_overrides, dict) else None),
            variant_id=(str(rec.variant_id) if rec.variant_id else None),
            deps=(rec.deps if isinstance(rec.deps, dict) else None),
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
            meta=(rec.meta if isinstance(rec.meta, dict) else None),
            style_overrides=(rec.style_overrides if isinstance(rec.style_overrides, dict) else None),
            variant_id=(str(rec.variant_id) if rec.variant_id else None),
            deps=(rec.deps if isinstance(rec.deps, dict) else None),
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
                            page_id=str(page.id),
                            variant_id=(str(rec.variant_id) if rec.variant_id else None),
                            revision=int(use_rev),
                            revision_state=state,
                            draft_revision=draft_rev,
                            published_revision=(published_rev if published_rev else None),
                        ),
                        document=doc,
                    )

            # No published revision in public mode -> treat as not found.
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
                            entry_id=str(resolved.entry_id),
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
        site_id: str,
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
        site_id: str,
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
        site_id: str,
        page_id: UUID,
        payload: SitePageDraftSaveIn,
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
            created_by_user_id=None,
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
            page_id=str(page_id),
            path=path,
            revision=revision,
            saved_at_ms=saved_at_ms or now_ms,
        )

    async def publish_page(
        self,
        *,
        site_id: str,
        page_id: UUID,
        payload: SitePagePublishIn,
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
            page_id=str(page_id),
            path=path,
            revision=revision,
            published_at_ms=published_at_ms or now_ms,
        )

    async def unpublish_page(self, *, site_id: str, page_id: UUID) -> SitePageUnpublishOut:
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
        path, unpublished_at_ms = await self._repo.unpublish_page_by_id(site_id=site_id, page_id=page_id)

        self.logger.info(
            "Unpublished page",
            site_id=str(site_id),
            page_id=str(page_id),
            path=str(path),
        )

        return SitePageUnpublishOut(
            site_id=site_id,
            page_id=str(page_id),
            path=path,
            unpublished_at_ms=unpublished_at_ms or now_ms,
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
