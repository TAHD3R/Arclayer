from __future__ import annotations

from apps.api.modules.workspaces.content.schema import ContentEntryOut, ContentTypeOut


def to_content_type_out(record) -> ContentTypeOut:
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


def to_content_entry_out(record) -> ContentEntryOut:
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
        path=(str(record.path) if getattr(record, "path", None) is not None else None),
        parent_entry_id=(record.parent_entry_id if getattr(record, "parent_entry_id", None) is not None else None),
        sort_order=int(getattr(record, "sort_order", 0) or 0),
        draft_revision=int(record.draft_revision or 0),
        published_revision=(int(record.published_revision) if record.published_revision is not None else None),
        updated_at=record.updated_at,
    )
