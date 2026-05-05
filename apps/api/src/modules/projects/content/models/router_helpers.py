from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi.params import Depends
from pydantic import Field

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.config import get_settings
from src.modules.projects.content.contracts.schema import (
    ContentModelImpactOut,
    ContentModelImpactPreviewOut,
)
from src.modules.projects.content.models.canonical_service import (
    ContentModelImpactPreviewResult,
    ContentModelMutationResult,
    ProjectContentCanonicalModelsService,
)
from src.modules.projects.content.models.repository import ProjectContentModelsRepository
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.http.service import get_project_context
from src.modules.tenancy.router_helpers import resolve_project_tenant_context


class ContentModelMutationOut(BaseSchema):
    id: PublicUUID
    workspace_id: PublicUUID
    site_id: PublicUUID
    singular_key: str
    plural_key: str
    name: str
    description: str | None = None
    protocol_key: str | None = None
    protocol_version: int = 1
    system_managed: bool = False
    system_field_keys: list[str] = Field(default_factory=list)
    model_kind: str = "collection_type"
    draft_contract_revision: int = 1
    published_contract_revision: int | None = None
    default_role: str | None = None
    default_posture: str | None = None
    default_surface: str | None = None
    starter_pack_policy: dict | None = None
    surface_policy: dict | None = None
    impact: ContentModelImpactOut


def to_mutation_out(result: ContentModelMutationResult) -> ContentModelMutationOut:
    record = result.record
    return ContentModelMutationOut(
        id=UUID(str(record.id)),
        workspace_id=UUID(str(record.workspace_id)),
        site_id=UUID(str(record.site_id)),
        singular_key=str(record.singular_key),
        plural_key=str(record.plural_key),
        name=str(record.name),
        description=record.description,
        protocol_key=record.protocol_key,
        protocol_version=int(record.protocol_version or 1),
        system_managed=bool(record.is_system_managed),
        system_field_keys=list(record.system_field_keys or []),
        model_kind=str(record.model_kind or "collection_type"),
        draft_contract_revision=int(record.draft_contract_revision or 1),
        published_contract_revision=(
            int(record.published_contract_revision) if record.published_contract_revision is not None else None
        ),
        default_role=(str(record.default_role) if record.default_role is not None else None),
        default_posture=(str(record.default_posture) if record.default_posture is not None else None),
        default_surface=(str(record.default_surface) if record.default_surface is not None else None),
        starter_pack_policy=(record.starter_pack_policy if isinstance(record.starter_pack_policy, dict) else None),
        surface_policy=(record.surface_policy if isinstance(record.surface_policy, dict) else None),
        impact=result.impact,
    )


def to_preview_out(result: ContentModelImpactPreviewResult) -> ContentModelImpactPreviewOut:
    return ContentModelImpactPreviewOut(
        affected_items_count=result.affected_items_count,
        recovery_items_count=result.recovery_items_count,
        reshape_items_count=result.reshape_items_count,
        has_blocking_changes=result.has_blocking_changes,
        preview_token=result.preview_token,
        impact=result.impact,
        change_plan=result.change_plan,
    )


def get_project_content_canonical_models_service(
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
) -> ProjectContentCanonicalModelsService:
    return ProjectContentCanonicalModelsService(
        repo=ProjectContentModelsRepository(
            resolve_project_tenant_context(project_id=ctx.project_id, runtime_id=ctx.runtime_id)
        ),
        settings=get_settings(),
    )
