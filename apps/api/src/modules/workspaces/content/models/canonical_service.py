from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from pydantic import ConfigDict, Field

from apps.api.src.common.schemas import BaseSchema
from apps.api.src.core.exceptions import Conflict
from apps.api.src.core.http.pagination import PageData, PageParams, paginate_items
from apps.api.src.models.content.model_definition import ContentModelDefinitionRecord
from apps.api.src.models.content.model_field import ContentModelFieldRecord
from apps.api.src.models.content.model_relation import ContentModelRelationRecord
from apps.api.src.modules.workspaces.content.contracts.schema import (
    ContentDefaultEditor,
    ContentModelCapability,
    ContentModelCategory,
    ContentModelDefinitionContract,
    ContentModelFieldContract,
    ContentModelImpactChangeOut,
    ContentModelImpactOut,
    ContentModelOut,
    ContentModelRelationContract,
    ContentModelViewContract,
    ContentRoutingContract,
    ContentWorkflowContract,
)
from apps.api.src.modules.workspaces.content.models.domain_helpers import (
    dump_contract,
    normalize_default_editor,
    normalize_model_category,
    to_content_model_out,
)
from apps.api.src.modules.workspaces.content.models.repository import WorkspaceContentModelsRepository


class ContentModelDefinitionPatchContract(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    key: str | None = Field(default=None, min_length=1, max_length=64)
    name: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=512)
    category: ContentModelCategory | None = None
    default_editor: ContentDefaultEditor | None = None
    fields: list[ContentModelFieldContract] | None = None
    relations: list[ContentModelRelationContract] | None = None
    capabilities: list[ContentModelCapability] | None = None
    routing: ContentRoutingContract | None = None
    workflow: ContentWorkflowContract | None = None
    views: list[ContentModelViewContract] | None = None
    presentation: dict[str, Any] | None = None
    seo: dict[str, Any] | None = None


def _normalize_required_text(value: str, *, error: str) -> str:
    out = value.strip()
    if not out:
        raise Conflict(error, error="CONTENT_MODEL_CONTRACT_INVALID")
    return out


def _capabilities(values: list[ContentModelCapability]) -> list[str]:
    return [str(value) for value in values]


@dataclass(frozen=True)
class ContentModelMutationResult:
    record: ContentModelDefinitionRecord
    impact: ContentModelImpactOut


def _breaking_change(*, code: str, target: str, message: str) -> ContentModelImpactChangeOut:
    return ContentModelImpactChangeOut(code=code, target=target, message=message)


def _field_rows(record: ContentModelDefinitionRecord) -> dict[str, ContentModelFieldRecord]:
    fields = getattr(record, "fields", ())
    return {field.key: field for field in fields if isinstance(field, ContentModelFieldRecord)}


def _relation_rows(record: ContentModelDefinitionRecord) -> dict[str, ContentModelRelationRecord]:
    relations = getattr(record, "relations", ())
    return {relation.key: relation for relation in relations if isinstance(relation, ContentModelRelationRecord)}


def _compare_field_changes(
    before: Iterable[ContentModelFieldRecord],
    after: Iterable[ContentModelFieldRecord],
) -> list[ContentModelImpactChangeOut]:
    before_map = {field.key: field for field in before}
    after_map = {field.key: field for field in after}
    changes = [
        _breaking_change(
            code="field_removed",
            target=f"fields.{key}",
            message=f"Field '{key}' was removed from the model contract.",
        )
        for key in sorted(before_map.keys() - after_map.keys())
    ]
    for key in sorted(before_map.keys() & after_map.keys()):
        previous = before_map[key]
        current = after_map[key]
        if str(previous.field_type) != str(current.field_type):
            changes.append(
                _breaking_change(
                    code="field_scalar_changed",
                    target=f"fields.{key}",
                    message=f"Field '{key}' changed scalar type from '{previous.field_type}' to '{current.field_type}'.",
                )
            )
        if not previous.is_required and current.is_required:
            changes.append(
                _breaking_change(
                    code="field_required_enabled",
                    target=f"fields.{key}",
                    message=f"Field '{key}' became required.",
                )
            )
    return changes


def _compare_relation_changes(
    before: Iterable[ContentModelRelationRecord],
    after: Iterable[ContentModelRelationRecord],
) -> list[ContentModelImpactChangeOut]:
    before_map = {relation.key: relation for relation in before}
    after_map = {relation.key: relation for relation in after}
    changes = [
        _breaking_change(
            code="relation_removed",
            target=f"relations.{key}",
            message=f"Relation '{key}' was removed from the model contract.",
        )
        for key in sorted(before_map.keys() - after_map.keys())
    ]
    for key in sorted(before_map.keys() & after_map.keys()):
        previous = before_map[key]
        current = after_map[key]
        if str(previous.relation_type) != str(current.relation_type):
            changes.append(
                _breaking_change(
                    code="relation_type_changed",
                    target=f"relations.{key}",
                    message=(
                        f"Relation '{key}' changed cardinality from "
                        f"'{previous.relation_type}' to '{current.relation_type}'."
                    ),
                )
            )
        if previous.target_model_key != current.target_model_key:
            changes.append(
                _breaking_change(
                    code="relation_target_changed",
                    target=f"relations.{key}",
                    message=(
                        f"Relation '{key}' changed target model from "
                        f"'{previous.target_model_key}' to '{current.target_model_key}'."
                    ),
                )
            )
        if not previous.is_required and current.is_required:
            changes.append(
                _breaking_change(
                    code="relation_required_enabled",
                    target=f"relations.{key}",
                    message=f"Relation '{key}' became required.",
                )
            )
    return changes


def _build_mutation_impact(
    before: ContentModelDefinitionRecord | None,
    after: ContentModelDefinitionRecord,
) -> ContentModelImpactOut:
    if before is None:
        return ContentModelImpactOut()
    breaking_changes = _compare_field_changes(_field_rows(before).values(), _field_rows(after).values())
    breaking_changes.extend(_compare_relation_changes(_relation_rows(before).values(), _relation_rows(after).values()))
    return ContentModelImpactOut(
        has_breaking_changes=bool(breaking_changes),
        breaking_changes=breaking_changes,
        warnings=[],
    )


def _build_patch_updates(payload: ContentModelDefinitionPatchContract) -> dict[str, Any]:
    updates: dict[str, Any] = {}
    fields_set = payload.model_fields_set
    if "key" in fields_set:
        if payload.key is None:
            raise Conflict("Invalid model key", error="CONTENT_MODEL_CONTRACT_INVALID")
        updates["key"] = _normalize_required_text(payload.key, error="Invalid model key")
    if "name" in fields_set:
        if payload.name is None:
            raise Conflict("Invalid model name", error="CONTENT_MODEL_CONTRACT_INVALID")
        updates["name"] = _normalize_required_text(payload.name, error="Invalid model name")
    if "description" in fields_set:
        updates["description"] = payload.description
    if "category" in fields_set:
        updates["category"] = normalize_model_category(payload.category)
    if "default_editor" in fields_set:
        updates["default_editor"] = normalize_default_editor(payload.default_editor)
    if "capabilities" in fields_set:
        updates["capabilities"] = _capabilities(payload.capabilities or [])
    if "routing" in fields_set:
        updates["routing_policy"] = dump_contract(payload.routing)
    if "presentation" in fields_set:
        updates["presentation_policy"] = dump_contract(payload.presentation)
    if "seo" in fields_set:
        updates["seo_policy"] = dump_contract(payload.seo)
    if "workflow" in fields_set:
        updates["workflow_policy"] = dump_contract(payload.workflow)
    return updates


class WorkspaceContentCanonicalModelsService:
    def __init__(self, repo: WorkspaceContentModelsRepository) -> None:
        self.repo = repo

    async def list_models_paginated(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        params: PageParams,
    ) -> PageData[ContentModelOut]:
        records = await self.repo.list_model_definitions(workspace_id=workspace_id, site_id=site_id)
        rows = [to_content_model_out(record) for record in records]
        return paginate_items(rows, params=params)

    async def create_model(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        payload: ContentModelDefinitionContract,
    ) -> ContentModelMutationResult:
        record = await self.repo.create_model_definition(
            workspace_id=workspace_id,
            site_id=site_id,
            key=_normalize_required_text(payload.key, error="Invalid model key"),
            name=_normalize_required_text(payload.name, error="Invalid model name"),
            description=payload.description,
            category=normalize_model_category(payload.category),
            default_editor=normalize_default_editor(payload.default_editor),
            capabilities=_capabilities(payload.capabilities),
            routing_policy=dump_contract(payload.routing),
            presentation_policy=dump_contract(payload.presentation),
            seo_policy=dump_contract(payload.seo),
            workflow_policy=dump_contract(payload.workflow),
            fields=payload.fields,
            relations=payload.relations,
            views=payload.views,
        )
        return ContentModelMutationResult(record=record, impact=ContentModelImpactOut())

    async def update_model(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        model_id: UUID,
        payload: ContentModelDefinitionPatchContract,
    ) -> ContentModelMutationResult | None:
        fields_set = payload.model_fields_set
        existing = await self.repo.get_model_definition(
            workspace_id=workspace_id,
            site_id=site_id,
            model_id=model_id,
        )
        if existing is None:
            return None
        updated = await self.repo.update_model_definition(
            workspace_id=workspace_id,
            site_id=site_id,
            model_id=model_id,
            fields_to_update=_build_patch_updates(payload),
            fields=(payload.fields if "fields" in fields_set else None),
            relations=(payload.relations if "relations" in fields_set else None),
            views=(payload.views if "views" in fields_set else None),
        )
        if updated is None:
            return None
        return ContentModelMutationResult(record=updated, impact=_build_mutation_impact(existing, updated))
