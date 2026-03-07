from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Final, cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.exceptions import IntegrityError
from tortoise.transactions import in_transaction

from apps.api.src.common.protocols.tortoise import ContentEntryMutableFields
from apps.api.src.common.repositories.base import BaseRepository
from apps.api.src.core.exceptions import Conflict, NotFound
from apps.api.src.models.content.content import (
    ContentEntryRecord,
    ContentRevisionRecord,
    ContentTypeRecord,
)
from apps.api.src.models.content.route import ContentRouteRecord
from apps.api.src.models.content.tree import ContentTreeNodeRecord

ROUTE_TREE_ENTRY_FIELD_NAMES: Final = frozenset({"path", "parent_entry_id", "sort_order"})


@dataclass(frozen=True)
class _EntryRouteTreePatch:
    path_requested: bool
    path: str | None
    parent_requested: bool
    parent_entry_id: UUID | None
    sort_requested: bool
    sort_order: int | None

    def any_requested(self) -> bool:
        return self.path_requested or self.parent_requested or self.sort_requested


class WorkspaceContentRepository(BaseRepository):
    @staticmethod
    def _normalize_optional_path(value: object) -> str | None:
        if not isinstance(value, str):
            return None
        normalized = value.strip()
        return normalized or None

    def _split_entry_update_fields(
        self,
        *,
        fields: dict[str, Any],
    ) -> tuple[dict[str, Any], _EntryRouteTreePatch]:
        entry_fields = {key: value for key, value in fields.items() if key not in ROUTE_TREE_ENTRY_FIELD_NAMES}
        patch = _EntryRouteTreePatch(
            path_requested=("path" in fields),
            path=(self._normalize_optional_path(fields.get("path")) if "path" in fields else None),
            parent_requested=("parent_entry_id" in fields),
            parent_entry_id=(
                (UUID(str(fields.get("parent_entry_id"))) if fields.get("parent_entry_id") is not None else None)
                if "parent_entry_id" in fields
                else None
            ),
            sort_requested=("sort_order" in fields),
            sort_order=((int(fields.get("sort_order") or 0)) if "sort_order" in fields else None),
        )
        return entry_fields, patch

    async def _load_active_route_record(
        self,
        *,
        conn: BaseDBAsyncClient,
        site_id: UUID,
        entry_id: UUID,
        preferred_locale: str,
    ) -> ContentRouteRecord | None:
        base_qs = (
            ContentRouteRecord
            .filter(site_id=site_id, entry_id=entry_id, is_active=True)
            .using_db(conn)
            .order_by("created_at", "id")
        )
        route = await base_qs.filter(locale=str(preferred_locale)).first()
        if route is not None:
            return route
        return await base_qs.first()

    async def _load_tree_meta(
        self,
        *,
        conn: BaseDBAsyncClient,
        site_id: UUID,
        entry_id: UUID,
    ) -> tuple[UUID | None, int]:
        tree = await (
            ContentTreeNodeRecord
            .filter(site_id=site_id, entry_id=entry_id)
            .using_db(conn)
            .order_by("created_at", "id")
            .first()
        )
        if tree is None:
            return None, 0

        parent_raw = getattr(tree, "parent_entry_id", None)
        parent_id = UUID(str(parent_raw)) if parent_raw is not None else None
        sort_order = int(getattr(tree, "sort_order", 0) or 0)
        return parent_id, sort_order

    async def _resolve_route_and_next_path_for_patch(
        self,
        *,
        conn: BaseDBAsyncClient,
        site_id: UUID,
        entry_id: UUID,
        previous_locale: str,
        patch: _EntryRouteTreePatch,
        locale_changed: bool,
    ) -> tuple[ContentRouteRecord | None, str | None]:
        should_load_route = (not patch.path_requested) and (patch.any_requested() or locale_changed)
        if not should_load_route:
            return None, patch.path

        route = await self._load_active_route_record(
            conn=conn,
            site_id=site_id,
            entry_id=entry_id,
            preferred_locale=previous_locale,
        )
        next_path = str(route.path) if route is not None else None
        return route, next_path

    async def _sync_route_for_patch(
        self,
        *,
        conn: BaseDBAsyncClient,
        workspace_id: UUID,
        site_id: UUID,
        entry_id: UUID,
        previous_locale: str,
        locale: str,
        patch: _EntryRouteTreePatch,
        route: ContentRouteRecord | None,
        next_path: str | None,
    ) -> None:
        locale_changed = previous_locale != locale
        if not (patch.path_requested or (locale_changed and route is not None)):
            return

        await self._sync_route_record(
            conn=conn,
            workspace_id=workspace_id,
            site_id=site_id,
            entry_id=entry_id,
            locale=locale,
            path=next_path,
            previous_locale=previous_locale,
        )

    async def _sync_tree_for_patch(
        self,
        *,
        conn: BaseDBAsyncClient,
        workspace_id: UUID,
        site_id: UUID,
        entry_id: UUID,
        patch: _EntryRouteTreePatch,
        next_path: str | None,
    ) -> None:
        if not (patch.path_requested or patch.parent_requested or patch.sort_requested):
            return

        if next_path is None:
            if patch.parent_requested or patch.sort_requested:
                raise Conflict("Tree updates require active route", error="CONTENT_TREE_ROUTE_REQUIRED")
            await self._sync_tree_node_record(
                conn=conn,
                workspace_id=workspace_id,
                site_id=site_id,
                entry_id=entry_id,
                parent_entry_id=None,
                sort_order=0,
                enabled=False,
            )
            return

        current_parent_id, current_sort_order = await self._load_tree_meta(
            conn=conn,
            site_id=site_id,
            entry_id=entry_id,
        )
        parent_entry_id = patch.parent_entry_id if patch.parent_requested else current_parent_id
        sort_order = (
            int(patch.sort_order) if patch.sort_requested and patch.sort_order is not None else current_sort_order
        )
        await self._sync_tree_node_record(
            conn=conn,
            workspace_id=workspace_id,
            site_id=site_id,
            entry_id=entry_id,
            parent_entry_id=parent_entry_id,
            sort_order=sort_order,
            enabled=True,
        )

    async def _apply_route_tree_patch_for_entry_update(
        self,
        *,
        conn: BaseDBAsyncClient,
        workspace_id: UUID,
        site_id: UUID,
        entry_id: UUID,
        previous_locale: str,
        locale: str,
        patch: _EntryRouteTreePatch,
    ) -> None:
        locale_changed = previous_locale != locale
        route, next_path = await self._resolve_route_and_next_path_for_patch(
            conn=conn,
            site_id=site_id,
            entry_id=entry_id,
            previous_locale=previous_locale,
            patch=patch,
            locale_changed=locale_changed,
        )
        await self._sync_route_for_patch(
            conn=conn,
            workspace_id=workspace_id,
            site_id=site_id,
            entry_id=entry_id,
            previous_locale=previous_locale,
            locale=locale,
            patch=patch,
            route=route,
            next_path=next_path,
        )
        await self._sync_tree_for_patch(
            conn=conn,
            workspace_id=workspace_id,
            site_id=site_id,
            entry_id=entry_id,
            patch=patch,
            next_path=next_path,
        )

    async def _sync_route_record(
        self,
        *,
        conn: BaseDBAsyncClient,
        workspace_id: UUID,
        site_id: UUID,
        entry_id: UUID,
        locale: str,
        path: str | None,
        previous_locale: str | None = None,
    ) -> None:
        locales_to_clear = {str(locale)}
        if previous_locale is not None and previous_locale != locale:
            locales_to_clear.add(str(previous_locale))
        await ContentRouteRecord.filter(entry_id=entry_id, locale__in=list(locales_to_clear)).using_db(conn).delete()
        if path is None:
            return
        try:
            await ContentRouteRecord.create(
                workspace_id=workspace_id,
                site_id=site_id,
                entry_id=entry_id,
                locale=locale,
                path=path,
                is_active=True,
                using_db=conn,
            )
        except IntegrityError:
            raise Conflict("Content route conflict", error="CONTENT_ROUTE_CONFLICT") from None

    async def _sync_tree_node_record(
        self,
        *,
        conn: BaseDBAsyncClient,
        workspace_id: UUID,
        site_id: UUID,
        entry_id: UUID,
        parent_entry_id: UUID | None,
        sort_order: int,
        enabled: bool,
    ) -> None:
        if not enabled:
            await ContentTreeNodeRecord.filter(entry_id=entry_id).using_db(conn).delete()
            return

        rec = await ContentTreeNodeRecord.filter(entry_id=entry_id).using_db(conn).select_for_update().first()
        if rec is None:
            try:
                await ContentTreeNodeRecord.create(
                    workspace_id=workspace_id,
                    site_id=site_id,
                    entry_id=entry_id,
                    parent_entry_id=parent_entry_id,
                    sort_order=int(sort_order or 0),
                    using_db=conn,
                )
            except IntegrityError:
                raise Conflict("Content tree node conflict", error="CONTENT_TREE_NODE_CONFLICT") from None
            return

        rec.parent_entry_id = parent_entry_id
        rec.sort_order = int(sort_order or 0)
        await rec.save(update_fields=["parent_entry_id", "sort_order"], using_db=conn)

    async def list_types(self, *, workspace_id: UUID, site_id: UUID) -> list[ContentTypeRecord]:
        return await ContentTypeRecord.filter(workspace_id=workspace_id, site_id=site_id).order_by("code").all()

    async def get_type_by_id(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        type_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> ContentTypeRecord | None:
        qs = ContentTypeRecord.filter(id=type_id, workspace_id=workspace_id, site_id=site_id)
        return await self.using_db(qs, conn).first()

    async def get_type_by_code(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        code: str,
        conn: BaseDBAsyncClient | None = None,
    ) -> ContentTypeRecord | None:
        qs = ContentTypeRecord.filter(workspace_id=workspace_id, site_id=site_id, code=code)
        return await self.using_db(qs, conn).first()

    async def get_type_by_kind(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        kind: str,
        conn: BaseDBAsyncClient | None = None,
    ) -> ContentTypeRecord | None:
        qs = ContentTypeRecord.filter(workspace_id=workspace_id, site_id=site_id, kind=kind)
        return await self.using_db(qs, conn).first()

    async def create_type(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        code: str,
        name: str,
        kind: str,
        field_schema: dict[str, object] | None,
        editor_schema: dict[str, object] | None,
        render_contract: dict[str, object] | None,
        workflow_policy: dict[str, object] | None,
    ) -> ContentTypeRecord:
        try:
            return await ContentTypeRecord.create(
                workspace_id=workspace_id,
                site_id=site_id,
                code=code,
                name=name,
                kind=kind,
                field_schema=field_schema,
                editor_schema=editor_schema,
                render_contract=render_contract,
                workflow_policy=workflow_policy,
            )
        except IntegrityError:
            raise Conflict("Content type already exists", error="CONTENT_TYPE_CONFLICT") from None

    async def update_type(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        type_id: UUID,
        fields: dict[str, object],
    ) -> ContentTypeRecord:
        async with in_transaction() as conn:
            rec = (
                await ContentTypeRecord
                .filter(id=type_id, workspace_id=workspace_id, site_id=site_id)
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if rec is None:
                raise NotFound("Content type not found", error="CONTENT_TYPE_NOT_FOUND")
            for key, value in fields.items():
                setattr(rec, key, value)
            if fields:
                await rec.save(update_fields=list(fields.keys()), using_db=conn)
            return rec

    async def delete_type(self, *, workspace_id: UUID, site_id: UUID, type_id: UUID) -> None:
        in_use = await ContentEntryRecord.filter(
            workspace_id=workspace_id,
            site_id=site_id,
            type_id=type_id,
        ).exists()
        if in_use:
            raise Conflict("Content type is in use", error="CONTENT_TYPE_IN_USE")

        deleted = await ContentTypeRecord.filter(
            id=type_id,
            workspace_id=workspace_id,
            site_id=site_id,
        ).delete()
        if not deleted:
            raise NotFound("Content type not found", error="CONTENT_TYPE_NOT_FOUND")

    async def list_entries(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        type_id: UUID | None = None,
    ) -> list[ContentEntryRecord]:
        qs = ContentEntryRecord.filter(workspace_id=workspace_id, site_id=site_id)
        if type_id is not None:
            qs = qs.filter(type_id=type_id)
        return await qs.prefetch_related("type").order_by("updated_at", "slug").all()

    async def list_page_entries(self, *, workspace_id: UUID, site_id: UUID) -> list[ContentEntryRecord]:
        qs = ContentEntryRecord.filter(workspace_id=workspace_id, site_id=site_id, type__kind="page")
        return await qs.prefetch_related("type").order_by("updated_at", "id").all()

    async def get_page_entry_by_path(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        path: str,
        conn: BaseDBAsyncClient | None = None,
    ) -> ContentEntryRecord | None:
        route_qs = ContentRouteRecord.filter(
            workspace_id=workspace_id,
            site_id=site_id,
            path=path,
            is_active=True,
        )
        route = await self.using_db(route_qs, conn).order_by("created_at", "id").first()
        if route is None:
            return None
        entry_qs = ContentEntryRecord.filter(
            id=UUID(str(route.entry_id)),
            workspace_id=workspace_id,
            site_id=site_id,
            type__kind="page",
        )
        return await self.using_db(entry_qs, conn).prefetch_related("type").first()

    async def has_page_children(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        parent_entry_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> bool:
        qs = ContentTreeNodeRecord.filter(
            workspace_id=workspace_id,
            site_id=site_id,
            parent_entry_id=parent_entry_id,
            entry__type__kind="page",
        )
        return await self.using_db(qs, conn).exists()

    async def get_entry_by_id(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        entry_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> ContentEntryRecord | None:
        qs = ContentEntryRecord.filter(id=entry_id, workspace_id=workspace_id, site_id=site_id).prefetch_related("type")
        return await self.using_db(qs, conn).first()

    async def create_entry(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        type_id: UUID,
        slug: str,
        title: str | None,
        visibility: str,
        locale: str,
        path: str | None = None,
        parent_entry_id: UUID | None = None,
        sort_order: int = 0,
        created_by_user_id: UUID | None,
    ) -> ContentEntryRecord:
        async with in_transaction() as conn:
            try:
                rec = await ContentEntryRecord.create(
                    workspace_id=workspace_id,
                    site_id=site_id,
                    type_id=type_id,
                    slug=slug,
                    title=title,
                    status="draft",
                    visibility=visibility,
                    locale=locale,
                    field_values=None,
                    draft_revision=0,
                    published_revision=None,
                    created_by_user_id=created_by_user_id,
                    updated_by_user_id=created_by_user_id,
                    using_db=conn,
                )
            except IntegrityError:
                raise Conflict("Content entry already exists", error="CONTENT_ENTRY_CONFLICT") from None

            await self._sync_route_record(
                conn=conn,
                workspace_id=workspace_id,
                site_id=site_id,
                entry_id=UUID(str(rec.id)),
                locale=locale,
                path=path,
            )
            await self._sync_tree_node_record(
                conn=conn,
                workspace_id=workspace_id,
                site_id=site_id,
                entry_id=UUID(str(rec.id)),
                parent_entry_id=parent_entry_id,
                sort_order=int(sort_order or 0),
                enabled=path is not None,
            )

        out = await self.get_entry_by_id(workspace_id=workspace_id, site_id=site_id, entry_id=UUID(str(rec.id)))
        if out is None:
            raise NotFound("Content entry not found", error="CONTENT_ENTRY_NOT_FOUND")
        return out

    async def update_entry(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        entry_id: UUID,
        fields: dict[str, Any],
        updated_by_user_id: UUID | None,
    ) -> ContentEntryRecord:
        entry_fields, patch = self._split_entry_update_fields(fields=fields)

        async with in_transaction() as conn:
            rec = (
                await ContentEntryRecord
                .filter(id=entry_id, workspace_id=workspace_id, site_id=site_id)
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if rec is None:
                raise NotFound("Content entry not found", error="CONTENT_ENTRY_NOT_FOUND")

            previous_locale = str(getattr(rec, "locale", "zh-CN"))

            for key, value in entry_fields.items():
                setattr(rec, key, value)
            cast(ContentEntryMutableFields, rec).updated_by_user_id = updated_by_user_id

            update_fields = (
                list(entry_fields.keys()) + ["updated_by_user_id"] if entry_fields else ["updated_by_user_id"]
            )
            try:
                await rec.save(update_fields=update_fields, using_db=conn)
            except IntegrityError:
                raise Conflict("Content entry slug already exists", error="CONTENT_ENTRY_SLUG_CONFLICT") from None

            await self._apply_route_tree_patch_for_entry_update(
                conn=conn,
                workspace_id=workspace_id,
                site_id=site_id,
                entry_id=UUID(str(rec.id)),
                previous_locale=previous_locale,
                locale=str(getattr(rec, "locale", "zh-CN")),
                patch=patch,
            )

        out = await self.get_entry_by_id(workspace_id=workspace_id, site_id=site_id, entry_id=entry_id)
        if out is None:
            raise NotFound("Content entry not found", error="CONTENT_ENTRY_NOT_FOUND")
        return out

    async def delete_entry(self, *, workspace_id: UUID, site_id: UUID, entry_id: UUID) -> None:
        async with in_transaction() as conn:
            rec = (
                await ContentEntryRecord
                .filter(id=entry_id, workspace_id=workspace_id, site_id=site_id)
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if rec is None:
                raise NotFound("Content entry not found", error="CONTENT_ENTRY_NOT_FOUND")
            if rec.published_revision is not None:
                raise Conflict("Content entry must be unpublished before delete", error="CONTENT_ENTRY_MUST_UNPUBLISH")
            await (
                ContentEntryRecord
                .filter(id=entry_id, workspace_id=workspace_id, site_id=site_id)
                .using_db(conn)
                .delete()
            )

    async def save_entry_draft(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        entry_id: UUID,
        page_blueprint: dict[str, Any] | None,
        field_values: dict[str, Any] | None,
        meta: dict[str, Any] | None,
        expected_revision: int | None,
        actor_user_id: UUID | None,
    ) -> tuple[ContentEntryRecord, ContentRevisionRecord]:
        async with in_transaction() as conn:
            rec = (
                await ContentEntryRecord
                .filter(id=entry_id, workspace_id=workspace_id, site_id=site_id)
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if rec is None:
                raise NotFound("Content entry not found", error="CONTENT_ENTRY_NOT_FOUND")

            current_draft = int(rec.draft_revision or 0)
            if expected_revision is not None and expected_revision != current_draft:
                raise Conflict("Draft revision conflict", error="CONTENT_ENTRY_REVISION_CONFLICT")

            next_revision = current_draft + 1
            snapshot: dict[str, Any] = {
                "page_blueprint": page_blueprint,
                "field_values": field_values,
                "meta": meta,
                "slug": rec.slug,
                "title": rec.title,
                "visibility": rec.visibility,
                "locale": rec.locale,
            }
            revision = await ContentRevisionRecord.create(
                entry_id=rec.id,
                revision=next_revision,
                snapshot=snapshot,
                created_by_user_id=actor_user_id,
                using_db=conn,
            )

            rec.field_values = field_values
            rec.draft_revision = next_revision
            cast(ContentEntryMutableFields, rec).updated_by_user_id = actor_user_id
            rec.status = "published" if rec.published_revision is not None else "draft"
            await rec.save(
                update_fields=[
                    "field_values",
                    "draft_revision",
                    "updated_by_user_id",
                    "status",
                ],
                using_db=conn,
            )

        out = await self.get_entry_by_id(workspace_id=workspace_id, site_id=site_id, entry_id=entry_id)
        if out is None:
            raise NotFound("Content entry not found", error="CONTENT_ENTRY_NOT_FOUND")
        return out, revision

    async def publish_entry(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        entry_id: UUID,
        revision: int | None,
        actor_user_id: UUID | None,
    ) -> tuple[ContentEntryRecord, int]:
        async with in_transaction() as conn:
            rec = (
                await ContentEntryRecord
                .filter(id=entry_id, workspace_id=workspace_id, site_id=site_id)
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if rec is None:
                raise NotFound("Content entry not found", error="CONTENT_ENTRY_NOT_FOUND")

            draft_revision = int(rec.draft_revision or 0)
            if draft_revision < 1:
                raise Conflict("No draft revision to publish", error="CONTENT_ENTRY_DRAFT_NOT_FOUND")

            target = int(revision) if revision is not None else draft_revision
            rev = await ContentRevisionRecord.filter(entry_id=rec.id, revision=target).using_db(conn).first()
            if rev is None:
                raise NotFound("Revision not found", error="CONTENT_ENTRY_REVISION_NOT_FOUND")

            cast(ContentEntryMutableFields, rec).published_revision = target
            rec.status = "published"
            cast(ContentEntryMutableFields, rec).updated_by_user_id = actor_user_id
            await rec.save(update_fields=["published_revision", "status", "updated_by_user_id"], using_db=conn)

        out = await self.get_entry_by_id(workspace_id=workspace_id, site_id=site_id, entry_id=entry_id)
        if out is None:
            raise NotFound("Content entry not found", error="CONTENT_ENTRY_NOT_FOUND")
        return out, target

    async def unpublish_entry(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        entry_id: UUID,
        actor_user_id: UUID | None,
    ) -> ContentEntryRecord:
        async with in_transaction() as conn:
            rec = (
                await ContentEntryRecord
                .filter(id=entry_id, workspace_id=workspace_id, site_id=site_id)
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if rec is None:
                raise NotFound("Content entry not found", error="CONTENT_ENTRY_NOT_FOUND")
            if rec.published_revision is None:
                raise Conflict("Content entry is not published", error="CONTENT_ENTRY_NOT_PUBLISHED")

            cast(ContentEntryMutableFields, rec).published_revision = None
            rec.status = "draft"
            cast(ContentEntryMutableFields, rec).updated_by_user_id = actor_user_id
            await rec.save(update_fields=["published_revision", "status", "updated_by_user_id"], using_db=conn)

        out = await self.get_entry_by_id(workspace_id=workspace_id, site_id=site_id, entry_id=entry_id)
        if out is None:
            raise NotFound("Content entry not found", error="CONTENT_ENTRY_NOT_FOUND")
        return out

    async def get_revision_by_number(self, *, entry_id: UUID, revision: int) -> ContentRevisionRecord | None:
        return await ContentRevisionRecord.get_or_none(entry_id=entry_id, revision=revision)

    async def rollback_entry_revision(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        entry_id: UUID,
        target: str,
        revision: int,
        actor_user_id: UUID | None,
    ) -> tuple[int | None, int]:
        async with in_transaction() as conn:
            rec = (
                await ContentEntryRecord
                .filter(id=entry_id, workspace_id=workspace_id, site_id=site_id)
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if rec is None:
                raise NotFound("Content entry not found", error="CONTENT_ENTRY_NOT_FOUND")

            rev = await ContentRevisionRecord.filter(entry_id=rec.id, revision=revision).using_db(conn).first()
            if rev is None:
                raise NotFound("Revision not found", error="CONTENT_ENTRY_REVISION_NOT_FOUND")

            if target == "published":
                from_revision = rec.published_revision
                cast(ContentEntryMutableFields, rec).published_revision = revision
                rec.status = "published"
                update_fields = ["published_revision", "status", "updated_by_user_id"]
            else:
                from_revision = rec.draft_revision if rec.draft_revision > 0 else None
                rec.draft_revision = revision
                rec.status = "published" if rec.published_revision is not None else "draft"
                update_fields = ["draft_revision", "status", "updated_by_user_id"]

            cast(ContentEntryMutableFields, rec).updated_by_user_id = actor_user_id
            await rec.save(update_fields=update_fields, using_db=conn)

        return from_revision, revision
