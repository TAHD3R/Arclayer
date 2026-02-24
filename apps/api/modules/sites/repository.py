from __future__ import annotations

import time
from datetime import datetime
from typing import Literal, cast
from uuid import UUID

from tortoise.exceptions import IntegrityError
from tortoise.transactions import in_transaction

from apps.api.common.protocols.tortoise import (
    EntryRecordMutableFields,
    SettingUpdatedBy,
    SitePageMutableFields,
)
from apps.api.common.repositories.base import BaseRepository
from apps.api.core.exceptions import Conflict, NotFound
from apps.api.modules.sites.models.site import SiteRecord
from apps.api.modules.sites.models.site_entry import EntryRecord, EntryRevisionRecord, EntryTypeRecord
from apps.api.modules.sites.models.site_page import SitePageRecord, SitePageRevisionRecord, SitePageVisibility
from apps.api.modules.sites.models.site_route_template import RouteTemplateRecord
from apps.api.modules.sites.repository_publishing import SitePublishingRepository
from apps.api.modules.sites.repository_routing import (
    _compile_path_pattern as _routing_compile_path_pattern,
)
from apps.api.modules.sites.repository_routing import (
    _match_compiled as _routing_match_compiled,
)
from apps.api.modules.sites.repository_routing import (
    _match_path_pattern as _routing_match_path_pattern,
)
from apps.api.modules.sites.schema import DocumentIR
from apps.api.modules.sites.types import ResolvedEntryDocument, RouteTemplateMatch, _CompiledRouteTemplate
from apps.api.modules.sites.utils import normalize_path
from apps.api.modules.system.models.setting import SettingRecord
from apps.api.settings.scopes import SCOPE_TYPE_SITE


class SitesRepository(BaseRepository):
    def __init__(self) -> None:
        super().__init__()
        self._publishing_repo = SitePublishingRepository()

    async def get_site_by_id(self, *, site_id: UUID) -> SiteRecord:
        site = await SiteRecord.get_or_none(id=site_id)
        if site is None:
            raise NotFound("Site not found", error="SITE_NOT_FOUND")
        return site

    async def get_site_by_host(self, *, host: str) -> SiteRecord | None:
        raw = (host or "").strip().lower()
        if not raw:
            return None
        # Strip port for common Host header formats like "localhost:3100".
        if ":" in raw and "]" not in raw:
            raw = raw.split(":", 1)[0]
        return await SiteRecord.get_or_none(primary_host=raw)

    async def get_site_setting(self, *, site_id: UUID, namespace: str) -> SettingRecord | None:
        ns = (namespace or "").strip()
        if not ns:
            return None
        return await SettingRecord.get_or_none(scope_type=SCOPE_TYPE_SITE, scope_id=site_id, namespace=ns)

    async def upsert_site_setting(
        self,
        *,
        site_id: UUID,
        namespace: str,
        value: dict | None,
        updated_by: UUID | None,
    ) -> SettingRecord:
        ns = (namespace or "").strip()
        if not ns:
            raise Conflict("Invalid namespace", error="SETTING_NAMESPACE_INVALID")

        rec, created = await SettingRecord.get_or_create(
            scope_type=SCOPE_TYPE_SITE,
            scope_id=site_id,
            namespace=ns,
            defaults={"value": value, "updated_by": updated_by},
        )
        if created:
            return rec

        rec.value = value
        cast(SettingUpdatedBy, rec).updated_by = updated_by
        await rec.save(update_fields=["value", "updated_by"])
        return rec

    async def get_site_settings_snapshot(self, *, site_id: UUID, namespaces: list[str]) -> dict[str, int]:
        """
        Build a minimal settings snapshot for deps (v1).

        We use per-namespace `updated_at` timestamps as a lightweight "version":
        - Changing a setting updates its `updated_at`.
        - Revisions can store this snapshot to help debugging and rollback safety analysis.
        """

        norm = [str(ns).strip() for ns in namespaces if isinstance(ns, str) and str(ns).strip()]
        if not norm:
            return {}

        rows = await SettingRecord.filter(
            scope_type=SCOPE_TYPE_SITE,
            scope_id=site_id,
            namespace__in=norm,
        ).all()

        out: dict[str, int] = {}
        for r in rows:
            updated_at = getattr(r, "updated_at", None)
            out[str(r.namespace)] = int(updated_at.timestamp() * 1000) if isinstance(updated_at, datetime) else 0

        # Keep the shape stable: always include requested namespaces.
        for ns in norm:
            out.setdefault(ns, 0)
        return out

    async def get_page_by_id(self, *, site_id: UUID, page_id: UUID) -> SitePageRecord | None:
        return await SitePageRecord.get_or_none(id=page_id, site_id=site_id)

    async def get_page_by_path(self, *, site_id: UUID, path: str) -> SitePageRecord | None:
        pathname = normalize_path(path)
        return await SitePageRecord.get_or_none(site_id=site_id, path=pathname)

    async def list_pages_by_site(self, *, site_id: UUID) -> list[SitePageRecord]:
        # Keep ordering deterministic so tree building stays stable.
        return await SitePageRecord.filter(site_id=site_id).order_by("sort_order", "path").all()

    async def create_page(
        self,
        *,
        site_id: UUID,
        title: str | None,
        description: str | None,
        path: str,
        parent_id: UUID | None,
        sort_order: int,
        visibility: str,
        created_by_user_id: UUID | None,
        updated_by_user_id: UUID | None,
    ) -> SitePageRecord:
        pathname = normalize_path(path)
        if not pathname.startswith("/"):
            raise Conflict("Invalid path", error="PAGE_PATH_INVALID")

        try:
            vis = SitePageVisibility(visibility)
        except ValueError:
            raise Conflict("Invalid visibility", error="PAGE_VISIBILITY_INVALID") from None

        try:
            return await SitePageRecord.create(
                site_id=site_id,
                title=(title.strip() if isinstance(title, str) and title.strip() else None),
                description=(description.strip() if isinstance(description, str) and description.strip() else None),
                path=pathname,
                parent_id=parent_id,
                sort_order=int(sort_order or 0),
                visibility=vis,
                draft_rev=0,
                published_rev=None,
                created_by_user_id=created_by_user_id,
                updated_by_user_id=updated_by_user_id,
            )
        except IntegrityError:
            raise Conflict("Page path already exists", error="PAGE_PATH_CONFLICT") from None

    async def update_page(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        title: str | None,
        description: str | None,
        path: str,
        parent_id: UUID | None,
        sort_order: int,
        visibility: str,
        updated_by_user_id: UUID | None,
    ) -> SitePageRecord:
        pathname = normalize_path(path)
        if not pathname.startswith("/"):
            raise Conflict("Invalid path", error="PAGE_PATH_INVALID")

        try:
            vis = SitePageVisibility(visibility)
        except ValueError:
            raise Conflict("Invalid visibility", error="PAGE_VISIBILITY_INVALID") from None

        async with in_transaction() as conn:
            page = await SitePageRecord.filter(id=page_id, site_id=site_id).using_db(conn).select_for_update().first()
            if page is None:
                raise NotFound("Page not found", error="PAGE_NOT_FOUND")

            page.path = pathname
            mutable_page = cast(SitePageMutableFields, page)
            mutable_page.title = title.strip() if isinstance(title, str) and title.strip() else None
            mutable_page.description = (
                description.strip() if isinstance(description, str) and description.strip() else None
            )
            page.parent_id = parent_id
            page.sort_order = int(sort_order or 0)
            page.visibility = vis
            mutable_page.updated_by_user_id = updated_by_user_id

            try:
                await page.save(
                    update_fields=[
                        "title",
                        "description",
                        "path",
                        "parent_id",
                        "sort_order",
                        "visibility",
                        "updated_by_user_id",
                    ],
                    using_db=conn,
                )
            except IntegrityError:
                raise Conflict("Page path already exists", error="PAGE_PATH_CONFLICT") from None

        return page

    async def page_has_children(self, *, site_id: UUID, page_id: UUID) -> bool:
        return await SitePageRecord.filter(site_id=site_id, parent_id=page_id).exists()

    async def delete_page(self, *, site_id: UUID, page_id: UUID) -> None:
        deleted = await SitePageRecord.filter(site_id=site_id, id=page_id).delete()
        if not deleted:
            raise NotFound("Page not found", error="PAGE_NOT_FOUND")

    async def get_page_revision(self, *, page_id: UUID, rev: int) -> SitePageRevisionRecord | None:
        return await SitePageRevisionRecord.get_or_none(page_id=page_id, rev=rev)

    async def get_page_revision_by_id(self, *, site_id: UUID, revision_id: UUID) -> SitePageRevisionRecord | None:
        # Ensure the revision belongs to the given site via page relationship.
        return (
            await SitePageRevisionRecord.filter(id=revision_id, page__site_id=site_id).prefetch_related("page").first()
        )

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

    async def get_entry_type_by_code(self, *, site_id: UUID, code: str) -> EntryTypeRecord:
        c = (code or "").strip()
        if not c:
            raise NotFound("Entry type not found", error="ENTRY_TYPE_NOT_FOUND")
        et = await EntryTypeRecord.get_or_none(site_id=site_id, code=c)
        if et is None:
            raise NotFound("Entry type not found", error="ENTRY_TYPE_NOT_FOUND")
        return et

    async def get_entry_type_by_id(self, *, site_id: UUID, entry_type_id: UUID) -> EntryTypeRecord | None:
        return await EntryTypeRecord.get_or_none(id=entry_type_id, site_id=site_id)

    async def list_entry_types(self, *, site_id: UUID) -> list[EntryTypeRecord]:
        return await EntryTypeRecord.filter(site_id=site_id).order_by("code").all()

    async def create_entry_type(
        self,
        *,
        site_id: UUID,
        code: str,
        name: str,
        fields_schema: dict | None,
    ) -> EntryTypeRecord:
        c = (code or "").strip()
        n = (name or "").strip()
        if not c:
            raise Conflict("Invalid entry type code", error="ENTRY_TYPE_CODE_INVALID")
        if not n:
            raise Conflict("Invalid entry type name", error="ENTRY_TYPE_NAME_INVALID")
        try:
            return await EntryTypeRecord.create(site_id=site_id, code=c, name=n, fields_schema=fields_schema)
        except IntegrityError:
            raise Conflict("Entry type already exists", error="ENTRY_TYPE_CONFLICT") from None

    async def update_entry_type(
        self,
        *,
        site_id: UUID,
        entry_type_id: UUID,
        name: str,
        fields_schema: dict | None,
    ) -> EntryTypeRecord:
        async with in_transaction() as conn:
            rec = (
                await EntryTypeRecord
                .filter(id=entry_type_id, site_id=site_id)
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if rec is None:
                raise NotFound("Entry type not found", error="ENTRY_TYPE_NOT_FOUND")
            rec.name = (name or "").strip()
            rec.fields_schema = fields_schema
            await rec.save(update_fields=["name", "fields_schema"], using_db=conn)
            return rec

    async def delete_entry_type(self, *, site_id: UUID, entry_type_id: UUID) -> None:
        # Prevent deleting entry types in use.
        used = await EntryRecord.filter(site_id=site_id, entry_type_id=entry_type_id).exists()
        if used:
            raise Conflict("Entry type is in use", error="ENTRY_TYPE_IN_USE")
        deleted = await EntryTypeRecord.filter(site_id=site_id, id=entry_type_id).delete()
        if not deleted:
            raise NotFound("Entry type not found", error="ENTRY_TYPE_NOT_FOUND")

    async def list_entries(self, *, site_id: UUID, entry_type_id: UUID | None = None) -> list[EntryRecord]:
        qs = EntryRecord.filter(site_id=site_id)
        if entry_type_id is not None:
            qs = qs.filter(entry_type_id=entry_type_id)
        return await qs.prefetch_related("entry_type").order_by("slug").all()

    async def create_entry(
        self, *, site_id: UUID, entry_type_id: UUID, slug: str, created_by_user_id: UUID | None
    ) -> EntryRecord:
        s = (slug or "").strip()
        if not s or "/" in s:
            raise Conflict("Invalid slug", error="ENTRY_SLUG_INVALID")
        try:
            return await EntryRecord.create(
                site_id=site_id,
                entry_type_id=entry_type_id,
                slug=s,
                draft_rev=0,
                published_rev=None,
                created_by_user_id=created_by_user_id,
            )
        except IntegrityError:
            raise Conflict("Entry already exists", error="ENTRY_CONFLICT") from None

    async def update_entry_slug(self, *, site_id: UUID, entry_id: UUID, slug: str) -> EntryRecord:
        s = (slug or "").strip()
        if not s or "/" in s:
            raise Conflict("Invalid slug", error="ENTRY_SLUG_INVALID")
        async with in_transaction() as conn:
            entry = await EntryRecord.filter(id=entry_id, site_id=site_id).using_db(conn).select_for_update().first()
            if entry is None:
                raise NotFound("Entry not found", error="ENTRY_NOT_FOUND")
            entry.slug = s
            try:
                await entry.save(update_fields=["slug"], using_db=conn)
            except IntegrityError:
                raise Conflict("Entry slug already exists", error="ENTRY_SLUG_CONFLICT") from None
            return entry

    async def unpublish_entry_by_slug(
        self,
        *,
        site_id: UUID,
        entry_type_id: UUID,
        slug: str,
    ) -> tuple[UUID, int]:
        s = (slug or "").strip()
        if not s or "/" in s:
            raise Conflict("Invalid slug", error="ENTRY_SLUG_INVALID")

        now_ms = int(time.time() * 1000)
        async with in_transaction() as conn:
            entry = (
                await EntryRecord
                .filter(site_id=site_id, entry_type_id=entry_type_id, slug=s)
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if entry is None:
                raise NotFound("Entry not found", error="ENTRY_NOT_FOUND")
            if entry.published_rev is None:
                raise Conflict("Entry is not published", error="ENTRY_NOT_PUBLISHED")
            cast(EntryRecordMutableFields, entry).published_rev = None
            await entry.save(update_fields=["published_rev"], using_db=conn)
        return UUID(str(entry.id)), now_ms

    async def delete_entry(self, *, site_id: UUID, entry_id: UUID) -> None:
        async with in_transaction() as conn:
            entry = await EntryRecord.filter(site_id=site_id, id=entry_id).using_db(conn).select_for_update().first()
            if entry is None:
                raise NotFound("Entry not found", error="ENTRY_NOT_FOUND")
            if entry.published_rev is not None:
                raise Conflict("Entry must be unpublished before delete", error="ENTRY_MUST_UNPUBLISH")
            await EntryRecord.filter(site_id=site_id, id=entry_id).using_db(conn).delete()

    async def save_entry_draft_by_slug(
        self,
        *,
        site_id: UUID,
        entry_type_id: UUID,
        slug: str,
        data: dict | None,
        document: DocumentIR | None,
        meta: dict | None,
        style_overrides: dict | None,
        variant_id: str | None,
        deps: dict | None,
        expected_revision: int | None,
        created_by_user_id: UUID | None,
    ) -> tuple[UUID, int, int]:
        return await self._publishing_repo.save_entry_draft_by_slug(
            site_id=site_id,
            entry_type_id=entry_type_id,
            slug=slug,
            data=data,
            document=document,
            meta=meta,
            style_overrides=style_overrides,
            variant_id=variant_id,
            deps=deps,
            expected_revision=expected_revision,
            created_by_user_id=created_by_user_id,
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
        document: DocumentIR,
        meta: dict | None,
        style_overrides: dict | None,
        variant_id: str | None,
        deps: dict | None,
        expected_revision: int | None,
        created_by_user_id: UUID | None,
    ) -> tuple[int, int]:
        return await self._publishing_repo.save_page_draft_by_path(
            site_id=site_id,
            path=path,
            document=document,
            meta=meta,
            style_overrides=style_overrides,
            variant_id=variant_id,
            deps=deps,
            expected_revision=expected_revision,
            created_by_user_id=created_by_user_id,
        )

    async def save_page_draft_by_id(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        document: DocumentIR,
        meta: dict | None,
        style_overrides: dict | None,
        variant_id: str | None,
        deps: dict | None,
        expected_revision: int | None,
        created_by_user_id: UUID | None,
    ) -> tuple[str, int, int]:
        return await self._publishing_repo.save_page_draft_by_id(
            site_id=site_id,
            page_id=page_id,
            document=document,
            meta=meta,
            style_overrides=style_overrides,
            variant_id=variant_id,
            deps=deps,
            expected_revision=expected_revision,
            created_by_user_id=created_by_user_id,
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


def _compile_path_pattern(
    path_pattern: str,
    *,
    template_id: UUID,
    entry_type_id: UUID,
    template_page_revision_id: UUID | None,
) -> _CompiledRouteTemplate | None:
    return _routing_compile_path_pattern(
        path_pattern,
        template_id=template_id,
        entry_type_id=entry_type_id,
        template_page_revision_id=template_page_revision_id,
    )


def _match_compiled(compiled: _CompiledRouteTemplate, pathname: str) -> dict[str, str] | None:
    return _routing_match_compiled(compiled, pathname)


def _match_path_pattern(path_pattern: str, pathname: str) -> tuple[dict[str, str], int] | None:
    return _routing_match_path_pattern(path_pattern, pathname)
