from __future__ import annotations

from typing import Any, cast
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


class WorkspaceContentRepository(BaseRepository):
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
        return await qs.prefetch_related("type").order_by("sort_order", "path").all()

    async def get_page_entry_by_path(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        path: str,
        conn: BaseDBAsyncClient | None = None,
    ) -> ContentEntryRecord | None:
        qs = ContentEntryRecord.filter(workspace_id=workspace_id, site_id=site_id, type__kind="page", path=path)
        return await self.using_db(qs, conn).prefetch_related("type").first()

    async def has_page_children(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        parent_entry_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> bool:
        qs = ContentEntryRecord.filter(
            workspace_id=workspace_id,
            site_id=site_id,
            type__kind="page",
            parent_entry_id=parent_entry_id,
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
        try:
            return await ContentEntryRecord.create(
                workspace_id=workspace_id,
                site_id=site_id,
                type_id=type_id,
                slug=slug,
                title=title,
                status="draft",
                visibility=visibility,
                locale=locale,
                path=path,
                parent_entry_id=parent_entry_id,
                sort_order=int(sort_order or 0),
                field_values=None,
                page_blueprint=None,
                draft_revision=0,
                published_revision=None,
                created_by_user_id=created_by_user_id,
                updated_by_user_id=created_by_user_id,
            )
        except IntegrityError:
            raise Conflict("Content entry already exists", error="CONTENT_ENTRY_CONFLICT") from None

    async def update_entry(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        entry_id: UUID,
        fields: dict[str, Any],
        updated_by_user_id: UUID | None,
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

            for key, value in fields.items():
                setattr(rec, key, value)
            cast(ContentEntryMutableFields, rec).updated_by_user_id = updated_by_user_id

            update_fields = list(fields.keys()) + ["updated_by_user_id"] if fields else ["updated_by_user_id"]
            try:
                await rec.save(update_fields=update_fields, using_db=conn)
            except IntegrityError:
                raise Conflict("Content entry slug already exists", error="CONTENT_ENTRY_SLUG_CONFLICT") from None

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

            rec.page_blueprint = page_blueprint
            rec.field_values = field_values
            rec.draft_revision = next_revision
            cast(ContentEntryMutableFields, rec).updated_by_user_id = actor_user_id
            rec.status = "published" if rec.published_revision is not None else "draft"
            await rec.save(
                update_fields=[
                    "page_blueprint",
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
