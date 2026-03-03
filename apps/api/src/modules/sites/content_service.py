from __future__ import annotations

import time
from typing import Literal, cast
from uuid import UUID

from apps.api.src.common.protocols.tortoise import HasEntryTypeId, HasParentId, RouteTemplateIds
from apps.api.src.common.services.base import BaseService
from apps.api.src.core.exceptions import Conflict, NotFound
from apps.api.src.core.http.pagination import PageData, PageParams, paginate_items
from apps.api.src.modules.organization.models.user import User
from apps.api.src.modules.sites.constants import ROUTE_TEMPLATES_VERSION_NAMESPACE
from apps.api.src.modules.sites.repository import SitesRepository
from apps.api.src.modules.sites.schema import (
    SiteEntryCreateIn,
    SiteEntryDeleteOut,
    SiteEntryOut,
    SiteEntryTypeCreateIn,
    SiteEntryTypeDeleteOut,
    SiteEntryTypeOut,
    SiteEntryTypeUpdateIn,
    SiteEntryUnpublishIn,
    SiteEntryUnpublishOut,
    SiteEntryUpdateIn,
    SitePageCreateIn,
    SitePageDeleteOut,
    SitePageMoveIn,
    SitePageTreeNodeOut,
    SitePageUpdateIn,
    SitePageUserSummaryOut,
    SiteRouteTemplateCreateIn,
    SiteRouteTemplateDeleteOut,
    SiteRouteTemplateOut,
    SiteRouteTemplateUpdateIn,
)
from apps.api.src.modules.sites.stores import RouteTemplateVersionStore
from apps.api.src.modules.sites.utils import (
    build_pages_tree,
    is_descendant_or_self,
    validate_entry_type_code,
    validate_page_pathname,
    validate_route_template_pattern,
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


def _get_updated_by_user_id(value: object) -> UUID | None:
    raw = getattr(value, "updated_by_user_id", None)
    return UUID(str(raw)) if raw is not None else None


class SiteContentService(BaseService):
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

    async def _load_page_user_summaries(
        self,
        *,
        user_ids: set[UUID],
    ) -> dict[UUID, SitePageUserSummaryOut]:
        if not user_ids:
            return {}

        rows = await User.filter(id__in=list(user_ids)).values("id", "display_name", "email", "avatar_url")
        out: dict[UUID, SitePageUserSummaryOut] = {}
        for row in rows:
            raw_id = row.get("id")
            if raw_id is None:
                continue
            user_id = UUID(str(raw_id))
            out[user_id] = SitePageUserSummaryOut(
                id=user_id,
                display_name=(str(row.get("display_name")) if row.get("display_name") is not None else None),
                email=(str(row.get("email")) if row.get("email") is not None else None),
                avatar_url=(str(row.get("avatar_url")) if row.get("avatar_url") is not None else None),
            )
        return out

    def _to_page_tree_node(
        self,
        *,
        page,
        user_summary_by_id: dict[UUID, SitePageUserSummaryOut],
    ) -> SitePageTreeNodeOut:
        updated_by_user_id = _get_updated_by_user_id(page)
        return SitePageTreeNodeOut(
            id=UUID(str(page.id)),
            title=(page.title if isinstance(page.title, str) else None),
            description=(page.description if isinstance(page.description, str) else None),
            path=page.path,
            parent_id=_get_parent_id(page),
            sort_order=int(page.sort_order or 0),
            visibility=_as_visibility(str(page.visibility)),
            draft_revision=int(page.draft_rev or 0),
            published_revision=(int(page.published_rev) if page.published_rev is not None else None),
            updated_at=page.updated_at,
            updated_by=(user_summary_by_id.get(updated_by_user_id) if updated_by_user_id is not None else None),
            children=[],
        )

    async def list_pages_tree(self, *, site_id: UUID) -> PageData[SitePageTreeNodeOut]:
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

        updated_by_user_ids = {
            user_id for user_id in (_get_updated_by_user_id(page) for page in pages) if user_id is not None
        }
        user_summary_by_id = await self._load_page_user_summaries(user_ids=updated_by_user_ids)

        nodes = [
            self._to_page_tree_node(
                page=p,
                user_summary_by_id=user_summary_by_id,
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

    async def create_page(
        self,
        *,
        site_id: UUID,
        payload: SitePageCreateIn,
        actor_user_id: UUID | None,
    ) -> SitePageTreeNodeOut:
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
            title=payload.title,
            description=payload.description,
            path=path,
            parent_id=parent_id,
            sort_order=int(payload.sort_order or 0),
            visibility=payload.visibility,
            created_by_user_id=actor_user_id,
            updated_by_user_id=actor_user_id,
        )

        user_summary_by_id = await self._load_page_user_summaries(
            user_ids={actor_user_id} if actor_user_id is not None else set(),
        )
        return self._to_page_tree_node(page=page, user_summary_by_id=user_summary_by_id)

    async def update_page(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        payload: SitePageUpdateIn,
        actor_user_id: UUID | None,
    ) -> SitePageTreeNodeOut:
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

        new_title = page.title
        if "title" in fields_set:
            new_title = payload.title

        new_description = page.description
        if "description" in fields_set:
            new_description = payload.description

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
            title=new_title,
            description=new_description,
            path=new_path,
            parent_id=new_parent_id,
            sort_order=new_sort_order,
            visibility=new_visibility,
            updated_by_user_id=actor_user_id,
        )

        updated_by_user_id = _get_updated_by_user_id(updated)
        user_summary_by_id = await self._load_page_user_summaries(
            user_ids={updated_by_user_id} if updated_by_user_id is not None else set(),
        )
        return self._to_page_tree_node(page=updated, user_summary_by_id=user_summary_by_id)

    async def get_page(self, *, site_id: UUID, page_id: UUID) -> SitePageTreeNodeOut:
        if not self.settings.database.enabled:
            raise Conflict("Site pages require database storage", error="PAGES_DB_REQUIRED")

        await self._repo.get_site_by_id(site_id=site_id)
        page = await self._repo.get_page_by_id(site_id=site_id, page_id=page_id)
        if page is None:
            raise NotFound("Page not found", error="PAGE_NOT_FOUND")

        updated_by_user_id = _get_updated_by_user_id(page)
        user_summary_by_id = await self._load_page_user_summaries(
            user_ids={updated_by_user_id} if updated_by_user_id is not None else set(),
        )
        return self._to_page_tree_node(page=page, user_summary_by_id=user_summary_by_id)

    async def move_page(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        payload: SitePageMoveIn,
        actor_user_id: UUID | None,
    ) -> SitePageTreeNodeOut:
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
            title=page.title,
            description=page.description,
            path=page.path,
            parent_id=new_parent_id,
            sort_order=int(payload.sort_order or 0),
            visibility=str(page.visibility),
            updated_by_user_id=actor_user_id,
        )

        updated_by_user_id = _get_updated_by_user_id(updated)
        user_summary_by_id = await self._load_page_user_summaries(
            user_ids={updated_by_user_id} if updated_by_user_id is not None else set(),
        )
        return self._to_page_tree_node(page=updated, user_summary_by_id=user_summary_by_id)

    async def delete_page(self, *, site_id: UUID, page_id: UUID) -> SitePageDeleteOut:
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
        return SitePageDeleteOut(page_id=UUID(str(page.id)))

    async def list_route_templates_paginated(
        self, *, site_id: UUID, params: PageParams
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
        self, *, site_id: UUID, template_id: UUID, payload: SiteRouteTemplateUpdateIn
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

    async def list_entry_types_paginated(self, *, site_id: UUID, params: PageParams) -> PageData[SiteEntryTypeOut]:
        if not self.settings.database.enabled:
            raise Conflict("Entry types require database storage", error="ENTRY_TYPE_DB_REQUIRED")
        await self._repo.get_site_by_id(site_id=site_id)

        items = [
            SiteEntryTypeOut(
                id=UUID(str(et.id)),
                site_id=site_id,
                code=str(et.code),
                name=str(et.name),
                fields_schema=(et.fields_schema if isinstance(et.fields_schema, dict) else None),
            )
            for et in await self._repo.list_entry_types(site_id=site_id)
        ]
        return paginate_items(items, params=params)

    async def create_entry_type(self, *, site_id: UUID, payload: SiteEntryTypeCreateIn) -> SiteEntryTypeOut:
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
            site_id=site_id,
            code=str(rec.code),
            name=str(rec.name),
            fields_schema=(rec.fields_schema if isinstance(rec.fields_schema, dict) else None),
        )

    async def update_entry_type(
        self,
        *,
        site_id: UUID,
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
            site_id=site_id,
            code=str(updated.code),
            name=str(updated.name),
            fields_schema=(updated.fields_schema if isinstance(updated.fields_schema, dict) else None),
        )

    async def delete_entry_type(self, *, site_id: UUID, entry_type_id: UUID) -> SiteEntryTypeDeleteOut:
        if not self.settings.database.enabled:
            raise Conflict("Entry types require database storage", error="ENTRY_TYPE_DB_REQUIRED")
        await self._repo.get_site_by_id(site_id=site_id)
        await self._repo.delete_entry_type(site_id=site_id, entry_type_id=entry_type_id)
        return SiteEntryTypeDeleteOut(entry_type_id=entry_type_id)

    async def list_entries_paginated(
        self,
        *,
        site_id: UUID,
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
                    site_id=site_id,
                    entry_type_id=entry_type_id_value,
                    entry_type_code=str(et_code),
                    slug=str(e.slug),
                    draft_revision=int(e.draft_rev or 0),
                    published_revision=(int(e.published_rev) if e.published_rev is not None else None),
                )
            )
        return paginate_items(items, params=params)

    async def create_entry(self, *, site_id: UUID, payload: SiteEntryCreateIn) -> SiteEntryOut:
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
            site_id=site_id,
            entry_type_id=entry_type_id_value,
            entry_type_code=str(payload.entry_type_code),
            slug=str(entry.slug),
            draft_revision=int(entry.draft_rev or 0),
            published_revision=(int(entry.published_rev) if entry.published_rev is not None else None),
        )

    async def update_entry(self, *, site_id: UUID, entry_id: UUID, payload: SiteEntryUpdateIn) -> SiteEntryOut:
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
            site_id=site_id,
            entry_type_id=entry_type_id_value,
            entry_type_code=str(et.code),
            slug=str(updated.slug),
            draft_revision=int(updated.draft_rev or 0),
            published_revision=(int(updated.published_rev) if updated.published_rev is not None else None),
        )

    async def unpublish_entry(self, *, site_id: UUID, payload: SiteEntryUnpublishIn) -> SiteEntryUnpublishOut:
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
            entry_id=entry_id,
            entry_type_code=payload.entry_type_code,
            slug=(payload.slug or "").strip(),
            unpublished_at_ms=now_ms,
        )

    async def delete_entry(self, *, site_id: UUID, entry_id: UUID) -> SiteEntryDeleteOut:
        if not self.settings.database.enabled:
            raise Conflict("Entries require database storage", error="ENTRY_DB_REQUIRED")
        await self._repo.get_site_by_id(site_id=site_id)
        await self._repo.delete_entry(site_id=site_id, entry_id=entry_id)
        return SiteEntryDeleteOut(entry_id=entry_id)

    # --- Delivery API (public read-only) ---

    async def delivery_list_entries(
        self,
        *,
        site_id: UUID,
        params: PageParams,
        type_code: str | None = None,
        display_mode: str | None = None,
    ) -> PageData:
        from apps.api.src.modules.sites.schema_delivery import DeliveryEntryOut

        if not self.settings.database.enabled:
            return paginate_items([], params=params)
        await self._repo.get_site_by_id(site_id=site_id)

        entry_type_id: UUID | None = None
        if type_code:
            et = await self._repo.get_entry_type_by_code(site_id=site_id, code=type_code)
            entry_type_id = UUID(str(et.id))

        entries = await self._repo.list_published_entries(
            site_id=site_id,
            entry_type_id=entry_type_id,
        )
        items = [
            DeliveryEntryOut(
                slug=str(e.get("slug") or ""),
                type_code=str(e.get("entry_type_code") or ""),
                title=(e.get("title") if isinstance(e.get("title"), str) else None),
                field_values=(e.get("field_values") if isinstance(e.get("field_values"), dict) else None),
                page_blueprint=(
                    None
                    if not display_mode
                    else (e.get("page_blueprint") if isinstance(e.get("page_blueprint"), dict) else None)
                ),
            )
            for e in entries
        ]
        return paginate_items(items, params=params)

    async def delivery_get_entry(
        self,
        *,
        site_id: UUID,
        slug: str,
        display_mode: str | None = None,
    ):
        from apps.api.src.modules.sites.schema_delivery import DeliveryEntryOut

        if not self.settings.database.enabled:
            raise NotFound("Entry not found", error="DELIVERY_ENTRY_NOT_FOUND")
        await self._repo.get_site_by_id(site_id=site_id)
        e = await self._repo.get_published_entry_by_slug(site_id=site_id, slug=slug)
        return DeliveryEntryOut(
            slug=str(e.get("slug") or ""),
            type_code=str(e.get("entry_type_code") or ""),
            title=(e.get("title") if isinstance(e.get("title"), str) else None),
            field_values=(e.get("field_values") if isinstance(e.get("field_values"), dict) else None),
            page_blueprint=(e.get("page_blueprint") if isinstance(e.get("page_blueprint"), dict) else None),
        )

    async def delivery_get_menu(self, *, site_id: UUID, menu_key: str):
        from apps.api.src.modules.sites.schema_delivery import DeliveryMenuOut

        await self._repo.get_site_by_id(site_id=site_id)
        menu = await self._repo.get_menu_by_key(site_id=site_id, key=menu_key)
        items_raw = menu.get("items") if isinstance(menu, dict) else None
        return DeliveryMenuOut(
            key=menu_key,
            items=(items_raw if isinstance(items_raw, list) else []),
        )

    async def delivery_get_style(self, *, site_id: UUID):
        from apps.api.src.modules.sites.schema_delivery import DeliveryStyleOut

        await self._repo.get_site_by_id(site_id=site_id)
        style = await self._repo.get_site_style(site_id=site_id)
        return DeliveryStyleOut(
            effective=style if isinstance(style, dict) else None,
        )
