from __future__ import annotations

from datetime import datetime
from typing import Final, Protocol, cast
from uuid import UUID

from apps.api.src.common.protocols.tortoise import HasSiteId, HasWorkspaceId

CONTENT_GLOBAL_SLOTS_NAMESPACE: Final = "content.structure.global_slots"
CONTENT_MENUS_NAMESPACE: Final = "content.structure.menus"
CONTENT_BLOCKS_NAMESPACE: Final = "content.blocks"
CONTENT_VIEWS_NAMESPACE: Final = "content.views"
CONTENT_TYPE_STYLES_NAMESPACE: Final = "content.styles.types"
CONTENT_ENTRY_STYLES_NAMESPACE: Final = "content.styles.entries"
CONTENT_THEME_ACTIVE_NAMESPACE: Final = "theme.active"


class _ContentTypeRecordView(HasWorkspaceId, HasSiteId, Protocol):
    id: UUID | str
    code: str
    name: str
    kind: str

    field_schema: dict[str, object] | None
    editor_schema: dict[str, object] | None
    render_contract: dict[str, object] | None
    workflow_policy: dict[str, object] | None


class _ContentEntryRecordView(HasWorkspaceId, HasSiteId, Protocol):
    id: UUID | str
    type_id: UUID | str
    slug: str
    title: str | None
    status: str
    visibility: str
    locale: str
    draft_revision: int
    published_revision: int | None
    updated_at: datetime

    # ORM relation (prefetch_related("type")).
    type: object | None


def to_content_type_out(record: object):
    from apps.api.src.modules.workspaces.content.schema import ContentTypeKind, ContentTypeOut

    view = cast(_ContentTypeRecordView, record)
    return ContentTypeOut(
        id=UUID(str(view.id)),
        workspace_id=UUID(str(view.workspace_id)),
        site_id=UUID(str(view.site_id)),
        code=str(view.code),
        name=str(view.name),
        kind=cast(ContentTypeKind, str(view.kind)),
        field_schema=view.field_schema,
        editor_schema=view.editor_schema,
        render_contract=view.render_contract,
        workflow_policy=view.workflow_policy,
    )


def to_content_entry_out(
    record: object,
    *,
    path: str | None = None,
    parent_entry_id: UUID | None = None,
    sort_order: int = 0,
):
    from apps.api.src.modules.workspaces.content.schema import (
        ContentEntryOut,
        ContentEntryStatus,
        ContentEntryVisibility,
    )

    view = cast(_ContentEntryRecordView, record)

    type_code = ""
    record_type = view.type
    if record_type is not None:
        type_code = str(getattr(record_type, "code", ""))

    return ContentEntryOut(
        id=UUID(str(view.id)),
        workspace_id=UUID(str(view.workspace_id)),
        site_id=UUID(str(view.site_id)),
        type_id=UUID(str(view.type_id)),
        type_code=type_code,
        slug=str(view.slug),
        title=view.title,
        status=cast(ContentEntryStatus, str(view.status)),
        visibility=cast(ContentEntryVisibility, str(view.visibility)),
        locale=str(view.locale),
        path=path,
        parent_entry_id=parent_entry_id,
        sort_order=int(sort_order or 0),
        draft_revision=int(view.draft_revision),
        published_revision=view.published_revision,
        updated_at=view.updated_at,
    )
