from __future__ import annotations

from typing import Literal
from uuid import UUID

from apps.api.src.common.repositories.base import BaseRepository
from apps.api.src.modules.sites.design_document.schema import PageBlueprint
from apps.api.src.modules.sites.entries.repository import EntriesRepositoryMixin
from apps.api.src.modules.sites.entry_types.repository import EntryTypesRepositoryMixin
from apps.api.src.modules.sites.models.site_entry import EntryRecord, EntryRevisionRecord
from apps.api.src.modules.sites.models.site_route_template import RouteTemplateRecord
from apps.api.src.modules.sites.pages.repository import PagesRepositoryMixin
from apps.api.src.modules.sites.publishing.repository import SitePublishingRepository
from apps.api.src.modules.sites.runtime.repository import RuntimeRepositoryMixin
from apps.api.src.modules.sites.settings.repository import SettingsRepositoryMixin
from apps.api.src.modules.sites.shared.schema import ResolvedEntryDocument, RouteTemplateMatch


class SitesRepository(
    RuntimeRepositoryMixin,
    SettingsRepositoryMixin,
    PagesRepositoryMixin,
    EntriesRepositoryMixin,
    EntryTypesRepositoryMixin,
    BaseRepository,
):
    def __init__(self) -> None:
        super().__init__()
        self._publishing_repo = SitePublishingRepository()

    async def rollback_page_revision_pointer(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        target: Literal["draft", "published"],
        revision: int,
        updated_by_user_id: UUID | None,
    ) -> tuple[int | None, int, int]:
        return await self._publishing_repo.rollback_page_revision_pointer(
            site_id=site_id,
            page_id=page_id,
            target=target,
            revision=revision,
            updated_by_user_id=updated_by_user_id,
        )

    async def rollback_entry_revision_pointer(
        self,
        *,
        site_id: UUID,
        entry_id: UUID,
        target: Literal["draft", "published"],
        revision: int,
    ) -> tuple[int | None, int, int]:
        return await self._publishing_repo.rollback_entry_revision_pointer(
            site_id=site_id,
            entry_id=entry_id,
            target=target,
            revision=revision,
        )

    async def get_entry_by_id(self, *, site_id: UUID, entry_id: UUID) -> EntryRecord | None:
        return await self._publishing_repo.get_entry_by_id(site_id=site_id, entry_id=entry_id)

    async def get_entry_revision(self, *, entry_id: UUID, rev: int) -> EntryRevisionRecord | None:
        return await self._publishing_repo.get_entry_revision(entry_id=entry_id, rev=rev)

    async def save_entry_draft_by_slug(
        self,
        *,
        site_id: UUID,
        entry_type_id: UUID,
        slug: str,
        data: dict | None,
        page_blueprint: PageBlueprint | None,
        meta: dict | None,
        style_overrides: dict | None,
        variant_id: str | None,
        deps: dict | None,
        expected_revision: int | None,
        created_by_user_id: UUID | None,
        retain_last_n: int | None = None,
    ) -> tuple[UUID, int, int]:
        return await self._publishing_repo.save_entry_draft_by_slug(
            site_id=site_id,
            entry_type_id=entry_type_id,
            slug=slug,
            data=data,
            page_blueprint=page_blueprint,
            meta=meta,
            style_overrides=style_overrides,
            variant_id=variant_id,
            deps=deps,
            expected_revision=expected_revision,
            created_by_user_id=created_by_user_id,
            retain_last_n=retain_last_n,
        )

    async def publish_entry_by_slug(
        self,
        *,
        site_id: UUID,
        entry_type_id: UUID,
        slug: str,
        revision: int | None,
    ) -> tuple[UUID, int, int]:
        return await self._publishing_repo.publish_entry_by_slug(
            site_id=site_id,
            entry_type_id=entry_type_id,
            slug=slug,
            revision=revision,
        )

    async def save_page_draft_by_path(
        self,
        *,
        site_id: UUID,
        path: str,
        page_blueprint: PageBlueprint,
        meta: dict | None,
        style_overrides: dict | None,
        variant_id: str | None,
        deps: dict | None,
        expected_revision: int | None,
        created_by_user_id: UUID | None,
        retain_last_n: int | None = None,
    ) -> tuple[int, int]:
        return await self._publishing_repo.save_page_draft_by_path(
            site_id=site_id,
            path=path,
            page_blueprint=page_blueprint,
            meta=meta,
            style_overrides=style_overrides,
            variant_id=variant_id,
            deps=deps,
            expected_revision=expected_revision,
            created_by_user_id=created_by_user_id,
            retain_last_n=retain_last_n,
        )

    async def save_page_draft_by_id(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        page_blueprint: PageBlueprint,
        meta: dict | None,
        style_overrides: dict | None,
        variant_id: str | None,
        deps: dict | None,
        expected_revision: int | None,
        created_by_user_id: UUID | None,
        retain_last_n: int | None = None,
    ) -> tuple[str, int, int]:
        return await self._publishing_repo.save_page_draft_by_id(
            site_id=site_id,
            page_id=page_id,
            page_blueprint=page_blueprint,
            meta=meta,
            style_overrides=style_overrides,
            variant_id=variant_id,
            deps=deps,
            expected_revision=expected_revision,
            created_by_user_id=created_by_user_id,
            retain_last_n=retain_last_n,
        )

    async def publish_page_by_path(
        self,
        *,
        site_id: UUID,
        path: str,
        revision: int | None,
        updated_by_user_id: UUID | None,
    ) -> tuple[int, int]:
        return await self._publishing_repo.publish_page_by_path(
            site_id=site_id,
            path=path,
            revision=revision,
            updated_by_user_id=updated_by_user_id,
        )

    async def publish_page_by_id(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        revision: int | None,
        updated_by_user_id: UUID | None,
    ) -> tuple[str, int, int]:
        return await self._publishing_repo.publish_page_by_id(
            site_id=site_id,
            page_id=page_id,
            revision=revision,
            updated_by_user_id=updated_by_user_id,
        )

    async def unpublish_page_by_id(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        updated_by_user_id: UUID | None,
    ) -> tuple[str, int]:
        return await self._publishing_repo.unpublish_page_by_id(
            site_id=site_id,
            page_id=page_id,
            updated_by_user_id=updated_by_user_id,
        )

    async def resolve_entry_by_slug(
        self,
        *,
        site_id: UUID,
        entry_type_id: UUID,
        slug: str,
        mode: Literal["public", "preview"],
    ) -> ResolvedEntryDocument | None:
        return await self._publishing_repo.resolve_entry_by_slug(
            site_id=site_id,
            entry_type_id=entry_type_id,
            slug=slug,
            mode=mode,
        )

    async def list_route_templates(self, *, site_id: UUID) -> list[RouteTemplateRecord]:
        return await self._publishing_repo.list_route_templates(site_id=site_id)

    async def list_route_templates_all(self, *, site_id: UUID) -> list[RouteTemplateRecord]:
        return await self._publishing_repo.list_route_templates_all(site_id=site_id)

    async def get_route_template_by_id(self, *, site_id: UUID, template_id: UUID) -> RouteTemplateRecord | None:
        return await self._publishing_repo.get_route_template_by_id(site_id=site_id, template_id=template_id)

    async def create_route_template(
        self,
        *,
        site_id: UUID,
        path_pattern: str,
        entry_type_id: UUID,
        template_page_revision_id: UUID | None,
        is_active: bool,
    ) -> RouteTemplateRecord:
        return await self._publishing_repo.create_route_template(
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
        return await self._publishing_repo.update_route_template(
            site_id=site_id,
            template_id=template_id,
            path_pattern=path_pattern,
            entry_type_id=entry_type_id,
            template_page_revision_id=template_page_revision_id,
            is_active=is_active,
        )

    async def delete_route_template(self, *, site_id: UUID, template_id: UUID) -> None:
        await self._publishing_repo.delete_route_template(site_id=site_id, template_id=template_id)

    def invalidate_route_template_cache(self, *, site_id: UUID) -> None:
        self._publishing_repo.invalidate_route_template_cache(site_id=site_id)

    async def match_route_template(
        self,
        *,
        site_id: UUID,
        pathname: str,
        cache_version: int = 0,
    ) -> RouteTemplateMatch | None:
        return await self._publishing_repo.match_route_template(
            site_id=site_id,
            pathname=pathname,
            cache_version=cache_version,
        )

    async def list_public_sitemap_paths(self, *, site_id: UUID) -> list[str]:
        return await self._publishing_repo.list_public_sitemap_paths(site_id=site_id)
