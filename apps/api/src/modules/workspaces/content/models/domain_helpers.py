from __future__ import annotations

from collections.abc import Iterable
from typing import Any, cast

from apps.api.src.common.schemas import BaseSchema
from apps.api.src.models.content.model_definition import ContentModelDefinitionRecord
from apps.api.src.models.content.model_field import ContentModelFieldRecord
from apps.api.src.models.content.model_relation import ContentModelRelationRecord
from apps.api.src.models.content.model_view import ContentModelViewRecord
from apps.api.src.modules.workspaces.content.contracts.schema import (
    ContentDefaultEditor,
    ContentModelCategory,
    ContentModelOut,
)


def normalize_model_category(value: ContentModelCategory | None) -> str:
    return str(value or "custom")


def normalize_default_editor(value: ContentDefaultEditor | None) -> str:
    return str(value or "form")


def dump_contract(payload: BaseSchema | dict[str, Any] | None) -> dict[str, Any] | None:
    if payload is None:
        return None
    if isinstance(payload, BaseSchema):
        return payload.model_dump(by_alias=False, exclude_none=True)
    return payload or None


def _field_schema(fields: Iterable[ContentModelFieldRecord]) -> dict[str, Any] | None:
    rows = {
        field.key: {
            "label": field.label,
            "scalar": str(field.field_type),
            "required": field.is_required,
            "config": field.config,
        }
        for field in fields
    }
    return rows or None


def _relation_schema(relations: Iterable[ContentModelRelationRecord]) -> dict[str, Any] | None:
    rows = {
        relation.key: {
            "relation": str(relation.relation_type),
            "targetModelKey": relation.target_model_key,
            "required": relation.is_required,
            "config": relation.config,
        }
        for relation in relations
    }
    return rows or None


def _view_schema(views: Iterable[ContentModelViewRecord]) -> dict[str, Any] | None:
    rows = [
        {
            "key": view.key,
            "label": view.label,
            "type": str(view.view_type),
            "config": view.dsl,
            "enabled": view.is_enabled,
        }
        for view in views
    ]
    return {"views": rows} if rows else None


def to_content_model_out(record: ContentModelDefinitionRecord) -> ContentModelOut:
    fields = cast(Iterable[ContentModelFieldRecord], getattr(record, "fields", []))
    relations = cast(Iterable[ContentModelRelationRecord], getattr(record, "relations", []))
    views = cast(Iterable[ContentModelViewRecord], getattr(record, "views", []))

    return ContentModelOut(
        id=record.id,
        workspace_id=record.workspace_id,
        site_id=record.site_id,
        key=record.key,
        name=record.name,
        description=record.description,
        category=cast(ContentModelCategory, str(record.category or "custom")),
        capabilities=[str(value) for value in (record.capabilities or [])],
        default_editor=cast(ContentDefaultEditor, str(record.default_editor or "form")),
        field_schema=_field_schema(fields),
        relation_schema=_relation_schema(relations),
        routing_schema=record.routing_policy,
        presentation_schema=record.presentation_policy,
        workflow_policy=record.workflow_policy,
        view_schema=_view_schema(views),
    )
