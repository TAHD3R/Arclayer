from __future__ import annotations

import asyncio
import re
import time
from typing import Literal, cast
from uuid import UUID

from tortoise.exceptions import IntegrityError
from tortoise.transactions import in_transaction

from apps.api.common.protocols.tortoise import (
    EntryRecordMutableFields,
    HasWorkspaceId,
    RouteTemplateIds,
    SettingUpdatedBy,
)
from apps.api.common.utils.public_ids import decode_public_id, encode_uuid, is_public_id
from apps.api.common.repositories.base import BaseRepository
from apps.api.core.exceptions import Conflict, NotFound
from apps.api.modules.assets.models.asset import AssetRecord
from apps.api.modules.sites.constants import RUNTIME_SETTING_NAMESPACE
from apps.api.modules.sites.models.site import SiteRecord
from apps.api.modules.sites.models.site_entry import EntryRecord, EntryRevisionRecord, EntryTypeRecord
from apps.api.modules.sites.models.site_page import SitePageRecord, SitePageRevisionRecord, SitePageVisibility
from apps.api.modules.sites.models.site_route_template import RouteTemplateRecord
from apps.api.modules.sites.schema import DocumentIR
from apps.api.modules.sites.types import ResolvedEntryDocument, RouteTemplateMatch, _CompiledRouteTemplate
from apps.api.modules.sites.utils import normalize_path
from apps.api.modules.system.models.setting import SettingRecord
from apps.api.settings.scopes import SCOPE_TYPE_SITE


class _RouteTemplateCache:
    """
    In-process route template cache.

    Sprint 3:
    - Default path: TTL-based caching for read-mostly workloads.
    - When route templates become editable, writers should explicitly invalidate
      this cache (per-site) after successful create/update/delete operations.
    """

    _TTL_MS = 5_000

    def __init__(self) -> None:
        # Keyed by (site_id, version). Version is used for cross-instance invalidation.
        self._by_key: dict[tuple[UUID, int], tuple[int, list[_CompiledRouteTemplate]]] = {}
        self._lock = asyncio.Lock()

    async def get(self, *, site_id: UUID, version: int, loader) -> list[_CompiledRouteTemplate]:
        now_ms = int(time.time() * 1000)
        key = (site_id, int(version or 0))
        cached = self._by_key.get(key)
        if cached and cached[0] > now_ms:
            return cached[1]

        async with self._lock:
            cached2 = self._by_key.get(key)
            if cached2 and cached2[0] > now_ms:
                return cached2[1]
            compiled = await loader()
            self._by_key[key] = (now_ms + self._TTL_MS, compiled)
            return compiled

    def invalidate(self, *, site_id: UUID) -> None:
        # Remove all cached versions for a site (writers call this after mutations).
        for key in list(self._by_key.keys()):
            if key[0] == site_id:
                self._by_key.pop(key, None)


_route_template_cache = _RouteTemplateCache()


class SitesRepository(BaseRepository):
    async def ensure_demo_site_ready(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        primary_host: str,
        home_document: DocumentIR,
        about_document: DocumentIR,
        blog_document: DocumentIR,
    ) -> None:
        async with in_transaction() as conn:
            site = await SiteRecord.filter(id=site_id).using_db(conn).first()
            if site is None:
                site = await SiteRecord.create(
                    id=site_id,
                    workspace_id=workspace_id,
                    slug="demo",
                    name="Celestial Demo",
                    default_locale="zh-CN",
                    fallback_locale="en-US",
                    primary_host=primary_host,
                    is_active=True,
                    created_by_user_id=None,
                    using_db=conn,
                )
                self.logger.info(
                    "Created demo site",
                    site_id=str(site.id),
                    workspace_id=str(workspace_id),
                )

            # Upsert minimal pages (/) and (/about) with an initial published revision.
            await self._ensure_page(conn=conn, site_id=site.id, path="/", document=home_document)
            await self._ensure_page(conn=conn, site_id=site.id, path="/about", document=about_document)

            # Upsert runtime settings (theme tokens) for Portal SSR head injection.
            # This keeps runtime config DB-backed even before Admin UI exists.
            await SettingRecord.get_or_create(
                scope_type=SCOPE_TYPE_SITE,
                scope_id=site.id,
                namespace=RUNTIME_SETTING_NAMESPACE,
                defaults={
                    "value": {
                        "theme": {
                            "cssVars": {
                                "--color-primary": "#1677ff",
                                "--color-background": "#ffffff",
                                "--color-foreground": "#111827",
                                "--color-border": "rgba(17, 24, 39, 0.12)",
                                "--font-sans": "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
                            }
                        },
                        "fonts": [],
                    },
                    "updated_by": None,
                },
                using_db=conn,
            )

            # Upsert a minimal entry type + one entry for /blog/:slug.
            et, _ = await EntryTypeRecord.get_or_create(
                site_id=site.id,
                code="blog_post",
                defaults={"name": "Blog Post", "fields_schema": None},
                using_db=conn,
            )

            entry, created_entry = await EntryRecord.get_or_create(
                site_id=site.id,
                entry_type_id=et.id,
                slug="hello",
                defaults={"draft_rev": 0, "published_rev": None, "created_by_user_id": None},
                using_db=conn,
            )
            if created_entry or not entry.published_rev:
                rev = 1
                await EntryRevisionRecord.create(
                    entry_id=entry.id,
                    rev=rev,
                    data=None,
                    document=blog_document.model_dump(by_alias=True),
                    created_by_user_id=None,
                    using_db=conn,
                )
                entry.draft_rev = rev
                entry.published_rev = rev
                await entry.save(update_fields=["draft_rev", "published_rev"], using_db=conn)

            # RouteTemplate: /blog/:slug -> blog_post
            await RouteTemplateRecord.get_or_create(
                site_id=site.id,
                path_pattern="/blog/:slug",
                defaults={
                    "entry_type_id": et.id,
                    "template_page_revision_id": None,
                    "is_active": True,
                },
                using_db=conn,
            )

    async def _ensure_page(self, *, conn, site_id: UUID, path: str, document: DocumentIR) -> None:
        page = await SitePageRecord.filter(site_id=site_id, path=path).using_db(conn).first()
        if page is None:
            page = await SitePageRecord.create(
                site_id=site_id,
                path=path,
                parent_id=None,
                sort_order=0,
                visibility=SitePageVisibility.PUBLIC,
                draft_rev=0,
                published_rev=None,
                created_by_user_id=None,
                using_db=conn,
            )

        if page.published_rev:
            return

        rev = 1
        await SitePageRevisionRecord.create(
            page_id=page.id,
            rev=rev,
            document=document.model_dump(by_alias=True),
            created_by_user_id=None,
            using_db=conn,
        )
        page.draft_rev = rev
        page.published_rev = rev
        await page.save(update_fields=["draft_rev", "published_rev"], using_db=conn)

    async def _list_missing_assets(
        self,
        *,
        workspace_id: UUID,
        asset_ids: list[UUID],
        conn,
    ) -> list[str]:
        """
        Best-effort deps validator for v0 (assets only).

        Returns missing asset id strings (UUID).
        """

        if not asset_ids:
            return []

        rows = (
            await AssetRecord
            .filter(
                id__in=asset_ids,
                workspace_id=workspace_id,
                deleted_at=None,
            )
            .using_db(conn)
            .values_list("id", flat=True)
        )
        existing = {UUID(str(x)) for x in rows}
        missing = [encode_uuid(aid) for aid in asset_ids if aid not in existing]
        return missing

    async def _validate_revision_deps_assets(
        self,
        *,
        site_id: UUID,
        deps: dict | None,
        conn,
    ) -> None:
        """
        Validate revision deps before publishing/rollback (v0: assets only).

        Contract:
        - deps.assetIds: list[str] of AssetRecord ids.
        """

        if not deps or not isinstance(deps, dict):
            return
        asset_ids_raw = deps.get("assetIds")
        if not isinstance(asset_ids_raw, list) or not asset_ids_raw:
            return

        parsed: list[UUID] = []
        invalid: list[str] = []
        for x in asset_ids_raw:
            if not isinstance(x, str) or not x.strip():
                invalid.append(str(x))
                continue
            raw = x.strip()
            if is_public_id(raw):
                try:
                    parsed.append(decode_public_id(raw))
                except Exception:
                    invalid.append(raw)
                continue

            # Optional compatibility: allow raw UUID strings in dev/test (configurable).
            from apps.api.config import get_settings

            if not get_settings().public_id.accept_raw_uuid_input:
                invalid.append(raw)
                continue

            try:
                parsed.append(UUID(raw))
            except Exception:
                invalid.append(raw)

        if not parsed and not invalid:
            return

        site_qs = SiteRecord.filter(id=site_id)
        if conn is not None:
            site_qs = site_qs.using_db(conn)
        site = await site_qs.first()
        if site is None:
            raise NotFound("Site not found", error="SITE_NOT_FOUND")

        missing = await self._list_missing_assets(
            workspace_id=UUID(str(cast(HasWorkspaceId, site).workspace_id)),
            asset_ids=parsed,
            conn=conn,
        )
        if invalid or missing:
            raise Conflict(
                "Revision deps validation failed",
                error="REVISION_DEPS_MISSING",
                meta={"missingAssets": [*invalid, *missing]},
            )

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
            try:
                out[str(r.namespace)] = int(r.updated_at.timestamp() * 1000)
            except Exception:
                out[str(r.namespace)] = 0

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
        path: str,
        parent_id: UUID | None,
        sort_order: int,
        visibility: str,
        created_by_user_id: UUID | None,
    ) -> SitePageRecord:
        pathname = normalize_path(path)
        if not pathname.startswith("/"):
            raise Conflict("Invalid path", error="PAGE_PATH_INVALID")

        try:
            vis = SitePageVisibility(visibility)
        except Exception:
            raise Conflict("Invalid visibility", error="PAGE_VISIBILITY_INVALID") from None

        try:
            return await SitePageRecord.create(
                site_id=site_id,
                path=pathname,
                parent_id=parent_id,
                sort_order=int(sort_order or 0),
                visibility=vis,
                draft_rev=0,
                published_rev=None,
                created_by_user_id=created_by_user_id,
            )
        except IntegrityError:
            raise Conflict("Page path already exists", error="PAGE_PATH_CONFLICT") from None

    async def update_page(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        path: str,
        parent_id: UUID | None,
        sort_order: int,
        visibility: str,
    ) -> SitePageRecord:
        pathname = normalize_path(path)
        if not pathname.startswith("/"):
            raise Conflict("Invalid path", error="PAGE_PATH_INVALID")

        try:
            vis = SitePageVisibility(visibility)
        except Exception:
            raise Conflict("Invalid visibility", error="PAGE_VISIBILITY_INVALID") from None

        async with in_transaction() as conn:
            page = await SitePageRecord.filter(id=page_id, site_id=site_id).using_db(conn).select_for_update().first()
            if page is None:
                raise NotFound("Page not found", error="PAGE_NOT_FOUND")

            page.path = pathname
            page.parent_id = parent_id
            page.sort_order = int(sort_order or 0)
            page.visibility = vis

            try:
                await page.save(update_fields=["path", "parent_id", "sort_order", "visibility"], using_db=conn)
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
    ) -> tuple[int | None, int, int]:
        """
        Rollback a page revision pointer by setting `draft_rev` or `published_rev`.

        Returns: (from_revision, to_revision, rolled_back_at_ms).
        """

        now_ms = int(time.time() * 1000)
        async with in_transaction() as conn:
            page = await SitePageRecord.filter(site_id=site_id, id=page_id).using_db(conn).select_for_update().first()
            if page is None:
                raise NotFound("Page not found", error="PAGE_NOT_FOUND")

            rec = await SitePageRevisionRecord.filter(page_id=page.id, rev=revision).using_db(conn).first()
            if rec is None:
                raise NotFound("Revision not found", error="REVISION_NOT_FOUND")

            await self._validate_revision_deps_assets(
                site_id=site_id,
                deps=(rec.deps if isinstance(rec.deps, dict) else None),
                conn=conn,
            )

            if target == "draft":
                from_rev = int(page.draft_rev or 0) or None
                page.draft_rev = int(revision)
                await page.save(update_fields=["draft_rev"], using_db=conn)
                return from_rev, int(revision), now_ms

            from_rev = int(page.published_rev or 0) or None
            page.published_rev = int(revision)
            await page.save(update_fields=["published_rev"], using_db=conn)
            return from_rev, int(revision), now_ms

    async def get_entry_by_id(self, *, site_id: UUID, entry_id: UUID) -> EntryRecord | None:
        return await EntryRecord.get_or_none(id=entry_id, site_id=site_id)

    async def get_entry_revision(self, *, entry_id: UUID, rev: int) -> EntryRevisionRecord | None:
        return await EntryRevisionRecord.get_or_none(entry_id=entry_id, rev=rev)

    async def rollback_entry_revision_pointer(
        self,
        *,
        site_id: UUID,
        entry_id: UUID,
        target: Literal["draft", "published"],
        revision: int,
    ) -> tuple[int | None, int, int]:
        """
        Rollback an entry revision pointer by setting `draft_rev` or `published_rev`.

        Returns: (from_revision, to_revision, rolled_back_at_ms).
        """

        now_ms = int(time.time() * 1000)
        async with in_transaction() as conn:
            entry = await EntryRecord.filter(site_id=site_id, id=entry_id).using_db(conn).select_for_update().first()
            if entry is None:
                raise NotFound("Entry not found", error="ENTRY_NOT_FOUND")

            rec = await EntryRevisionRecord.filter(entry_id=entry.id, rev=revision).using_db(conn).first()
            if rec is None:
                raise NotFound("Revision not found", error="REVISION_NOT_FOUND")

            await self._validate_revision_deps_assets(
                site_id=site_id,
                deps=(rec.deps if isinstance(rec.deps, dict) else None),
                conn=conn,
            )

            if target == "draft":
                from_rev = int(entry.draft_rev or 0) or None
                entry.draft_rev = int(revision)
                await entry.save(update_fields=["draft_rev"], using_db=conn)
                return from_rev, int(revision), now_ms

            from_rev = int(entry.published_rev or 0) or None
            entry.published_rev = int(revision)
            await entry.save(update_fields=["published_rev"], using_db=conn)
            return from_rev, int(revision), now_ms

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
        document: DocumentIR | None,
        data: dict | None,
        meta: dict | None,
        style_overrides: dict | None,
        variant_id: str | None,
        deps: dict | None,
        expected_revision: int | None,
        created_by_user_id: UUID | None,
    ) -> tuple[UUID, int, int]:
        """
        Save an entry draft by (entry_type_id, slug).

        Returns: (entry_id, revision, saved_at_ms).
        """

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
                entry = await EntryRecord.create(
                    site_id=site_id,
                    entry_type_id=entry_type_id,
                    slug=s,
                    draft_rev=0,
                    published_rev=None,
                    created_by_user_id=created_by_user_id,
                    using_db=conn,
                )

            current_rev = int(entry.draft_rev or 0)
            if expected_revision is not None and expected_revision != current_rev:
                raise Conflict(
                    "Draft revision mismatch",
                    error="DRAFT_REVISION_MISMATCH",
                    meta={"expectedRevision": expected_revision, "currentRevision": current_rev},
                )

            next_rev = current_rev + 1 if current_rev else 1
            await EntryRevisionRecord.create(
                entry_id=entry.id,
                rev=next_rev,
                data=data,
                document=(document.model_dump(by_alias=True) if document is not None else None),
                meta=meta,
                style_overrides=style_overrides,
                variant_id=variant_id,
                deps=deps,
                created_by_user_id=created_by_user_id,
                using_db=conn,
            )
            entry.draft_rev = next_rev
            await entry.save(update_fields=["draft_rev"], using_db=conn)

        return UUID(str(entry.id)), next_rev, now_ms

    async def publish_entry_by_slug(
        self,
        *,
        site_id: UUID,
        entry_type_id: UUID,
        slug: str,
        revision: int | None,
    ) -> tuple[UUID, int, int]:
        """
        Publish an entry revision by (entry_type_id, slug).

        Returns: (entry_id, published_revision, published_at_ms).
        """

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

            target_rev = int(revision) if revision is not None else int(entry.draft_rev or 0)
            if not target_rev:
                raise Conflict("No draft revision to publish", error="NO_DRAFT_TO_PUBLISH")

            rec = await EntryRevisionRecord.filter(entry_id=entry.id, rev=target_rev).using_db(conn).first()
            if rec is None:
                raise NotFound("Revision not found", error="REVISION_NOT_FOUND")

            await self._validate_revision_deps_assets(
                site_id=site_id,
                deps=(rec.deps if isinstance(rec.deps, dict) else None),
                conn=conn,
            )

            entry.published_rev = target_rev
            await entry.save(update_fields=["published_rev"], using_db=conn)

        return UUID(str(entry.id)), target_rev, now_ms

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
        """
        Save a page draft by pathname (helper for editor mode).

        Returns: (revision, saved_at_ms).
        """

        pathname = normalize_path(path)
        now_ms = int(time.time() * 1000)

        async with in_transaction() as conn:
            page = (
                await SitePageRecord.filter(site_id=site_id, path=pathname).using_db(conn).select_for_update().first()
            )
            if page is None:
                page = await SitePageRecord.create(
                    site_id=site_id,
                    path=pathname,
                    parent_id=None,
                    sort_order=0,
                    visibility=SitePageVisibility.PUBLIC,
                    draft_rev=0,
                    published_rev=None,
                    created_by_user_id=created_by_user_id,
                    using_db=conn,
                )

            current_rev = int(page.draft_rev or 0)
            if expected_revision is not None and expected_revision != current_rev:
                raise Conflict(
                    "Draft revision mismatch",
                    error="DRAFT_REVISION_MISMATCH",
                    meta={"expectedRevision": expected_revision, "currentRevision": current_rev},
                )

            next_rev = current_rev + 1 if current_rev else 1
            await SitePageRevisionRecord.create(
                page_id=page.id,
                rev=next_rev,
                document=document.model_dump(by_alias=True),
                meta=meta,
                style_overrides=style_overrides,
                variant_id=variant_id,
                deps=deps,
                created_by_user_id=created_by_user_id,
                using_db=conn,
            )
            page.draft_rev = next_rev
            await page.save(update_fields=["draft_rev"], using_db=conn)

        return next_rev, now_ms

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
        """
        Save a page draft by page id.

        Returns: (path, revision, saved_at_ms).
        """

        now_ms = int(time.time() * 1000)

        async with in_transaction() as conn:
            page = await SitePageRecord.filter(site_id=site_id, id=page_id).using_db(conn).select_for_update().first()
            if page is None:
                raise NotFound("Page not found", error="PAGE_NOT_FOUND")

            current_rev = int(page.draft_rev or 0)
            if expected_revision is not None and expected_revision != current_rev:
                raise Conflict(
                    "Draft revision mismatch",
                    error="DRAFT_REVISION_MISMATCH",
                    meta={"expectedRevision": expected_revision, "currentRevision": current_rev},
                )

            next_rev = current_rev + 1 if current_rev else 1
            await SitePageRevisionRecord.create(
                page_id=page.id,
                rev=next_rev,
                document=document.model_dump(by_alias=True),
                meta=meta,
                style_overrides=style_overrides,
                variant_id=variant_id,
                deps=deps,
                created_by_user_id=created_by_user_id,
                using_db=conn,
            )
            page.draft_rev = next_rev
            await page.save(update_fields=["draft_rev"], using_db=conn)

        return normalize_path(str(page.path)), next_rev, now_ms

    async def publish_page_by_path(
        self,
        *,
        site_id: UUID,
        path: str,
        revision: int | None,
    ) -> tuple[int, int]:
        """
        Publish a page revision by pathname.

        Returns: (published_revision, published_at_ms).
        """

        pathname = normalize_path(path)
        now_ms = int(time.time() * 1000)

        async with in_transaction() as conn:
            page = (
                await SitePageRecord.filter(site_id=site_id, path=pathname).using_db(conn).select_for_update().first()
            )
            if page is None:
                raise NotFound("Page not found", error="PAGE_NOT_FOUND")

            target_rev = int(revision) if revision is not None else int(page.draft_rev or 0)
            if not target_rev:
                raise Conflict("No draft revision to publish", error="NO_DRAFT_TO_PUBLISH")

            rec = await SitePageRevisionRecord.filter(page_id=page.id, rev=target_rev).using_db(conn).first()
            if rec is None:
                raise NotFound("Revision not found", error="REVISION_NOT_FOUND")

            await self._validate_revision_deps_assets(
                site_id=site_id,
                deps=(rec.deps if isinstance(rec.deps, dict) else None),
                conn=conn,
            )

            page.published_rev = target_rev
            await page.save(update_fields=["published_rev"], using_db=conn)

        return target_rev, now_ms

    async def publish_page_by_id(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        revision: int | None,
    ) -> tuple[str, int, int]:
        """
        Publish a page revision by page id.

        Returns: (path, published_revision, published_at_ms).
        """

        now_ms = int(time.time() * 1000)

        async with in_transaction() as conn:
            page = await SitePageRecord.filter(site_id=site_id, id=page_id).using_db(conn).select_for_update().first()
            if page is None:
                raise NotFound("Page not found", error="PAGE_NOT_FOUND")

            target_rev = int(revision) if revision is not None else int(page.draft_rev or 0)
            if not target_rev:
                raise Conflict("No draft revision to publish", error="NO_DRAFT_TO_PUBLISH")

            rec = await SitePageRevisionRecord.filter(page_id=page.id, rev=target_rev).using_db(conn).first()
            if rec is None:
                raise NotFound("Revision not found", error="REVISION_NOT_FOUND")

            await self._validate_revision_deps_assets(
                site_id=site_id,
                deps=(rec.deps if isinstance(rec.deps, dict) else None),
                conn=conn,
            )

            page.published_rev = target_rev
            await page.save(update_fields=["published_rev"], using_db=conn)

        return normalize_path(str(page.path)), target_rev, now_ms

    async def unpublish_page_by_id(self, *, site_id: UUID, page_id: UUID) -> tuple[str, int]:
        """
        Unpublish a page (published -> draft-only).

        Returns: (path, unpublished_at_ms).
        """

        now_ms = int(time.time() * 1000)

        async with in_transaction() as conn:
            page = await SitePageRecord.filter(site_id=site_id, id=page_id).using_db(conn).select_for_update().first()
            if page is None:
                raise NotFound("Page not found", error="PAGE_NOT_FOUND")

            # Idempotent: if already unpublished, keep it as is.
            cast(EntryRecordMutableFields, page).published_rev = None
            await page.save(update_fields=["published_rev"], using_db=conn)

        return normalize_path(str(page.path)), now_ms

    async def resolve_entry_by_slug(
        self,
        *,
        site_id: UUID,
        entry_type_id: UUID,
        slug: str,
        mode: Literal["public", "preview"],
    ) -> ResolvedEntryDocument | None:
        entry = await EntryRecord.get_or_none(site_id=site_id, entry_type_id=entry_type_id, slug=slug)
        if entry is None:
            return None

        draft_rev = int(entry.draft_rev or 0)
        published_rev = int(entry.published_rev or 0)

        revision = published_rev if mode == "public" else (draft_rev or published_rev)
        if revision <= 0:
            return None

        revision_state: Literal["draft", "published"]
        if mode == "public":
            revision_state = "published"
        else:
            revision_state = "draft" if draft_rev else "published"

        rec = await EntryRevisionRecord.get_or_none(entry_id=entry.id, rev=revision)
        if rec is None or rec.document is None:
            return None

        doc = DocumentIR.model_validate(rec.document)
        return ResolvedEntryDocument(
            entry_id=UUID(str(entry.id)),
            draft_rev=draft_rev,
            published_rev=published_rev,
            revision=revision,
            revision_state=revision_state,
            variant_id=(str(rec.variant_id) if rec.variant_id else None),
            document=doc,
        )

    async def list_route_templates(self, *, site_id: UUID) -> list[RouteTemplateRecord]:
        return (
            await RouteTemplateRecord
            .filter(site_id=site_id, is_active=True)
            .prefetch_related("entry_type", "template_page_revision")
            .all()
        )

    async def list_route_templates_all(self, *, site_id: UUID) -> list[RouteTemplateRecord]:
        return (
            await RouteTemplateRecord
            .filter(site_id=site_id)
            .prefetch_related("entry_type", "template_page_revision")
            .order_by("path_pattern")
            .all()
        )

    async def get_route_template_by_id(self, *, site_id: UUID, template_id: UUID) -> RouteTemplateRecord | None:
        return (
            await RouteTemplateRecord
            .filter(id=template_id, site_id=site_id)
            .prefetch_related("entry_type", "template_page_revision")
            .first()
        )

    async def create_route_template(
        self,
        *,
        site_id: UUID,
        path_pattern: str,
        entry_type_id: UUID,
        template_page_revision_id: UUID | None,
        is_active: bool,
    ) -> RouteTemplateRecord:
        try:
            rec = await RouteTemplateRecord.create(
                site_id=site_id,
                path_pattern=path_pattern,
                entry_type_id=entry_type_id,
                template_page_revision_id=template_page_revision_id,
                is_active=bool(is_active),
            )
        except IntegrityError:
            raise Conflict("Route template already exists", error="ROUTE_TEMPLATE_CONFLICT") from None

        await rec.fetch_related("entry_type", "template_page_revision")
        return rec

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
        async with in_transaction() as conn:
            rec = (
                await RouteTemplateRecord
                .filter(id=template_id, site_id=site_id)
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if rec is None:
                raise NotFound("Route template not found", error="ROUTE_TEMPLATE_NOT_FOUND")

            rec.path_pattern = path_pattern
            rec.entry_type_id = entry_type_id
            rec.template_page_revision_id = template_page_revision_id
            rec.is_active = bool(is_active)
            try:
                await rec.save(
                    update_fields=[
                        "path_pattern",
                        "entry_type_id",
                        "template_page_revision_id",
                        "is_active",
                    ],
                    using_db=conn,
                )
            except IntegrityError:
                raise Conflict("Route template already exists", error="ROUTE_TEMPLATE_CONFLICT") from None

        await rec.fetch_related("entry_type", "template_page_revision")
        return rec

    async def delete_route_template(self, *, site_id: UUID, template_id: UUID) -> None:
        deleted = await RouteTemplateRecord.filter(site_id=site_id, id=template_id).delete()
        if not deleted:
            raise NotFound("Route template not found", error="ROUTE_TEMPLATE_NOT_FOUND")

    def invalidate_route_template_cache(self, *, site_id: UUID) -> None:
        _route_template_cache.invalidate(site_id=site_id)

    async def match_route_template(
        self,
        *,
        site_id: UUID,
        pathname: str,
        cache_version: int = 0,
    ) -> RouteTemplateMatch | None:
        path = normalize_path(pathname)

        async def _load() -> list[_CompiledRouteTemplate]:
            templates = await self.list_route_templates(site_id=site_id)
            compiled: list[_CompiledRouteTemplate] = []
            for t in templates:
                t_like = cast(RouteTemplateIds, t)
                ct = _compile_path_pattern(
                    t.path_pattern,
                    template_id=UUID(str(t.id)),
                    entry_type_id=UUID(str(t_like.entry_type_id)),
                    template_page_revision_id=UUID(str(t_like.template_page_revision_id))
                    if t_like.template_page_revision_id
                    else None,
                )
                if ct is None:
                    continue
                compiled.append(ct)

            # Deterministic order: most specific first.
            compiled.sort(key=lambda x: x.sort_key, reverse=True)
            return compiled

        compiled = await _route_template_cache.get(site_id=site_id, version=int(cache_version or 0), loader=_load)

        for ct in compiled:
            params = _match_compiled(ct, path)
            if params is None:
                continue
            return RouteTemplateMatch(
                template_id=ct.template_id,
                entry_type_id=ct.entry_type_id,
                params=params,
                template_page_revision_id=ct.template_page_revision_id,
            )
        return None

    async def list_public_sitemap_paths(self, *, site_id: UUID) -> list[str]:
        """
        List public sitemap paths for a site.

        Sprint 3:
        - Pages: include only `visibility=public` and `published_rev` present.
        - Entries: include published entries for templates that have a single `:slug` param.
        """

        page_paths = await SitePageRecord.filter(
            site_id=site_id,
            visibility=SitePageVisibility.PUBLIC,
            published_rev__not_isnull=True,
        ).values_list("path", flat=True)
        page_set = {normalize_path(p) for p in page_paths if isinstance(p, str) and p}

        templates = await RouteTemplateRecord.filter(site_id=site_id, is_active=True).all()
        entry_paths: set[str] = set()
        for t in templates:
            t_like = cast(RouteTemplateIds, t)
            ct = _compile_path_pattern(
                t.path_pattern,
                template_id=UUID(str(t.id)),
                entry_type_id=UUID(str(t_like.entry_type_id)),
                template_page_revision_id=UUID(str(t_like.template_page_revision_id))
                if t_like.template_page_revision_id
                else None,
            )
            if ct is None:
                continue

            param_names = {name for kind, name in ct.segments if kind == "param"}
            if param_names != {"slug"}:
                continue

            slugs = await EntryRecord.filter(
                site_id=site_id,
                entry_type_id=ct.entry_type_id,
                published_rev__not_isnull=True,
            ).values_list("slug", flat=True)
            for slug in slugs:
                if not isinstance(slug, str):
                    continue
                s = slug.strip()
                if not s or "/" in s:
                    continue
                parts: list[str] = []
                for kind, name in ct.segments:
                    if kind == "static":
                        parts.append(name)
                    else:
                        parts.append(s)
                path = normalize_path("/" + "/".join(parts))
                if path in page_set:
                    continue
                entry_paths.add(path)

        paths = sorted(page_set | entry_paths)
        # Ensure homepage is first (handy for debugging, doesn't matter for consumers).
        if "/" in paths:
            paths.remove("/")
            paths.insert(0, "/")
        return paths


_PARAM_RE = re.compile(r"^:([A-Za-z][A-Za-z0-9_]*)$")


def _compile_path_pattern(
    path_pattern: str,
    *,
    template_id: UUID,
    entry_type_id: UUID,
    template_page_revision_id: UUID | None,
) -> _CompiledRouteTemplate | None:
    if not path_pattern or not path_pattern.startswith("/"):
        return None

    pat = normalize_path(path_pattern)
    if pat == "/":
        # Reserved for the site root; dynamic templates shouldn't use it.
        return None

    pat_segs = pat.split("/")[1:]
    if not pat_segs or any(not s for s in pat_segs):
        return None

    segments: list[tuple[str, str]] = []
    static_count = 0
    seen_params: set[str] = set()
    for seg in pat_segs:
        m = _PARAM_RE.match(seg)
        if m:
            name = m.group(1)
            if name in seen_params:
                return None
            seen_params.add(name)
            segments.append(("param", name))
            continue
        segments.append(("static", seg))
        static_count += 1

    sort_key = (static_count, len(segments), pat)
    return _CompiledRouteTemplate(
        template_id=template_id,
        entry_type_id=entry_type_id,
        template_page_revision_id=template_page_revision_id,
        path_pattern=pat,
        segments=tuple(segments),
        specificity=static_count,
        sort_key=sort_key,
    )


def _match_compiled(compiled: _CompiledRouteTemplate, pathname: str) -> dict[str, str] | None:
    path = normalize_path(pathname)
    path_segs = path.split("/")[1:]
    if len(path_segs) != len(compiled.segments):
        return None

    params: dict[str, str] = {}
    for (kind, value), seg in zip(compiled.segments, path_segs, strict=True):
        if kind == "static":
            if seg != value:
                return None
            continue
        # param
        params[value] = seg

    return params


def _match_path_pattern(path_pattern: str, pathname: str) -> tuple[dict[str, str], int] | None:
    """
    Match a simplified path pattern against a pathname.

    Rules (Sprint 3):
    - Pattern and pathname are both absolute paths (start with '/').
    - Only `:param` single-segment parameters are supported.
    - No splat/optional segments.

    Returns: (params, specificityScore) where specificityScore favors static matches.
    """

    # Kept for tests and for documenting Sprint 3 behavior.
    # Internally we prefer compile+match to support caching.
    ct = _compile_path_pattern(
        path_pattern,
        template_id=UUID(int=0),
        entry_type_id=UUID(int=0),
        template_page_revision_id=None,
    )
    if ct is None:
        return None
    params = _match_compiled(ct, pathname)
    return (params, ct.specificity) if params is not None else None
