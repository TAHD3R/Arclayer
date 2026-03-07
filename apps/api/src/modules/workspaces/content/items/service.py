from __future__ import annotations

from typing import TYPE_CHECKING, Any, Literal, Protocol, cast
from uuid import UUID

from apps.api.src.common.protocols.tortoise import HasSiteId, HasWorkspaceId
from apps.api.src.core.exceptions import NotFound
from apps.api.src.core.http.pagination import PageData, PageParams, paginate_items
from apps.api.src.modules.workspaces.content.contracts.schema import (
    ContentItemOut,
    ContentPresentationOut,
    ContentVersionOut,
)

if TYPE_CHECKING:
    from apps.api.src.modules.workspaces.content.repository import WorkspaceContentRepository


class _TypeRecordView(Protocol):
    code: str


class _EntryRecordView(HasWorkspaceId, HasSiteId, Protocol):
    id: UUID | str
    type_id: UUID | str
    slug: str
    title: str | None
    status: str
    visibility: str
    locale: str
    draft_revision: int
    published_revision: int | None
    updated_at: object
    type: object | None


class _RevisionRecordView(Protocol):
    revision: int
    snapshot: object
    created_at: object
    created_by_user_id: UUID | None


def _normalize_item_status(value: str) -> Literal["draft", "published", "archived"]:
    if value in {"draft", "published", "archived"}:
        return cast(Literal["draft", "published", "archived"], value)
    return "draft"


def _normalize_item_visibility(value: str) -> Literal["public", "private"]:
    if value in {"public", "private"}:
        return cast(Literal["public", "private"], value)
    return "public"


def _read_model_key(record_type: object | None) -> str:
    if record_type is None:
        return ""
    view = cast(_TypeRecordView, record_type)
    return str(view.code)


def to_content_item_out(record: object) -> ContentItemOut:
    view = cast(_EntryRecordView, record)
    return ContentItemOut(
        id=UUID(str(view.id)),
        workspace_id=UUID(str(view.workspace_id)),
        site_id=UUID(str(view.site_id)),
        model_id=UUID(str(view.type_id)),
        model_key=_read_model_key(view.type),
        slug=str(view.slug),
        title=view.title,
        status=_normalize_item_status(str(view.status)),
        visibility=_normalize_item_visibility(str(view.visibility)),
        locale=str(view.locale),
        draft_version=int(view.draft_revision or 0),
        published_version=(int(view.published_revision) if view.published_revision is not None else None),
        updated_at=cast(Any, view.updated_at),
    )


def _snapshot_dict(snapshot: object) -> dict[str, Any]:
    if isinstance(snapshot, dict):
        return cast(dict[str, Any], snapshot)
    return {}


def _snapshot_payload(snapshot: dict[str, Any], *keys: str) -> dict[str, Any] | None:
    for key in keys:
        value = snapshot.get(key)
        if isinstance(value, dict):
            return cast(dict[str, Any], value)
    return None


def _build_presentations(snapshot: dict[str, Any]) -> list[ContentPresentationOut]:
    presentations: list[ContentPresentationOut] = []

    field_values = _snapshot_payload(snapshot, "field_values", "fieldValues")
    if field_values is not None:
        presentations.append(ContentPresentationOut(kind="form_data", payload=field_values))

    page_blueprint = _snapshot_payload(snapshot, "page_blueprint", "pageBlueprint")
    if page_blueprint is not None:
        presentations.append(ContentPresentationOut(kind="visual_blueprint", payload=page_blueprint))

    rich_text_document = _snapshot_payload(snapshot, "rich_text_document", "richTextDocument")
    if rich_text_document is not None:
        presentations.append(ContentPresentationOut(kind="rich_text_document", payload=rich_text_document))

    meta = _snapshot_payload(snapshot, "meta")
    if meta is None:
        return presentations

    seo_payload = _snapshot_payload(meta, "seo")
    if seo_payload is not None:
        presentations.append(ContentPresentationOut(kind="seo", payload=seo_payload))

    query_definition = _snapshot_payload(meta, "query_definition", "queryDefinition")
    if query_definition is not None:
        presentations.append(ContentPresentationOut(kind="query_definition", payload=query_definition))

    slot_mapping = _snapshot_payload(meta, "slot_mapping", "slotMapping")
    if slot_mapping is not None:
        presentations.append(ContentPresentationOut(kind="slot_mapping", payload=slot_mapping))

    return presentations


def _read_fields_snapshot(snapshot: dict[str, Any]) -> dict[str, Any]:
    field_values = _snapshot_payload(snapshot, "field_values", "fieldValues")
    if field_values is None:
        return {}
    return field_values


def _read_change_summary(snapshot: dict[str, Any]) -> str | None:
    meta = _snapshot_payload(snapshot, "meta")
    if meta is None:
        return None
    value = meta.get("change_summary") if "change_summary" in meta else meta.get("changeSummary")
    if not isinstance(value, str):
        return None
    summary = value.strip()
    return summary or None


class WorkspaceContentItemsMixin:
    if TYPE_CHECKING:
        repo: WorkspaceContentRepository

        @staticmethod
        def _validate_type_code(code: str) -> str: ...

    async def list_items_paginated(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        params: PageParams,
        model_key: str | None,
    ) -> PageData[ContentItemOut]:
        type_id: UUID | None = None
        if model_key is not None:
            code = self._validate_type_code(model_key)
            type_record = await self.repo.get_type_by_code(workspace_id=workspace_id, site_id=site_id, code=code)
            if type_record is None:
                raise NotFound("Content model not found", error="CONTENT_MODEL_NOT_FOUND")
            type_id = UUID(str(type_record.id))

        entries = await self.repo.list_entries(workspace_id=workspace_id, site_id=site_id, type_id=type_id)
        rows = [to_content_item_out(record) for record in entries]
        return paginate_items(rows, params=params)

    async def get_item(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        item_id: UUID,
    ) -> ContentItemOut:
        record = await self.repo.get_entry_by_id(workspace_id=workspace_id, site_id=site_id, entry_id=item_id)
        if record is None:
            raise NotFound("Content item not found", error="CONTENT_ITEM_NOT_FOUND")
        return to_content_item_out(record)

    async def get_item_version(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        item_id: UUID,
        state: Literal["draft", "published"],
    ) -> ContentVersionOut:
        entry = await self.repo.get_entry_by_id(workspace_id=workspace_id, site_id=site_id, entry_id=item_id)
        if entry is None:
            raise NotFound("Content item not found", error="CONTENT_ITEM_NOT_FOUND")

        if state == "published":
            revision_number = entry.published_revision
            if revision_number is None:
                raise NotFound("Published version not found", error="CONTENT_ITEM_PUBLISHED_NOT_FOUND")
        else:
            revision_number = int(entry.draft_revision or 0)
            if revision_number < 1:
                raise NotFound("Draft version not found", error="CONTENT_ITEM_DRAFT_NOT_FOUND")

        revision = await self.repo.get_revision_by_number(entry_id=item_id, revision=int(revision_number))
        if revision is None:
            raise NotFound("Content version not found", error="CONTENT_ITEM_VERSION_NOT_FOUND")

        revision_view = cast(_RevisionRecordView, revision)
        snapshot = _snapshot_dict(revision_view.snapshot)

        return ContentVersionOut(
            item_id=item_id,
            version_number=int(revision_view.revision),
            state=state,
            created_at=cast(Any, revision_view.created_at),
            created_by_user_id=revision_view.created_by_user_id,
            fields_snapshot=_read_fields_snapshot(snapshot),
            presentations=_build_presentations(snapshot),
            change_summary=_read_change_summary(snapshot),
        )
