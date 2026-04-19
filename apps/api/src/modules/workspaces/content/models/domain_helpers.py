from __future__ import annotations

from collections.abc import Iterable
from typing import Any, cast

from src.common.schemas import BaseSchema
from src.models.content.model_definition import ContentModelDefinitionRecord
from src.models.content.model_field import ContentModelFieldRecord
from src.models.content.model_relation import ContentModelRelationRecord
from src.models.content.model_view import ContentModelViewRecord
from src.modules.workspaces.content.continuation import read_record_continuation_defaults
from src.modules.workspaces.content.contracts.schema import (
    ContentDefaultEditor,
    ContentModelCapability,
    ContentModelCapabilityRegistryOut,
    ContentModelCategory,
    ContentModelContractBoundaryOut,
    ContentModelContractRegistryOut,
    ContentModelFieldDefinitionOut,
    ContentModelOut,
    ContentModelProtocolKey,
)

_KNOWN_PROTOCOL_KEYS = {"article", "page", "reusable-section", "category"}


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


def _field_definition_out(field: ContentModelFieldRecord) -> ContentModelFieldDefinitionOut:
    return ContentModelFieldDefinitionOut(
        key=field.key,
        label=field.label,
        scalar=cast(Any, str(field.field_type)),
        required=field.is_required,
        config=cast(dict[str, Any] | None, field.config),
    )


def _contract_boundaries(
    *,
    fields: Iterable[ContentModelFieldRecord],
    system_field_keys: list[str],
) -> ContentModelContractBoundaryOut:
    system_field_key_set = set(system_field_keys)
    system_fields: list[ContentModelFieldDefinitionOut] = []
    custom_fields: list[ContentModelFieldDefinitionOut] = []
    for field in fields:
        definition = _field_definition_out(field)
        if field.key in system_field_key_set:
            system_fields.append(definition)
        else:
            custom_fields.append(definition)
    return ContentModelContractBoundaryOut(
        system_fields=system_fields,
        custom_fields=custom_fields,
        locked_field_keys=list(system_field_keys),
        custom_field_count=len(custom_fields),
    )


def _registry_capabilities(capabilities: Iterable[str]) -> ContentModelCapabilityRegistryOut:
    workflow_capabilities = {"versioned", "publishable", "schedulable"}
    delivery_capabilities = {"routable", "treeable", "localizable", "publishable", "seo_managed"}
    graphql_capabilities = {"queryable", "has_relations", "localizable"}
    normalized = [cast(ContentModelCapability, capability) for capability in capabilities]
    return ContentModelCapabilityRegistryOut(
        workflow=[capability for capability in normalized if capability in workflow_capabilities],
        delivery=[capability for capability in normalized if capability in delivery_capabilities],
        graphql=[capability for capability in normalized if capability in graphql_capabilities],
    )


def to_content_model_out(record: ContentModelDefinitionRecord) -> ContentModelOut:
    fields = cast(Iterable[ContentModelFieldRecord], getattr(record, "fields", []))
    relations = cast(Iterable[ContentModelRelationRecord], getattr(record, "relations", []))
    views = cast(Iterable[ContentModelViewRecord], getattr(record, "views", []))
    defaults = read_record_continuation_defaults(record)
    system_field_keys = cast(list[str], list(record.system_field_keys or []))
    capabilities = [str(value) for value in (record.capabilities or [])]

    return ContentModelOut(
        id=record.id,
        workspace_id=record.workspace_id,
        site_id=record.site_id,
        key=record.key,
        name=record.name,
        description=record.description,
        protocol_key=cast(
            ContentModelProtocolKey | None,
            record.protocol_key if record.protocol_key in _KNOWN_PROTOCOL_KEYS else None,
        ),
        protocol_version=int(record.protocol_version or 1),
        system_managed=bool(record.is_system_managed),
        system_field_keys=system_field_keys,
        draft_contract_revision=int(record.draft_contract_revision or 1),
        published_contract_revision=(
            int(record.published_contract_revision) if record.published_contract_revision is not None else None
        ),
        category=cast(ContentModelCategory, str(record.category or "custom")),
        capabilities=cast(list[Any], capabilities),
        default_editor=cast(ContentDefaultEditor, str(record.default_editor or "form")),
        default_role=cast(Any, defaults.default_role),
        default_posture=cast(Any, defaults.default_posture),
        default_surface=cast(Any, defaults.default_surface),
        starter_pack_policy=defaults.starter_pack_policy,
        surface_policy=defaults.surface_policy,
        contract_registry=ContentModelContractRegistryOut(
            protocol_key=cast(
                ContentModelProtocolKey | None,
                record.protocol_key if record.protocol_key in _KNOWN_PROTOCOL_KEYS else None,
            ),
            protocol_version=int(record.protocol_version or 1),
            category=cast(ContentModelCategory, str(record.category or "custom")),
            system_managed=bool(record.is_system_managed),
            boundaries=_contract_boundaries(fields=fields, system_field_keys=system_field_keys),
            capabilities=_registry_capabilities(capabilities),
            workflow_policy=record.workflow_policy,
            delivery_policy={
                "routing": record.routing_policy,
                "presentation": record.presentation_policy,
                "seo": record.seo_policy,
                "surface": defaults.surface_policy,
            },
            graphql_policy={
                "enabled": "queryable" in capabilities,
                "relationSchema": _relation_schema(relations),
                "viewSchema": _view_schema(views),
            },
        ),
        field_schema=_field_schema(fields),
        relation_schema=_relation_schema(relations),
        routing_schema=record.routing_policy,
        presentation_schema=record.presentation_policy,
        workflow_policy=record.workflow_policy,
        view_schema=_view_schema(views),
    )
