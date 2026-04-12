from __future__ import annotations

from typing import Any
from urllib.parse import urljoin, urlparse
from uuid import UUID

from pydantic import ValidationError

from src.common.services import BaseService
from src.config import Settings
from src.core.exceptions import BadRequest, NotFound
from src.core.logging import get_logger
from src.models.extensions.app import ExtensionApp
from src.modules.extensions.manifest import AppManifest, CapabilityDecl, UIEmbedDecl
from src.modules.extensions.repository import ExtensionsRepository
from src.modules.extensions.schema import (
    AppProvider,
    AppScope,
    CapabilitySummaryOut,
    UIEmbedDescriptorOut,
)

logger = get_logger(__name__)


class ExtensionsService(BaseService):
    """
    Capability-first extension platform service (v1 foundation).
    """

    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.repo = ExtensionsRepository()

    async def list_workspace_capabilities(self, *, workspace_id: UUID) -> list[CapabilitySummaryOut]:
        apps = await self.repo.list_apps()
        enabled = await self.repo.list_workspace_enabled_capability_ids(workspace_id=workspace_id)
        return self._collect_capabilities(apps=apps, enabled_ids=enabled, scope=AppScope.WORKSPACE)

    async def list_org_capabilities(self, *, organization_id: UUID) -> list[CapabilitySummaryOut]:
        apps = await self.repo.list_apps()
        enabled = await self.repo.list_org_enabled_capability_ids(organization_id=organization_id)
        return self._collect_capabilities(apps=apps, enabled_ids=enabled, scope=AppScope.ORGANIZATION)

    async def set_workspace_capability_enabled(
        self,
        *,
        workspace_id: UUID,
        capability_id: str,
        enabled: bool,
    ) -> CapabilitySummaryOut:
        cid = capability_id.strip()
        if not cid:
            raise BadRequest(message="capability_id is required", error="CAPABILITY_ID_REQUIRED")
        apps = await self.repo.list_apps()
        resolved = self._find_capability(apps=apps, capability_id=cid)
        if resolved is None:
            raise NotFound(message="Capability not found", error="CAPABILITY_NOT_FOUND")
        cap, app, provider, app_icon_url = resolved
        if cap.scope != AppScope.WORKSPACE:
            raise BadRequest(message="Capability scope mismatch", error="CAPABILITY_SCOPE_MISMATCH")
        await self.repo.set_workspace_capability_enabled(workspace_id=workspace_id, capability_id=cid, enabled=enabled)
        enabled_ids = await self.repo.list_workspace_enabled_capability_ids(workspace_id=workspace_id)
        return self._to_capability_summary(
            cap,
            app=app,
            provider=provider,
            enabled_ids=enabled_ids,
            app_icon_url=app_icon_url,
        )

    async def set_org_capability_enabled(
        self,
        *,
        organization_id: UUID,
        capability_id: str,
        enabled: bool,
    ) -> CapabilitySummaryOut:
        cid = capability_id.strip()
        if not cid:
            raise BadRequest(message="capability_id is required", error="CAPABILITY_ID_REQUIRED")
        apps = await self.repo.list_apps()
        resolved = self._find_capability(apps=apps, capability_id=cid)
        if resolved is None:
            raise NotFound(message="Capability not found", error="CAPABILITY_NOT_FOUND")
        cap, app, provider, app_icon_url = resolved
        if cap.scope != AppScope.ORGANIZATION:
            raise BadRequest(message="Capability scope mismatch", error="CAPABILITY_SCOPE_MISMATCH")
        await self.repo.set_org_capability_enabled(organization_id=organization_id, capability_id=cid, enabled=enabled)
        enabled_ids = await self.repo.list_org_enabled_capability_ids(organization_id=organization_id)
        return self._to_capability_summary(
            cap,
            app=app,
            provider=provider,
            enabled_ids=enabled_ids,
            app_icon_url=app_icon_url,
        )

    async def list_workspace_ui_embeds(
        self,
        *,
        workspace_id: UUID,
        slot: str | None = None,
        capability_id: str | None = None,
        enabled_only: bool = True,
    ) -> list[UIEmbedDescriptorOut]:
        apps = await self.repo.list_apps()
        enabled_ids = await self.repo.list_workspace_enabled_capability_ids(workspace_id=workspace_id)
        return self._collect_ui_embeds(
            apps=apps,
            enabled_ids=enabled_ids,
            scope=AppScope.WORKSPACE,
            slot=slot,
            capability_id=capability_id,
            enabled_only=enabled_only,
        )

    async def list_org_ui_embeds(
        self,
        *,
        organization_id: UUID,
        slot: str | None = None,
        capability_id: str | None = None,
        enabled_only: bool = True,
    ) -> list[UIEmbedDescriptorOut]:
        apps = await self.repo.list_apps()
        enabled_ids = await self.repo.list_org_enabled_capability_ids(organization_id=organization_id)
        return self._collect_ui_embeds(
            apps=apps,
            enabled_ids=enabled_ids,
            scope=AppScope.ORGANIZATION,
            slot=slot,
            capability_id=capability_id,
            enabled_only=enabled_only,
        )

    def _collect_capabilities(
        self,
        *,
        apps: list[ExtensionApp],
        enabled_ids: set[str],
        scope: AppScope,
    ) -> list[CapabilitySummaryOut]:
        items: list[CapabilitySummaryOut] = []
        for app in apps:
            manifest = self._parse_manifest(app)
            if manifest is None:
                continue
            provider = self._parse_provider(app.provider)
            for cap in manifest.capabilities:
                if cap.scope != scope:
                    continue
                items.append(
                    self._to_capability_summary(
                        cap,
                        app=app,
                        provider=provider,
                        enabled_ids=enabled_ids,
                        app_icon_url=manifest.app.icon_url,
                    )
                )
        items.sort(key=lambda x: (x.kind, x.provider, x.scope, x.capability_id))
        return items

    def _collect_ui_embeds(
        self,
        *,
        apps: list[ExtensionApp],
        enabled_ids: set[str],
        scope: AppScope,
        slot: str | None,
        capability_id: str | None,
        enabled_only: bool,
    ) -> list[UIEmbedDescriptorOut]:
        normalized_slot = (slot or "").strip()
        normalized_cid = (capability_id or "").strip()
        items: list[UIEmbedDescriptorOut] = []
        for app in apps:
            manifest = self._parse_manifest(app)
            if manifest is None:
                continue
            for cap in manifest.capabilities:
                cid = str(cap.capability_id or "").strip()
                if not self._capability_matches_ui_embed_filters(
                    cap,
                    capability_id=cid,
                    scope=scope,
                    normalized_cid=normalized_cid,
                    enabled_only=enabled_only,
                    enabled_ids=enabled_ids,
                ):
                    continue
                for embed in cap.ui_embeds:
                    if normalized_slot and str(embed.slot or "").strip() != normalized_slot:
                        continue
                    descriptor = self._to_ui_embed_descriptor(app=app, capability_id=cid, embed=embed)
                    if descriptor is None:
                        continue
                    items.append(descriptor)
        items.sort(key=lambda x: (x.kind, x.slot, x.capability_id, x.id))
        return items

    @staticmethod
    def _capability_matches_ui_embed_filters(
        cap: CapabilityDecl,
        *,
        capability_id: str,
        scope: AppScope,
        normalized_cid: str,
        enabled_only: bool,
        enabled_ids: set[str],
    ) -> bool:
        if cap.scope != scope:
            return False
        if normalized_cid and capability_id != normalized_cid:
            return False
        if not enabled_only:
            return True
        return bool(capability_id) and capability_id in enabled_ids

    def _to_ui_embed_descriptor(
        self,
        *,
        app: ExtensionApp,
        capability_id: str,
        embed: UIEmbedDecl,
    ) -> UIEmbedDescriptorOut | None:
        embed_id = str(embed.id or "").strip()
        embed_url = self._normalize_embed_url(embed.embed_url, base_url=app.base_url)
        if embed_url is None:
            logger.warning(
                "UI embed url invalid",
                action="extensions_ui_embed_invalid_url",
                app_id=app.app_id,
                capability_id=capability_id,
                embed_id=embed_id,
            )
            return None
        title = str(embed.title or "").strip()
        if not title:
            title = embed_id or "Embed"
        return UIEmbedDescriptorOut(
            id=embed_id,
            capability_id=capability_id,
            kind=embed.kind,
            slot=str(embed.slot or "").strip(),
            title=title,
            title_i18n=embed.title_i18n,
            icon=embed.icon,
            embed_url=embed_url,
            sandbox=embed.sandbox,
            permission_code=embed.permission_code,
            meta=_safe_meta(embed.meta),
        )

    def _to_capability_summary(
        self,
        cap: CapabilityDecl,
        *,
        app: ExtensionApp,
        provider: AppProvider,
        enabled_ids: set[str],
        app_icon_url: str | None,
    ) -> CapabilitySummaryOut:
        cid = str(cap.capability_id or "").strip()
        return CapabilitySummaryOut(
            capability_id=cid,
            kind=cap.kind,
            provider=provider,
            scope=cap.scope,
            name=str(cap.name or ""),
            description=str(cap.description) if cap.description else None,
            name_i18n=cap.name_i18n,
            description_i18n=cap.description_i18n,
            version=str(app.version) if app.version else None,
            enabled=cid in enabled_ids if cid else False,
            icon_url=str(app_icon_url) if app_icon_url else None,
            meta=_safe_meta(getattr(cap, "meta", None)),
        )

    def _find_capability(
        self,
        *,
        apps: list[ExtensionApp],
        capability_id: str,
    ) -> tuple[CapabilityDecl, ExtensionApp, AppProvider, str | None] | None:
        cid = capability_id.strip()
        if not cid:
            return None
        for app in apps:
            manifest = self._parse_manifest(app)
            if manifest is None:
                continue
            provider = self._parse_provider(app.provider)
            for cap in manifest.capabilities:
                if str(cap.capability_id or "").strip() == cid:
                    return cap, app, provider, manifest.app.icon_url
        return None

    @staticmethod
    def _normalize_embed_url(value: str, *, base_url: str | None) -> str | None:
        raw = value.strip()
        if not raw:
            return None
        candidate = urljoin(base_url.strip() + "/", raw) if base_url and not _is_http_url(raw) else raw
        parsed = urlparse(candidate)
        if parsed.scheme not in {"http", "https"}:
            return None
        if not parsed.netloc:
            return None
        return candidate

    def _parse_manifest(self, app: ExtensionApp) -> AppManifest | None:
        raw = app.manifest
        if not isinstance(raw, dict):
            return None
        try:
            return AppManifest.model_validate(raw)
        except ValidationError as exc:
            logger.warning(
                "Extension app manifest invalid",
                action="parse_extension_manifest",
                app_id=app.app_id,
                error=str(exc),
            )
            return None
        except Exception as exc:
            logger.warning(
                "Extension app manifest parse failed",
                action="parse_extension_manifest",
                app_id=app.app_id,
                error=str(exc),
            )
            return None

    @staticmethod
    def _parse_provider(raw: str | None) -> AppProvider:
        val = (raw or "").strip().lower()
        if val == "official":
            return AppProvider.OFFICIAL
        return AppProvider.COMMUNITY


def _safe_meta(value: Any) -> dict[str, Any] | None:
    return value if isinstance(value, dict) else None


def _is_http_url(value: str) -> bool:
    try:
        parsed = urlparse(value.strip())
    except Exception:
        return False
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)
