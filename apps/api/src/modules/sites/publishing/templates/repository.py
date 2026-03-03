from __future__ import annotations

from uuid import UUID

from apps.api.src.modules.sites.models.site_route_template import RouteTemplateRecord
from apps.api.src.modules.sites.shared.schema import RouteTemplateMatch


class PublishingTemplatesRepositoryMixin:
    async def list_route_templates(self, *, site_id: UUID) -> list[RouteTemplateRecord]:
        return await self._routing_repo.list_route_templates(site_id=site_id)

    async def list_route_templates_all(self, *, site_id: UUID) -> list[RouteTemplateRecord]:
        return await self._routing_repo.list_route_templates_all(site_id=site_id)

    async def get_route_template_by_id(self, *, site_id: UUID, template_id: UUID) -> RouteTemplateRecord | None:
        return await self._routing_repo.get_route_template_by_id(site_id=site_id, template_id=template_id)

    async def create_route_template(
        self,
        *,
        site_id: UUID,
        path_pattern: str,
        entry_type_id: UUID,
        template_page_revision_id: UUID | None,
        is_active: bool,
    ) -> RouteTemplateRecord:
        return await self._routing_repo.create_route_template(
            site_id=site_id,
            path_pattern=path_pattern,
            entry_type_id=entry_type_id,
            template_page_revision_id=template_page_revision_id,
            is_active=is_active,
        )

    async def update_route_template(
        self,
        *,
        site_id: UUID,
        template_id: UUID,
        path_pattern: str,
        entry_type_id: UUID,
        template_page_revision_id: UUID | None,
        is_active: bool,
    ) -> RouteTemplateRecord:
        return await self._routing_repo.update_route_template(
            site_id=site_id,
            template_id=template_id,
            path_pattern=path_pattern,
            entry_type_id=entry_type_id,
            template_page_revision_id=template_page_revision_id,
            is_active=is_active,
        )

    async def delete_route_template(self, *, site_id: UUID, template_id: UUID) -> None:
        await self._routing_repo.delete_route_template(site_id=site_id, template_id=template_id)

    def invalidate_route_template_cache(self, *, site_id: UUID) -> None:
        self._routing_repo.invalidate_route_template_cache(site_id=site_id)

    async def match_route_template(
        self,
        *,
        site_id: UUID,
        pathname: str,
        cache_version: int = 0,
    ) -> RouteTemplateMatch | None:
        return await self._routing_repo.match_route_template(
            site_id=site_id,
            pathname=pathname,
            cache_version=cache_version,
        )

    async def list_public_sitemap_paths(self, *, site_id: UUID) -> list[str]:
        return await self._routing_repo.list_public_sitemap_paths(site_id=site_id)
