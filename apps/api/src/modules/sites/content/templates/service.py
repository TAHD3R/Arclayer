from __future__ import annotations

import time
from typing import cast
from uuid import UUID

from apps.api.src.common.protocols.tortoise import HasEntryTypeId, RouteTemplateIds
from apps.api.src.common.services.base import BaseService
from apps.api.src.core.exceptions import Conflict, NotFound
from apps.api.src.core.http.pagination import PageData, PageParams, paginate_items
from apps.api.src.modules.sites.namespaces.service import ROUTE_TEMPLATES_VERSION_NAMESPACE
from apps.api.src.modules.sites.repository import SitesRepository
from apps.api.src.modules.sites.schema import (
    SiteRouteTemplateCreateIn,
    SiteRouteTemplateDeleteOut,
    SiteRouteTemplateOut,
    SiteRouteTemplateUpdateIn,
)
from apps.api.src.modules.sites.shared.service import validate_route_template_pattern
from apps.api.src.modules.sites.stores.service import RouteTemplateVersionStore


def _get_entry_type_id(value: object) -> UUID:
    raw = cast(HasEntryTypeId, value).entry_type_id
    return UUID(str(raw))


def _get_template_page_revision_id(value: object) -> UUID | None:
    raw = cast(RouteTemplateIds, value).template_page_revision_id
    return UUID(str(raw)) if raw is not None else None


class ContentTemplatesService(BaseService):
    def __init__(
        self,
        settings,
        *,
        repo: SitesRepository,
        route_templates_version: RouteTemplateVersionStore | None,
    ) -> None:
        super().__init__(settings)
        self._repo = repo
        self._route_templates_version = route_templates_version

    async def list_route_templates_paginated(
        self,
        *,
        site_id: UUID,
        params: PageParams,
    ) -> PageData[SiteRouteTemplateOut]:
        if not self.settings.database.enabled:
            raise Conflict("Route templates require database storage", error="ROUTE_TEMPLATE_DB_REQUIRED")

        await self._repo.get_site_by_id(site_id=site_id)
        templates = await self._repo.list_route_templates_all(site_id=site_id)

        items: list[SiteRouteTemplateOut] = []
        for tm in templates:
            tm_like = cast(RouteTemplateIds, tm)
            entry_type_code = getattr(tm.entry_type, "code", "") if getattr(tm, "entry_type", None) is not None else ""
            items.append(
                SiteRouteTemplateOut(
                    id=UUID(str(tm.id)),
                    site_id=site_id,
                    path_pattern=tm.path_pattern,
                    entry_type_id=UUID(str(tm_like.entry_type_id)),
                    entry_type_code=str(entry_type_code),
                    template_page_revision_id=_get_template_page_revision_id(tm),
                    is_active=bool(tm.is_active),
                )
            )

        return paginate_items(items, params=params)

    async def _bump_route_templates_cache_version(self, *, site_id: UUID) -> int:
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

    async def create_route_template(self, *, site_id: UUID, payload: SiteRouteTemplateCreateIn) -> SiteRouteTemplateOut:
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
            site_id=site_id,
            path_pattern=rec.path_pattern,
            entry_type_id=UUID(str(rec_like.entry_type_id)),
            entry_type_code=str(entry_type_code),
            template_page_revision_id=_get_template_page_revision_id(rec),
            is_active=bool(rec.is_active),
        )

    async def update_route_template(
        self,
        *,
        site_id: UUID,
        template_id: UUID,
        payload: SiteRouteTemplateUpdateIn,
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
            site_id=site_id,
            path_pattern=updated.path_pattern,
            entry_type_id=UUID(str(updated_like.entry_type_id)),
            entry_type_code=str(entry_type_code2),
            template_page_revision_id=_get_template_page_revision_id(updated),
            is_active=bool(updated.is_active),
        )

    async def delete_route_template(self, *, site_id: UUID, template_id: UUID) -> SiteRouteTemplateDeleteOut:
        if not self.settings.database.enabled:
            raise Conflict("Route templates require database storage", error="ROUTE_TEMPLATE_DB_REQUIRED")

        await self._repo.get_site_by_id(site_id=site_id)
        await self._repo.delete_route_template(site_id=site_id, template_id=template_id)
        await self._bump_route_templates_cache_version(site_id=site_id)
        self._repo.invalidate_route_template_cache(site_id=site_id)
        return SiteRouteTemplateDeleteOut(template_id=template_id)
