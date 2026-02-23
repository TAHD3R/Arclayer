from __future__ import annotations

import time
from uuid import UUID

from apps.api.common.services.base import BaseService
from apps.api.core.exceptions import Conflict, NotFound
from apps.api.core.http.pagination import PageData, PageParams, paginate_items
from apps.api.modules.sites.utils import validate_entry_type_code
from apps.api.modules.workspaces.content.repository import WorkspaceContentRepository
from apps.api.modules.workspaces.content.schema import (
    ContentEntryCreateIn,
    ContentEntryDeleteOut,
    ContentEntryDraftSaveIn,
    ContentEntryDraftSaveOut,
    ContentEntryOut,
    ContentEntryPublishIn,
    ContentEntryPublishOut,
    ContentEntryRevisionOut,
    ContentEntryRollbackIn,
    ContentEntryRollbackOut,
    ContentEntryUnpublishOut,
    ContentEntryUpdateIn,
    ContentTypeCreateIn,
    ContentTypeDeleteOut,
    ContentTypeOut,
    ContentTypeUpdateIn,
)


class WorkspaceContentService(BaseService):
    def __init__(self, settings) -> None:
        super().__init__(settings)
        self.repo = WorkspaceContentRepository()

    @staticmethod
    def _validate_slug(slug: str) -> str:
        value = (slug or "").strip()
        if not value or "/" in value:
            raise Conflict("Invalid entry slug", error="CONTENT_ENTRY_SLUG_INVALID")
        return value

    @staticmethod
    def _to_type_out(record) -> ContentTypeOut:
        return ContentTypeOut(
            id=record.id,
            workspace_id=record.workspace_id,
            site_id=record.site_id,
            code=record.code,
            name=record.name,
            kind=record.kind,
            field_schema=record.field_schema,
            editor_schema=record.editor_schema,
            render_contract=record.render_contract,
            workflow_policy=record.workflow_policy,
        )

    @staticmethod
    def _to_entry_out(record) -> ContentEntryOut:
        type_code = ""
        if getattr(record, "type", None) is not None:
            type_code = str(record.type.code)

        return ContentEntryOut(
            id=record.id,
            workspace_id=record.workspace_id,
            site_id=record.site_id,
            type_id=record.type_id,
            type_code=type_code,
            slug=record.slug,
            title=record.title,
            status=record.status,
            visibility=record.visibility,
            locale=record.locale,
            draft_revision=int(record.draft_revision or 0),
            published_revision=(int(record.published_revision) if record.published_revision is not None else None),
            updated_at=record.updated_at,
        )

    async def list_types_paginated(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        params: PageParams,
    ) -> PageData[ContentTypeOut]:
        records = await self.repo.list_types(workspace_id=workspace_id, site_id=site_id)
        rows = [self._to_type_out(record) for record in records]
        return paginate_items(rows, params=params)

    async def create_type(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        payload: ContentTypeCreateIn,
    ) -> ContentTypeOut:
        code = validate_entry_type_code(payload.code)
        name = (payload.name or "").strip()
        if not name:
            raise Conflict("Invalid content type name", error="CONTENT_TYPE_NAME_INVALID")

        record = await self.repo.create_type(
            workspace_id=workspace_id,
            site_id=site_id,
            code=code,
            name=name,
            kind=payload.kind,
            field_schema=payload.field_schema,
            editor_schema=payload.editor_schema,
            render_contract=payload.render_contract,
            workflow_policy=payload.workflow_policy,
        )
        return self._to_type_out(record)

    async def update_type(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        type_id: UUID,
        payload: ContentTypeUpdateIn,
    ) -> ContentTypeOut:
        fields_set = payload.model_fields_set
        fields: dict[str, object] = {}

        if "name" in fields_set and payload.name is not None:
            name = payload.name.strip()
            if not name:
                raise Conflict("Invalid content type name", error="CONTENT_TYPE_NAME_INVALID")
            fields["name"] = name
        if "kind" in fields_set and payload.kind is not None:
            fields["kind"] = payload.kind
        if "field_schema" in fields_set:
            fields["field_schema"] = payload.field_schema
        if "editor_schema" in fields_set:
            fields["editor_schema"] = payload.editor_schema
        if "render_contract" in fields_set:
            fields["render_contract"] = payload.render_contract
        if "workflow_policy" in fields_set:
            fields["workflow_policy"] = payload.workflow_policy

        updated = await self.repo.update_type(
            workspace_id=workspace_id,
            site_id=site_id,
            type_id=type_id,
            fields=fields,
        )
        return self._to_type_out(updated)

    async def delete_type(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        type_id: UUID,
    ) -> ContentTypeDeleteOut:
        await self.repo.delete_type(workspace_id=workspace_id, site_id=site_id, type_id=type_id)
        return ContentTypeDeleteOut(type_id=type_id)

    async def list_entries_paginated(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        params: PageParams,
        type_code: str | None,
    ) -> PageData[ContentEntryOut]:
        type_id: UUID | None = None
        if type_code is not None:
            code = validate_entry_type_code(type_code)
            type_record = await self.repo.get_type_by_code(workspace_id=workspace_id, site_id=site_id, code=code)
            if type_record is None:
                raise NotFound("Content type not found", error="CONTENT_TYPE_NOT_FOUND")
            type_id = UUID(str(type_record.id))

        entries = await self.repo.list_entries(workspace_id=workspace_id, site_id=site_id, type_id=type_id)
        rows = [self._to_entry_out(record) for record in entries]
        return paginate_items(rows, params=params)

    async def create_entry(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        payload: ContentEntryCreateIn,
        actor_user_id: UUID | None,
    ) -> ContentEntryOut:
        type_code = validate_entry_type_code(payload.type_code)
        slug = self._validate_slug(payload.slug)

        type_record = await self.repo.get_type_by_code(workspace_id=workspace_id, site_id=site_id, code=type_code)
        if type_record is None:
            raise NotFound("Content type not found", error="CONTENT_TYPE_NOT_FOUND")

        title = payload.title.strip() if isinstance(payload.title, str) and payload.title.strip() else None

        record = await self.repo.create_entry(
            workspace_id=workspace_id,
            site_id=site_id,
            type_id=UUID(str(type_record.id)),
            slug=slug,
            title=title,
            visibility=payload.visibility,
            locale=payload.locale,
            created_by_user_id=actor_user_id,
        )
        hydrated = await self.repo.get_entry_by_id(
            workspace_id=workspace_id,
            site_id=site_id,
            entry_id=UUID(str(record.id)),
        )
        if hydrated is None:
            raise NotFound("Content entry not found", error="CONTENT_ENTRY_NOT_FOUND")
        return self._to_entry_out(hydrated)

    async def get_entry(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        entry_id: UUID,
    ) -> ContentEntryOut:
        record = await self.repo.get_entry_by_id(workspace_id=workspace_id, site_id=site_id, entry_id=entry_id)
        if record is None:
            raise NotFound("Content entry not found", error="CONTENT_ENTRY_NOT_FOUND")
        return self._to_entry_out(record)

    async def update_entry(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        entry_id: UUID,
        payload: ContentEntryUpdateIn,
        actor_user_id: UUID | None,
    ) -> ContentEntryOut:
        fields_set = payload.model_fields_set
        fields: dict[str, object] = {}

        if "slug" in fields_set and payload.slug is not None:
            fields["slug"] = self._validate_slug(payload.slug)
        if "title" in fields_set:
            if payload.title is None:
                fields["title"] = None
            else:
                title = payload.title.strip()
                fields["title"] = title or None
        if "visibility" in fields_set and payload.visibility is not None:
            fields["visibility"] = payload.visibility
        if "locale" in fields_set and payload.locale is not None:
            fields["locale"] = payload.locale

        updated = await self.repo.update_entry(
            workspace_id=workspace_id,
            site_id=site_id,
            entry_id=entry_id,
            fields=fields,
            updated_by_user_id=actor_user_id,
        )
        return self._to_entry_out(updated)

    async def delete_entry(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        entry_id: UUID,
    ) -> ContentEntryDeleteOut:
        await self.repo.delete_entry(workspace_id=workspace_id, site_id=site_id, entry_id=entry_id)
        return ContentEntryDeleteOut(entry_id=entry_id)

    async def save_entry_draft(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        entry_id: UUID,
        payload: ContentEntryDraftSaveIn,
        actor_user_id: UUID | None,
    ) -> ContentEntryDraftSaveOut:
        _, revision = await self.repo.save_entry_draft(
            workspace_id=workspace_id,
            site_id=site_id,
            entry_id=entry_id,
            document_ir=payload.document_ir,
            field_values=payload.field_values,
            meta=payload.meta,
            expected_revision=payload.expected_revision,
            actor_user_id=actor_user_id,
        )
        return ContentEntryDraftSaveOut(
            entry_id=entry_id,
            revision=revision.revision,
            saved_at_ms=int(time.time() * 1000),
        )

    async def publish_entry(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        entry_id: UUID,
        payload: ContentEntryPublishIn,
        actor_user_id: UUID | None,
    ) -> ContentEntryPublishOut:
        _, revision = await self.repo.publish_entry(
            workspace_id=workspace_id,
            site_id=site_id,
            entry_id=entry_id,
            revision=payload.revision,
            actor_user_id=actor_user_id,
        )
        return ContentEntryPublishOut(
            entry_id=entry_id,
            revision=revision,
            published_at_ms=int(time.time() * 1000),
        )

    async def unpublish_entry(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        entry_id: UUID,
        actor_user_id: UUID | None,
    ) -> ContentEntryUnpublishOut:
        await self.repo.unpublish_entry(
            workspace_id=workspace_id,
            site_id=site_id,
            entry_id=entry_id,
            actor_user_id=actor_user_id,
        )
        return ContentEntryUnpublishOut(
            entry_id=entry_id,
            unpublished_at_ms=int(time.time() * 1000),
        )

    async def get_entry_revision(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        entry_id: UUID,
        state: str,
    ) -> ContentEntryRevisionOut:
        entry = await self.repo.get_entry_by_id(workspace_id=workspace_id, site_id=site_id, entry_id=entry_id)
        if entry is None:
            raise NotFound("Content entry not found", error="CONTENT_ENTRY_NOT_FOUND")

        if state == "published":
            revision_number = entry.published_revision
            if revision_number is None:
                raise NotFound("Published revision not found", error="CONTENT_ENTRY_PUBLISHED_NOT_FOUND")
        else:
            revision_number = int(entry.draft_revision or 0)
            if revision_number < 1:
                raise NotFound("Draft revision not found", error="CONTENT_ENTRY_DRAFT_NOT_FOUND")

        revision = await self.repo.get_revision_by_number(entry_id=entry_id, revision=int(revision_number))
        if revision is None:
            raise NotFound("Revision not found", error="CONTENT_ENTRY_REVISION_NOT_FOUND")

        created_at_ms = int(revision.created_at.timestamp() * 1000)
        return ContentEntryRevisionOut(
            entry_id=entry_id,
            state=state,
            revision=revision.revision,
            created_at_ms=created_at_ms,
            snapshot=revision.snapshot,
        )

    async def rollback_entry_revision(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        entry_id: UUID,
        payload: ContentEntryRollbackIn,
        actor_user_id: UUID | None,
    ) -> ContentEntryRollbackOut:
        from_revision, to_revision = await self.repo.rollback_entry_revision(
            workspace_id=workspace_id,
            site_id=site_id,
            entry_id=entry_id,
            target=payload.target,
            revision=payload.revision,
            actor_user_id=actor_user_id,
        )
        return ContentEntryRollbackOut(
            entry_id=entry_id,
            target=payload.target,
            from_revision=from_revision,
            to_revision=to_revision,
            rolled_back_at_ms=int(time.time() * 1000),
        )
