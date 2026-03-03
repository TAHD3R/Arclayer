from __future__ import annotations

from typing import Literal
from uuid import UUID

from apps.api.src.common.services.base import BaseService
from apps.api.src.core.exceptions import Conflict, NotFound
from apps.api.src.core.http.pagination import PageData
from apps.api.src.modules.sites.content.page.mapping.service import PageNodeMapper
from apps.api.src.modules.sites.repository import SitesRepository
from apps.api.src.modules.sites.schema import (
    SitePageCreateIn,
    SitePageDeleteOut,
    SitePageMoveIn,
    SitePageTreeNodeOut,
    SitePageUpdateIn,
)
from apps.api.src.modules.sites.shared.service import build_pages_tree, is_descendant_or_self, validate_page_pathname

PageVisibility = Literal["public", "private"]
PAGE_VISIBILITY_PUBLIC: PageVisibility = "public"
PAGE_VISIBILITY_PRIVATE: PageVisibility = "private"


def _get_updated_by_user_id(value: object) -> UUID | None:
    raw = getattr(value, "updated_by_user_id", None)
    return UUID(str(raw)) if raw is not None else None


def _get_parent_id(value: object) -> UUID | None:
    raw = getattr(value, "parent_id", None)
    return UUID(str(raw)) if raw is not None else None


def _as_visibility(raw: str) -> PageVisibility:
    value = (raw or "").strip().lower()
    if value == PAGE_VISIBILITY_PUBLIC:
        return PAGE_VISIBILITY_PUBLIC
    if value == PAGE_VISIBILITY_PRIVATE:
        return PAGE_VISIBILITY_PRIVATE
    raise Conflict("Invalid page visibility", error="PAGE_VISIBILITY_INVALID")


class ContentPageService(BaseService):
    def __init__(
        self,
        settings,
        *,
        repo: SitesRepository,
    ) -> None:
        super().__init__(settings)
        self._repo = repo
        self._mapper = PageNodeMapper()

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
        user_summary_by_id = await self._mapper.load_page_user_summaries(user_ids=updated_by_user_ids)

        nodes = [
            self._mapper.to_page_tree_node(
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

        user_summary_by_id = await self._mapper.load_page_user_summaries(
            user_ids={actor_user_id} if actor_user_id is not None else set(),
        )
        return self._mapper.to_page_tree_node(page=page, user_summary_by_id=user_summary_by_id)

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

        new_visibility: PageVisibility = _as_visibility(str(page.visibility))
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
        user_summary_by_id = await self._mapper.load_page_user_summaries(
            user_ids={updated_by_user_id} if updated_by_user_id is not None else set(),
        )
        return self._mapper.to_page_tree_node(page=updated, user_summary_by_id=user_summary_by_id)

    async def get_page(self, *, site_id: UUID, page_id: UUID) -> SitePageTreeNodeOut:
        if not self.settings.database.enabled:
            raise Conflict("Site pages require database storage", error="PAGES_DB_REQUIRED")

        await self._repo.get_site_by_id(site_id=site_id)
        page = await self._repo.get_page_by_id(site_id=site_id, page_id=page_id)
        if page is None:
            raise NotFound("Page not found", error="PAGE_NOT_FOUND")

        updated_by_user_id = _get_updated_by_user_id(page)
        user_summary_by_id = await self._mapper.load_page_user_summaries(
            user_ids={updated_by_user_id} if updated_by_user_id is not None else set(),
        )
        return self._mapper.to_page_tree_node(page=page, user_summary_by_id=user_summary_by_id)

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
        user_summary_by_id = await self._mapper.load_page_user_summaries(
            user_ids={updated_by_user_id} if updated_by_user_id is not None else set(),
        )
        return self._mapper.to_page_tree_node(page=updated, user_summary_by_id=user_summary_by_id)

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
