from __future__ import annotations

import secrets
import time
from typing import Literal, cast
from uuid import UUID

from pydantic import ValidationError

from apps.api.common.protocols.tortoise import HasWorkspaceId
from apps.api.common.services.base import BaseService
from apps.api.common.utils.public_ids import encode_uuid
from apps.api.core.exceptions import Conflict, Forbidden, NotFound, ServiceUnavailable
from apps.api.core.http.pagination import PageData, PageParams
from apps.api.infra.cache.valkey import ValkeyClientLike
from apps.api.modules.sites.constants import (
    RUNTIME_SETTING_NAMESPACE,
    THEME_ACTIVE_NAMESPACE,
    THEME_CONFIG_NAMESPACE,
    THEME_VARS_NAMESPACE,
)
from apps.api.modules.sites.content_service import SiteContentService
from apps.api.modules.sites.publishing_service import SitePublishingService
from apps.api.modules.sites.repository import SitesRepository
from apps.api.modules.sites.schema import (
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
    SitePreviewTokenOut,
    SiteResolveOut,
    SiteRouteDraftSaveIn,
    SiteRouteDraftSaveOut,
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


class SiteService(BaseService):
    """
    Sites service (Portal consumption + editor/management APIs).

    Notes:
    - Portal should not run as a standalone app without backend dependencies.
    - Preview token and presence are Valkey-backed (TTL).
    """

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

    def __init__(self, settings, valkey: ValkeyClientLike | None = None) -> None:
        super().__init__(settings)
        self._repo = SitesRepository()
        self._preview_tokens = PreviewTokenStore(valkey) if valkey is not None else None
        self._presence = PresenceStore(valkey) if valkey is not None else None
        self._route_templates_version = RouteTemplateVersionStore(valkey) if valkey is not None else None
        self._content = SiteContentService(
            settings,
            repo=self._repo,
            route_templates_version=self._route_templates_version,
        )
        self._publishing = SitePublishingService(
            settings,
            repo=self._repo,
            presence=self._presence,
            route_templates_version=self._route_templates_version,
        )

    async def create_preview_token(self, *, site_id: UUID, ttl_seconds: int = 600) -> SitePreviewTokenOut:
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
            site_id=UUID(str(site.id)),
            default_locale=site.default_locale,
            fallback_locale=site.fallback_locale,
        )

    async def get_runtime(self, *, site_id: UUID, mode: Literal["public", "preview"]) -> SiteRuntimeOut:
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
                except ValidationError:
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
                    tokens_css_url = f"/assets/{encode_uuid(UUID(str(tokens_asset.id)))}/{slug}.{ext}"

                if theme_pkg.base_css_asset_id:
                    base_asset = await AssetRecord.get_or_none(
                        id=theme_pkg.base_css_asset_id,
                        workspace_id=workspace_id,
                        deleted_at=None,
                    )
                    if base_asset is not None:
                        slug = (base_asset.slug or "asset").strip() or "asset"
                        ext = (base_asset.ext or "css").lstrip(".").lower() or "css"
                        base_css_url = f"/assets/{encode_uuid(UUID(str(base_asset.id)))}/{slug}.{ext}"

        # Theme config v0:
        # - Stored under site settings namespace `theme.config`.
        # - Treated as public-safe configuration that affects SSR output (e.g. list limits).
        # - Secrets must NOT be stored here; use secret-capable settings namespaces instead.
        # Only expose theme config in preview runtime. Public runtime must not leak potentially sensitive
        # configuration values (tests rely on this behavior).
        config_out = (
            theme_config.value
            if (mode == "preview" and theme_config and isinstance(theme_config.value, dict))
            else None
        )

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

    async def get_site_setting(self, *, site_id: UUID, namespace: str) -> SiteSettingGetOut:
        if not self.settings.database.enabled:
            raise Conflict("Site settings require database storage", error="SETTINGS_DB_REQUIRED")
        await self._repo.get_site_by_id(site_id=site_id)
        rec = await self._repo.get_site_setting(site_id=site_id, namespace=namespace)
        value = rec.value if rec and isinstance(rec.value, dict) else None
        return SiteSettingGetOut(namespace=namespace, value=value)

    async def upsert_site_setting(
        self, *, site_id: UUID, namespace: str, payload: SiteSettingUpsertIn
    ) -> SiteSettingGetOut:
        if not self.settings.database.enabled:
            raise Conflict("Site settings require database storage", error="SETTINGS_DB_REQUIRED")
        await self._repo.get_site_by_id(site_id=site_id)
        rec = await self._repo.upsert_site_setting(
            site_id=site_id, namespace=namespace, value=payload.value, updated_by=None
        )
        value = rec.value if isinstance(rec.value, dict) else None
        return SiteSettingGetOut(namespace=namespace, value=value)

    async def list_pages_tree(self, *, site_id: UUID) -> PageData[SitePageTreeNodeOut]:
        return await self._content.list_pages_tree(site_id=site_id)

    async def create_page(
        self,
        *,
        site_id: UUID,
        payload: SitePageCreateIn,
        actor_user_id: UUID | None = None,
    ) -> SitePageTreeNodeOut:
        return await self._content.create_page(site_id=site_id, payload=payload, actor_user_id=actor_user_id)

    async def update_page(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        payload: SitePageUpdateIn,
        actor_user_id: UUID | None = None,
    ) -> SitePageTreeNodeOut:
        return await self._content.update_page(
            site_id=site_id,
            page_id=page_id,
            payload=payload,
            actor_user_id=actor_user_id,
        )

    async def get_page(self, *, site_id: UUID, page_id: UUID) -> SitePageTreeNodeOut:
        return await self._content.get_page(site_id=site_id, page_id=page_id)

    async def move_page(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        payload: SitePageMoveIn,
        actor_user_id: UUID | None = None,
    ) -> SitePageTreeNodeOut:
        return await self._content.move_page(
            site_id=site_id,
            page_id=page_id,
            payload=payload,
            actor_user_id=actor_user_id,
        )

    async def delete_page(self, *, site_id: UUID, page_id: UUID) -> SitePageDeleteOut:
        return await self._content.delete_page(site_id=site_id, page_id=page_id)

    async def list_route_templates_paginated(
        self, *, site_id: UUID, params: PageParams
    ) -> PageData[SiteRouteTemplateOut]:
        return await self._content.list_route_templates_paginated(site_id=site_id, params=params)

    async def _bump_route_templates_cache_version(self, *, site_id: UUID) -> int:
        return await self._content._bump_route_templates_cache_version(site_id=site_id)

    async def create_route_template(self, *, site_id: UUID, payload: SiteRouteTemplateCreateIn) -> SiteRouteTemplateOut:
        return await self._content.create_route_template(site_id=site_id, payload=payload)

    async def update_route_template(
        self, *, site_id: UUID, template_id: UUID, payload: SiteRouteTemplateUpdateIn
    ) -> SiteRouteTemplateOut:
        return await self._content.update_route_template(site_id=site_id, template_id=template_id, payload=payload)

    async def delete_route_template(self, *, site_id: UUID, template_id: UUID) -> SiteRouteTemplateDeleteOut:
        return await self._content.delete_route_template(site_id=site_id, template_id=template_id)

    async def list_entry_types_paginated(self, *, site_id: UUID, params: PageParams) -> PageData[SiteEntryTypeOut]:
        return await self._content.list_entry_types_paginated(site_id=site_id, params=params)

    async def create_entry_type(self, *, site_id: UUID, payload: SiteEntryTypeCreateIn) -> SiteEntryTypeOut:
        return await self._content.create_entry_type(site_id=site_id, payload=payload)

    async def update_entry_type(
        self,
        *,
        site_id: UUID,
        entry_type_id: UUID,
        payload: SiteEntryTypeUpdateIn,
    ) -> SiteEntryTypeOut:
        return await self._content.update_entry_type(site_id=site_id, entry_type_id=entry_type_id, payload=payload)

    async def delete_entry_type(self, *, site_id: UUID, entry_type_id: UUID) -> SiteEntryTypeDeleteOut:
        return await self._content.delete_entry_type(site_id=site_id, entry_type_id=entry_type_id)

    async def list_entries_paginated(
        self,
        *,
        site_id: UUID,
        params: PageParams,
        entry_type_code: str | None,
    ) -> PageData[SiteEntryOut]:
        return await self._content.list_entries_paginated(
            site_id=site_id,
            params=params,
            entry_type_code=entry_type_code,
        )

    async def create_entry(self, *, site_id: UUID, payload: SiteEntryCreateIn) -> SiteEntryOut:
        return await self._content.create_entry(site_id=site_id, payload=payload)

    async def update_entry(self, *, site_id: UUID, entry_id: UUID, payload: SiteEntryUpdateIn) -> SiteEntryOut:
        return await self._content.update_entry(site_id=site_id, entry_id=entry_id, payload=payload)

    async def unpublish_entry(self, *, site_id: UUID, payload: SiteEntryUnpublishIn) -> SiteEntryUnpublishOut:
        return await self._content.unpublish_entry(site_id=site_id, payload=payload)

    async def delete_entry(self, *, site_id: UUID, entry_id: UUID) -> SiteEntryDeleteOut:
        return await self._content.delete_entry(site_id=site_id, entry_id=entry_id)

    async def rollback_page_revision(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        payload: SitePageRollbackIn,
        actor_user_id: UUID | None = None,
    ) -> SitePageRollbackOut:
        return await self._publishing.rollback_page_revision(
            site_id=site_id,
            page_id=page_id,
            payload=payload,
            actor_user_id=actor_user_id,
        )

    async def rollback_entry_revision(
        self,
        *,
        site_id: UUID,
        entry_id: UUID,
        payload: SiteEntryRollbackIn,
    ) -> SiteEntryRollbackOut:
        return await self._publishing.rollback_entry_revision(site_id=site_id, entry_id=entry_id, payload=payload)

    async def get_page_revision(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        state: Literal["draft", "published"],
    ) -> SitePageRevisionOut:
        return await self._publishing.get_page_revision(site_id=site_id, page_id=page_id, state=state)

    async def get_entry_revision(
        self,
        *,
        site_id: UUID,
        entry_id: UUID,
        state: Literal["draft", "published"],
    ) -> SiteEntryRevisionOut:
        return await self._publishing.get_entry_revision(site_id=site_id, entry_id=entry_id, state=state)

    async def save_entry_draft(
        self,
        *,
        site_id: UUID,
        payload: SiteEntryDraftSaveIn,
    ) -> SiteEntryDraftSaveOut:
        return await self._publishing.save_entry_draft(site_id=site_id, payload=payload)

    async def publish_entry(
        self,
        *,
        site_id: UUID,
        payload: SiteEntryPublishIn,
    ) -> SiteEntryPublishOut:
        return await self._publishing.publish_entry(site_id=site_id, payload=payload)

    async def resolve_route(
        self,
        *,
        site_id: UUID,
        path: str,
        mode: Literal["public", "preview"],
    ) -> SiteRouteResolveOut:
        return await self._publishing.resolve_route(site_id=site_id, path=path, mode=mode)

    async def save_route_draft(
        self,
        *,
        site_id: UUID,
        payload: SiteRouteDraftSaveIn,
    ) -> SiteRouteDraftSaveOut:
        return await self._publishing.save_route_draft(site_id=site_id, payload=payload)

    async def publish_route(
        self,
        *,
        site_id: UUID,
        payload: SiteRoutePublishIn,
    ) -> SiteRoutePublishOut:
        return await self._publishing.publish_route(site_id=site_id, payload=payload)

    async def save_page_draft(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        payload: SitePageDraftSaveIn,
        actor_user_id: UUID | None = None,
    ) -> SitePageDraftSaveOut:
        return await self._publishing.save_page_draft(
            site_id=site_id,
            page_id=page_id,
            payload=payload,
            actor_user_id=actor_user_id,
        )

    async def publish_page(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        payload: SitePagePublishIn,
        actor_user_id: UUID | None = None,
    ) -> SitePagePublishOut:
        return await self._publishing.publish_page(
            site_id=site_id,
            page_id=page_id,
            payload=payload,
            actor_user_id=actor_user_id,
        )

    async def unpublish_page(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        actor_user_id: UUID | None = None,
    ) -> SitePageUnpublishOut:
        return await self._publishing.unpublish_page(
            site_id=site_id,
            page_id=page_id,
            actor_user_id=actor_user_id,
        )

    async def heartbeat_presence(
        self,
        *,
        site_id: UUID,
        payload: SitePresenceHeartbeatIn,
    ) -> SitePresenceHeartbeatOut:
        return await self._publishing.heartbeat_presence(site_id=site_id, payload=payload)

    async def list_presence(self, *, site_id: UUID, doc_key: str) -> SitePresenceListOut:
        return await self._publishing.list_presence(site_id=site_id, doc_key=doc_key)

    async def get_sitemap_xml(self, *, site_id: UUID) -> str:
        return await self._publishing.get_sitemap_xml(site_id=site_id)
