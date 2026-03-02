from __future__ import annotations

from datetime import datetime
from typing import Literal, Protocol, cast
from uuid import UUID

from apps.api.common.protocols.tortoise import HasWorkspaceId
from apps.api.config import Settings
from apps.api.core.exceptions import Conflict, NotFound
from apps.api.core.http.pagination import PageData
from apps.api.modules.organization.models.user import User
from apps.api.modules.sites.schema import (
    SitePageCreateIn as ContentPageCreateIn,
)
from apps.api.modules.sites.schema import (
    SitePageDeleteOut as ContentPageDeleteOut,
)
from apps.api.modules.sites.schema import (
    SitePageDraftSaveIn as ContentPageDraftSaveIn,
)
from apps.api.modules.sites.schema import (
    SitePageDraftSaveOut as ContentPageDraftSaveOut,
)
from apps.api.modules.sites.schema import (
    SitePageMoveIn as ContentPageMoveIn,
)
from apps.api.modules.sites.schema import (
    SitePagePublishIn as ContentPagePublishIn,
)
from apps.api.modules.sites.schema import (
    SitePagePublishOut as ContentPagePublishOut,
)
from apps.api.modules.sites.schema import (
    SitePageRevisionOut as ContentPageRevisionOut,
)
from apps.api.modules.sites.schema import (
    SitePageRollbackIn as ContentPageRollbackIn,
)
from apps.api.modules.sites.schema import (
    SitePageRollbackOut as ContentPageRollbackOut,
)
from apps.api.modules.sites.schema import (
    SitePageTreeNodeOut as ContentPageTreeNodeOut,
)
from apps.api.modules.sites.schema import (
    SitePageUnpublishOut as ContentPageUnpublishOut,
)
from apps.api.modules.sites.schema import (
    SitePageUpdateIn as ContentPageUpdateIn,
)
from apps.api.modules.sites.schema import SitePageUserSummaryOut
from apps.api.modules.sites.service import SiteService
from apps.api.modules.sites.utils import build_pages_tree, validate_page_pathname
from apps.api.modules.workspaces.content.repository import WorkspaceContentRepository
from apps.api.modules.workspaces.content.schema import ContentEntryRevisionOut, ContentRevisionState


def _slug_from_path(pathname: str) -> str:
    value = (pathname or "").strip()
    if value == "/":
        return "index"
    return value.lstrip("/").replace("/", "-")


def _as_visibility(value: str) -> Literal["public", "private"]:
    return cast(Literal["public", "private"], value)


class PageEntryTypeLike(Protocol):
    kind: str | None


class PageEntryLike(Protocol):
    id: UUID
    title: str | None
    path: str | None
    visibility: str
    draft_revision: int | None
    published_revision: int | None
    updated_at: datetime | None
    updated_by_user_id: UUID | None
    parent_entry_id: UUID | None
    sort_order: int | None
    type: PageEntryTypeLike


class PagesServiceProtocol(Protocol):
    settings: Settings
    repo: WorkspaceContentRepository
    site_service: SiteService

    def _now_ms(self) -> int: ...

    async def get_entry_revision(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        entry_id: UUID,
        state: ContentRevisionState,
    ) -> ContentEntryRevisionOut: ...

    async def _resolve_workspace_id_for_site(self, *, site_id: UUID) -> UUID: ...

    async def _load_page_user_summaries(
        self,
        *,
        user_ids: set[UUID],
    ) -> dict[UUID, SitePageUserSummaryOut]: ...

    def _to_page_tree_node(
        self,
        *,
        entry: PageEntryLike,
        user_summary_by_id: dict[UUID, SitePageUserSummaryOut],
    ) -> ContentPageTreeNodeOut: ...

    async def _ensure_page_content_type_id(self, *, workspace_id: UUID, site_id: UUID) -> UUID: ...

    async def _get_page_entry(self, *, workspace_id: UUID, site_id: UUID, entry_id: UUID) -> PageEntryLike: ...

    async def _assert_no_parent_cycle(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        entry_id: UUID,
        parent_id: UUID | None,
    ) -> None: ...


class WorkspaceContentPagesMixin:
    """
    Workspace content pages are backed by ContentEntry(kind="page").

    We keep the /workspaces/{wsId}/content/pages/* endpoints and schemas stable by mapping
    ContentEntryRecord -> SitePageTreeNodeOut/SitePageRevisionOut.
    """

    async def _resolve_workspace_id_for_site(self: PagesServiceProtocol, *, site_id: UUID) -> UUID:
        site = await self.site_service.get_site_by_id(site_id=site_id)
        return UUID(str(cast(HasWorkspaceId, site).workspace_id))

    async def _load_page_user_summaries(
        self: PagesServiceProtocol,
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
        self: PagesServiceProtocol,
        *,
        entry: PageEntryLike,
        user_summary_by_id: dict[UUID, SitePageUserSummaryOut],
    ) -> ContentPageTreeNodeOut:
        field_values = getattr(entry, "field_values", None)
        raw_description = field_values.get("description") if isinstance(field_values, dict) else None
        description = (raw_description.strip() or None) if isinstance(raw_description, str) else None

        updated_by_user_id = getattr(entry, "updated_by_user_id", None)
        updated_by = None
        if updated_by_user_id is not None:
            updated_by = user_summary_by_id.get(UUID(str(updated_by_user_id)))

        parent_id = getattr(entry, "parent_entry_id", None)
        return ContentPageTreeNodeOut(
            id=UUID(str(entry.id)),
            title=(entry.title if isinstance(entry.title, str) else None),
            description=description,
            path=(str(entry.path) if isinstance(entry.path, str) else "/"),
            parent_id=(UUID(str(parent_id)) if parent_id is not None else None),
            sort_order=int(getattr(entry, "sort_order", 0) or 0),
            visibility=_as_visibility(str(entry.visibility)),
            draft_revision=int(entry.draft_revision or 0),
            published_revision=(int(entry.published_revision) if entry.published_revision is not None else None),
            updated_at=entry.updated_at,
            updated_by=updated_by,
            children=[],
        )

    async def _ensure_page_content_type_id(self: PagesServiceProtocol, *, workspace_id: UUID, site_id: UUID) -> UUID:
        record = await self.repo.get_type_by_kind(workspace_id=workspace_id, site_id=site_id, kind="page")
        if record is not None:
            return UUID(str(record.id))

        # Default code for page kind: "page".
        try:
            created = await self.repo.create_type(
                workspace_id=workspace_id,
                site_id=site_id,
                code="page",
                name="Page",
                kind="page",
                field_schema=None,
                editor_schema=None,
                render_contract=None,
                workflow_policy=None,
            )
            return UUID(str(created.id))
        except Conflict as exc:
            # If the code already exists (legacy/custom), reuse it rather than failing the page APIs.
            if exc.error != "CONTENT_TYPE_CONFLICT":
                raise
            existing = await self.repo.get_type_by_code(workspace_id=workspace_id, site_id=site_id, code="page")
            if existing is None:
                raise
            return UUID(str(existing.id))

    async def _get_page_entry(
        self: PagesServiceProtocol,
        *,
        workspace_id: UUID,
        site_id: UUID,
        entry_id: UUID,
    ) -> PageEntryLike:
        entry = await self.repo.get_entry_by_id(workspace_id=workspace_id, site_id=site_id, entry_id=entry_id)
        if entry is None or getattr(entry.type, "kind", None) != "page":
            raise NotFound("Page not found", error="PAGE_NOT_FOUND")
        return cast(PageEntryLike, entry)

    async def _assert_no_parent_cycle(
        self: PagesServiceProtocol,
        *,
        workspace_id: UUID,
        site_id: UUID,
        entry_id: UUID,
        parent_id: UUID | None,
    ) -> None:
        if parent_id is None:
            return
        if parent_id == entry_id:
            raise Conflict("Invalid parent page id", error="PARENT_PAGE_INVALID")

        cursor_id: UUID | None = parent_id
        while cursor_id is not None:
            if cursor_id == entry_id:
                raise Conflict("Parent cycle detected", error="PARENT_PAGE_CYCLE")
            parent = await self.repo.get_entry_by_id(
                workspace_id=workspace_id,
                site_id=site_id,
                entry_id=cursor_id,
            )
            if parent is None:
                return
            next_parent = getattr(parent, "parent_entry_id", None)
            cursor_id = UUID(str(next_parent)) if next_parent is not None else None

    async def list_pages_tree(self: PagesServiceProtocol, *, site_id: UUID) -> PageData[ContentPageTreeNodeOut]:
        if not self.settings.database.enabled:
            raise Conflict("Site pages require database storage", error="PAGES_DB_REQUIRED")

        workspace_id = await self._resolve_workspace_id_for_site(site_id=site_id)
        await self.site_service.get_site_by_id(site_id=site_id)

        entries = await self.repo.list_page_entries(workspace_id=workspace_id, site_id=site_id)
        updated_by_user_ids = {
            UUID(str(uid)) for uid in (getattr(e, "updated_by_user_id", None) for e in entries) if uid is not None
        }
        user_summary_by_id = await self._load_page_user_summaries(user_ids=updated_by_user_ids)

        nodes = [
            self._to_page_tree_node(entry=cast(PageEntryLike, e), user_summary_by_id=user_summary_by_id)
            for e in entries
        ]
        tree = build_pages_tree(nodes)

        total = int(len(entries))
        size = max(total, 1)
        return PageData[ContentPageTreeNodeOut](
            items=tree,
            total=total,
            page=1,
            size=size,
            pages=(1 if total > 0 else 0),
            next=None,
            prev=None,
        )

    async def create_page(
        self: PagesServiceProtocol,
        *,
        site_id: UUID,
        payload: ContentPageCreateIn,
        actor_user_id: UUID | None,
    ) -> ContentPageTreeNodeOut:
        if not self.settings.database.enabled:
            raise Conflict("Site pages require database storage", error="PAGES_DB_REQUIRED")

        site = await self.site_service.get_site_by_id(site_id=site_id)
        workspace_id = UUID(str(cast(HasWorkspaceId, site).workspace_id))

        path = validate_page_pathname(payload.path)
        parent_id = payload.parent_id
        parent_entry_id = UUID(str(parent_id)) if parent_id is not None else None
        if parent_entry_id is not None:
            await self._get_page_entry(workspace_id=workspace_id, site_id=site_id, entry_id=parent_entry_id)

        existing = await self.repo.get_page_entry_by_path(workspace_id=workspace_id, site_id=site_id, path=path)
        if existing is not None:
            raise Conflict("Page path already exists", error="PAGE_PATH_CONFLICT")

        type_id = await self._ensure_page_content_type_id(workspace_id=workspace_id, site_id=site_id)
        title = payload.title.strip() if isinstance(payload.title, str) and payload.title.strip() else None
        locale = str(getattr(site, "default_locale", "zh-CN"))

        created = await self.repo.create_entry(
            workspace_id=workspace_id,
            site_id=site_id,
            type_id=type_id,
            slug=_slug_from_path(path),
            title=title,
            visibility=payload.visibility,
            locale=locale,
            path=path,
            parent_entry_id=parent_entry_id,
            sort_order=int(payload.sort_order or 0),
            created_by_user_id=actor_user_id,
        )

        description = (
            payload.description.strip()
            if isinstance(payload.description, str) and payload.description.strip()
            else None
        )
        if description is not None:
            created = await self.repo.update_entry(
                workspace_id=workspace_id,
                site_id=site_id,
                entry_id=UUID(str(created.id)),
                fields={"field_values": {"description": description}},
                updated_by_user_id=actor_user_id,
            )

        user_summary_by_id = await self._load_page_user_summaries(
            user_ids={actor_user_id} if actor_user_id is not None else set(),
        )
        return self._to_page_tree_node(entry=cast(PageEntryLike, created), user_summary_by_id=user_summary_by_id)

    async def get_page(self: PagesServiceProtocol, *, site_id: UUID, page_id: UUID) -> ContentPageTreeNodeOut:
        if not self.settings.database.enabled:
            raise Conflict("Site pages require database storage", error="PAGES_DB_REQUIRED")

        workspace_id = await self._resolve_workspace_id_for_site(site_id=site_id)
        entry = await self._get_page_entry(workspace_id=workspace_id, site_id=site_id, entry_id=page_id)

        updated_by_user_id = getattr(entry, "updated_by_user_id", None)
        user_summary_by_id = await self._load_page_user_summaries(
            user_ids={UUID(str(updated_by_user_id))} if updated_by_user_id is not None else set(),
        )
        return self._to_page_tree_node(entry=cast(PageEntryLike, entry), user_summary_by_id=user_summary_by_id)

    async def update_page(
        self: PagesServiceProtocol,
        *,
        site_id: UUID,
        page_id: UUID,
        payload: ContentPageUpdateIn,
        actor_user_id: UUID | None,
    ) -> ContentPageTreeNodeOut:
        if not self.settings.database.enabled:
            raise Conflict("Site pages require database storage", error="PAGES_DB_REQUIRED")

        workspace_id = await self._resolve_workspace_id_for_site(site_id=site_id)
        entry = await self._get_page_entry(workspace_id=workspace_id, site_id=site_id, entry_id=page_id)

        fields_set = payload.model_fields_set
        fields: dict[str, object] = {}

        if "title" in fields_set:
            if payload.title is None:
                fields["title"] = None
            else:
                title = payload.title.strip()
                fields["title"] = title or None

        if "description" in fields_set:
            base = getattr(entry, "field_values", None)
            next_field_values: dict[str, object] = dict(base) if isinstance(base, dict) else {}
            if payload.description is None:
                next_field_values.pop("description", None)
            else:
                desc = payload.description.strip()
                if desc:
                    next_field_values["description"] = desc
                else:
                    next_field_values.pop("description", None)
            fields["field_values"] = next_field_values or None

        if "visibility" in fields_set and payload.visibility is not None:
            fields["visibility"] = payload.visibility

        if "sort_order" in fields_set and payload.sort_order is not None:
            fields["sort_order"] = int(payload.sort_order)

        if "path" in fields_set and payload.path is not None:
            next_path = validate_page_pathname(payload.path)
            existing = await self.repo.get_page_entry_by_path(
                workspace_id=workspace_id,
                site_id=site_id,
                path=next_path,
            )
            if existing is not None and UUID(str(existing.id)) != page_id:
                raise Conflict("Page path already exists", error="PAGE_PATH_CONFLICT")
            fields["path"] = next_path
            fields["slug"] = _slug_from_path(next_path)

        if "parent_id" in fields_set:
            next_parent_id = UUID(str(payload.parent_id)) if payload.parent_id is not None else None
            if next_parent_id is not None:
                await self._get_page_entry(workspace_id=workspace_id, site_id=site_id, entry_id=next_parent_id)
            await self._assert_no_parent_cycle(
                workspace_id=workspace_id,
                site_id=site_id,
                entry_id=page_id,
                parent_id=next_parent_id,
            )
            fields["parent_entry_id"] = next_parent_id

        updated = await self.repo.update_entry(
            workspace_id=workspace_id,
            site_id=site_id,
            entry_id=page_id,
            fields=fields,
            updated_by_user_id=actor_user_id,
        )

        updated_by_user_id = getattr(updated, "updated_by_user_id", None)
        user_summary_by_id = await self._load_page_user_summaries(
            user_ids={UUID(str(updated_by_user_id))} if updated_by_user_id is not None else set(),
        )
        return self._to_page_tree_node(entry=cast(PageEntryLike, updated), user_summary_by_id=user_summary_by_id)

    async def move_page(
        self: PagesServiceProtocol,
        *,
        site_id: UUID,
        page_id: UUID,
        payload: ContentPageMoveIn,
        actor_user_id: UUID | None,
    ) -> ContentPageTreeNodeOut:
        if not self.settings.database.enabled:
            raise Conflict("Site pages require database storage", error="PAGES_DB_REQUIRED")

        workspace_id = await self._resolve_workspace_id_for_site(site_id=site_id)
        entry = await self._get_page_entry(workspace_id=workspace_id, site_id=site_id, entry_id=page_id)

        next_parent_id = UUID(str(payload.parent_id)) if payload.parent_id is not None else None
        if next_parent_id is not None:
            await self._get_page_entry(workspace_id=workspace_id, site_id=site_id, entry_id=next_parent_id)
        await self._assert_no_parent_cycle(
            workspace_id=workspace_id,
            site_id=site_id,
            entry_id=page_id,
            parent_id=next_parent_id,
        )

        updated = await self.repo.update_entry(
            workspace_id=workspace_id,
            site_id=site_id,
            entry_id=page_id,
            fields={"parent_entry_id": next_parent_id, "sort_order": int(payload.sort_order or 0)},
            updated_by_user_id=actor_user_id,
        )

        updated_by_user_id = getattr(updated, "updated_by_user_id", None)
        user_summary_by_id = await self._load_page_user_summaries(
            user_ids={UUID(str(updated_by_user_id))} if updated_by_user_id is not None else set(),
        )
        return self._to_page_tree_node(entry=cast(PageEntryLike, updated), user_summary_by_id=user_summary_by_id)

    async def delete_page(self: PagesServiceProtocol, *, site_id: UUID, page_id: UUID) -> ContentPageDeleteOut:
        if not self.settings.database.enabled:
            raise Conflict("Site pages require database storage", error="PAGES_DB_REQUIRED")

        workspace_id = await self._resolve_workspace_id_for_site(site_id=site_id)
        entry = await self._get_page_entry(workspace_id=workspace_id, site_id=site_id, entry_id=page_id)

        if await self.repo.has_page_children(
            workspace_id=workspace_id,
            site_id=site_id,
            parent_entry_id=page_id,
        ):
            raise Conflict("Page has children", error="PAGE_HAS_CHILDREN")

        await self.repo.delete_entry(workspace_id=workspace_id, site_id=site_id, entry_id=page_id)
        return ContentPageDeleteOut(page_id=page_id)

    async def get_page_revision(
        self: PagesServiceProtocol,
        *,
        site_id: UUID,
        page_id: UUID,
        state: Literal["draft", "published"],
    ) -> ContentPageRevisionOut:
        if not self.settings.database.enabled:
            raise Conflict("Site pages require database storage", error="PAGES_DB_REQUIRED")

        workspace_id = await self._resolve_workspace_id_for_site(site_id=site_id)
        revision_out = await self.get_entry_revision(
            workspace_id=workspace_id,
            site_id=site_id,
            entry_id=page_id,
            state=cast(Literal["draft", "published"], state),
        )

        snapshot = revision_out.snapshot if isinstance(revision_out.snapshot, dict) else {}
        raw_doc = snapshot.get("page_blueprint") if isinstance(snapshot, dict) else None
        if raw_doc is None:
            raw_doc = snapshot.get("design_document") if isinstance(snapshot, dict) else None
        if raw_doc is None:
            raise NotFound("Page blueprint not found", error="PAGE_BLUEPRINT_NOT_FOUND")

        from apps.api.modules.sites.design_document_schema import PageBlueprint  # local import to avoid cycles

        try:
            doc = PageBlueprint.model_validate(raw_doc)
        except Exception as exc:
            raise Conflict("Invalid page blueprint", error="PAGE_BLUEPRINT_INVALID") from exc
        meta = snapshot.get("meta") if isinstance(snapshot.get("meta"), dict) else None
        style_overrides = snapshot.get("style_overrides") if isinstance(snapshot.get("style_overrides"), dict) else None
        variant_id = snapshot.get("variant_id") if isinstance(snapshot.get("variant_id"), str) else None
        deps = snapshot.get("deps") if isinstance(snapshot.get("deps"), dict) else None

        return ContentPageRevisionOut(
            page_id=page_id,
            state=state,
            revision=revision_out.revision,
            created_at_ms=revision_out.created_at_ms,
            pageBlueprint=doc,
            meta=meta,
            style_overrides=style_overrides,
            variant_id=variant_id,
            deps=deps,
        )

    async def save_page_draft(
        self: PagesServiceProtocol,
        *,
        site_id: UUID,
        page_id: UUID,
        payload: ContentPageDraftSaveIn,
        actor_user_id: UUID | None,
    ) -> ContentPageDraftSaveOut:
        if not self.settings.database.enabled:
            raise Conflict("Site pages require database storage", error="PAGES_DB_REQUIRED")

        workspace_id = await self._resolve_workspace_id_for_site(site_id=site_id)
        entry = await self._get_page_entry(workspace_id=workspace_id, site_id=site_id, entry_id=page_id)

        field_values: dict[str, object] = {"title": (entry.title or "")} if entry.title else {}
        base = getattr(entry, "field_values", None)
        raw_description = base.get("description") if isinstance(base, dict) else None
        if isinstance(raw_description, str) and raw_description.strip():
            field_values["description"] = raw_description.strip()
        meta = payload.meta if isinstance(payload.meta, dict) else {}
        if isinstance(entry.path, str):
            meta = {**meta, "kind": "page", "path": entry.path}

        _, revision = await self.repo.save_entry_draft(
            workspace_id=workspace_id,
            site_id=site_id,
            entry_id=page_id,
            page_blueprint=payload.page_blueprint.model_dump(by_alias=True),
            field_values=field_values,
            meta=meta,
            expected_revision=payload.expected_revision,
            actor_user_id=actor_user_id,
        )
        return ContentPageDraftSaveOut(
            site_id=site_id,
            page_id=page_id,
            path=(str(entry.path) if isinstance(entry.path, str) else "/"),
            revision=revision.revision,
            saved_at_ms=self._now_ms(),
        )

    async def publish_page(
        self: PagesServiceProtocol,
        *,
        site_id: UUID,
        page_id: UUID,
        payload: ContentPagePublishIn,
        actor_user_id: UUID | None,
    ) -> ContentPagePublishOut:
        if not self.settings.database.enabled:
            raise Conflict("Site pages require database storage", error="PAGES_DB_REQUIRED")

        workspace_id = await self._resolve_workspace_id_for_site(site_id=site_id)
        entry = await self._get_page_entry(workspace_id=workspace_id, site_id=site_id, entry_id=page_id)

        _, revision = await self.repo.publish_entry(
            workspace_id=workspace_id,
            site_id=site_id,
            entry_id=page_id,
            revision=payload.revision,
            actor_user_id=actor_user_id,
        )
        return ContentPagePublishOut(
            site_id=site_id,
            page_id=page_id,
            path=(str(entry.path) if isinstance(entry.path, str) else "/"),
            revision=revision,
            published_at_ms=self._now_ms(),
        )

    async def unpublish_page(
        self: PagesServiceProtocol,
        *,
        site_id: UUID,
        page_id: UUID,
        actor_user_id: UUID | None,
    ) -> ContentPageUnpublishOut:
        if not self.settings.database.enabled:
            raise Conflict("Site pages require database storage", error="PAGES_DB_REQUIRED")

        workspace_id = await self._resolve_workspace_id_for_site(site_id=site_id)
        entry = await self._get_page_entry(workspace_id=workspace_id, site_id=site_id, entry_id=page_id)

        await self.repo.unpublish_entry(
            workspace_id=workspace_id,
            site_id=site_id,
            entry_id=page_id,
            actor_user_id=actor_user_id,
        )
        return ContentPageUnpublishOut(
            site_id=site_id,
            page_id=page_id,
            path=(str(entry.path) if isinstance(entry.path, str) else "/"),
            unpublished_at_ms=self._now_ms(),
        )

    async def rollback_page_revision(
        self: PagesServiceProtocol,
        *,
        site_id: UUID,
        page_id: UUID,
        payload: ContentPageRollbackIn,
        actor_user_id: UUID | None,
    ) -> ContentPageRollbackOut:
        if not self.settings.database.enabled:
            raise Conflict("Site pages require database storage", error="PAGES_DB_REQUIRED")

        workspace_id = await self._resolve_workspace_id_for_site(site_id=site_id)
        entry = await self._get_page_entry(workspace_id=workspace_id, site_id=site_id, entry_id=page_id)

        from_revision, to_revision = await self.repo.rollback_entry_revision(
            workspace_id=workspace_id,
            site_id=site_id,
            entry_id=page_id,
            target=payload.target,
            revision=payload.revision,
            actor_user_id=actor_user_id,
        )

        return ContentPageRollbackOut(
            page_id=page_id,
            target=payload.target,
            from_revision=from_revision,
            to_revision=to_revision,
            rolled_back_at_ms=self._now_ms(),
        )
