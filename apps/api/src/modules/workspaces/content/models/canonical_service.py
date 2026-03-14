from __future__ import annotations

from typing import Any
from uuid import UUID

from pydantic import ConfigDict, Field

from apps.api.src.common.schemas import BaseSchema
from apps.api.src.core.exceptions import Conflict
from apps.api.src.modules.workspaces.content.contracts.schema import (
    ContentModelCapability,
    ContentModelDefinitionContract,
    ContentModelFieldContract,
    ContentModelRelationContract,
    ContentModelViewContract,
    ContentRoutingContract,
    ContentWorkflowContract,
)
from apps.api.src.modules.workspaces.content.models.repository import WorkspaceContentModelsRepository


class ContentModelDefinitionPatchContract(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    key: str | None = Field(default=None, min_length=1, max_length=64)
    name: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=512)
    kind: str | None = Field(default=None, min_length=1, max_length=64)
    fields: list[ContentModelFieldContract] | None = None
    relations: list[ContentModelRelationContract] | None = None
    capabilities: list[ContentModelCapability] | None = None
    routing: ContentRoutingContract | None = None
    workflow: ContentWorkflowContract | None = None
    views: list[ContentModelViewContract] | None = None


def _normalize_required_text(value: str, *, error: str) -> str:
    out = value.strip()
    if not out:
        raise Conflict(error, error="CONTENT_MODEL_CONTRACT_INVALID")
    return out


def _dump_contract(payload: BaseSchema | None) -> dict[str, Any] | None:
    if payload is None:
        return None
    return payload.model_dump(by_alias=False, exclude_none=True)


def _capabilities(values: list[ContentModelCapability]) -> list[str]:
    return [str(value) for value in values]


class WorkspaceContentCanonicalModelsService:
    def __init__(self, repo: WorkspaceContentModelsRepository) -> None:
        self.repo = repo

    async def create_model(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        payload: ContentModelDefinitionContract,
    ):
        return await self.repo.create_model_definition(
            workspace_id=workspace_id,
            site_id=site_id,
            key=_normalize_required_text(payload.key, error="Invalid model key"),
            name=_normalize_required_text(payload.name, error="Invalid model name"),
            description=payload.description,
            kind=payload.kind,
            capabilities=_capabilities(payload.capabilities),
            routing_policy=_dump_contract(payload.routing),
            workflow_policy=_dump_contract(payload.workflow),
            fields=payload.fields,
            relations=payload.relations,
            views=payload.views,
        )

    async def update_model(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        model_id: UUID,
        payload: ContentModelDefinitionPatchContract,
    ):
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
        if "kind" in fields_set:
            updates["kind"] = payload.kind
        if "capabilities" in fields_set:
            updates["capabilities"] = _capabilities(payload.capabilities or [])
        if "routing" in fields_set:
            updates["routing_policy"] = _dump_contract(payload.routing)
        if "workflow" in fields_set:
            updates["workflow_policy"] = _dump_contract(payload.workflow)

        return await self.repo.update_model_definition(
            workspace_id=workspace_id,
            site_id=site_id,
            model_id=model_id,
            fields_to_update=updates,
            fields=(payload.fields if "fields" in fields_set else None),
            relations=(payload.relations if "relations" in fields_set else None),
            views=(payload.views if "views" in fields_set else None),
        )
