from __future__ import annotations

from typing import cast
from uuid import UUID
from xml.sax.saxutils import escape as xml_escape

from src.common.protocols.tortoise import HasProjectId
from src.core.exceptions import Conflict
from src.core.services import BaseService
from src.models.system.setting import SettingRecord
from src.modules.sites.repository import SitesRepository
from src.settings.core_schema import CORE_SETTINGS_NAMESPACE
from src.settings.scopes import SCOPE_TYPE_PROJECT


class PublishingSitemapService(BaseService):
    def __init__(
        self,
        settings,
        *,
        repo: SitesRepository,
    ) -> None:
        super().__init__(settings)
        self._repo = repo

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

        project_id = UUID(str(cast(HasProjectId, site).project_id))

        base = "https://example.test" if self.settings.app_env == "test" else "https://example.invalid"
        rec = await SettingRecord.get_or_none(
            scope_type=SCOPE_TYPE_PROJECT,
            scope_id=project_id,
            namespace=CORE_SETTINGS_NAMESPACE,
        )
        value = rec.value if rec is not None and isinstance(rec.value, dict) else {}
        site_cfg = value.get("site") if isinstance(value, dict) else None
        raw_url = site_cfg.get("url") if isinstance(site_cfg, dict) else None
        if isinstance(raw_url, str) and raw_url.strip():
            candidate = raw_url.strip().rstrip("/")
            if "://" not in candidate:
                candidate = f"http://{candidate}"
            base = candidate
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
