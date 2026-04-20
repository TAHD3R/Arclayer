from __future__ import annotations

import asyncio
from typing import Annotated, cast
from uuid import UUID

from asgi_correlation_id import correlation_id
from fastapi import APIRouter, Body, Depends, Request, status
from pydantic import Field

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.config import get_settings
from src.core.events import Event, EventBus
from src.core.exceptions import NotFound, ServiceUnavailable
from src.core.http.pagination import PageData, PageParams, get_page_params
from src.core.http.response import ApiResponse, ResponseModel
from src.core.i18n import t
from src.modules.auth.http.service import get_current_user_id
from src.modules.workspaces.authz.http.service import require_workspace_permission
from src.modules.workspaces.content.contracts.schema import (
    ContentModelDefinitionContract,
    ContentModelImpactOut,
    ContentModelImpactPreviewOut,
    ContentModelOut,
)
from src.modules.workspaces.content.models.canonical_service import (
    ContentModelDefinitionPatchContract,
    ContentModelImpactPreviewResult,
    ContentModelMutationResult,
    WorkspaceContentCanonicalModelsService,
)
from src.modules.workspaces.content.models.repository import WorkspaceContentModelsRepository
from src.modules.workspaces.content.shared.router import _resolve_site_id
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.http.service import require_workspace_manage_access

canonical_models_router = APIRouter(
    prefix="/_internal/workspace-content",
    tags=["domain.workspaces.content"],
    dependencies=[require_workspace_permission("system:content:read")],
)


class ContentModelMutationOut(BaseSchema):
    id: PublicUUID
    workspace_id: PublicUUID
    site_id: PublicUUID
    key: str
    name: str
    description: str | None = None
    protocol_key: str | None = None
    protocol_version: int = 1
    system_managed: bool = False
    system_field_keys: list[str] = Field(default_factory=list)
    draft_contract_revision: int = 1
    published_contract_revision: int | None = None
    default_role: str | None = None
    default_posture: str | None = None
    default_surface: str | None = None
    starter_pack_policy: dict | None = None
    surface_policy: dict | None = None
    impact: ContentModelImpactOut


def _flatten_audit_value(value: object | None, *, prefix: str = "") -> object | None:
    if not isinstance(value, dict):
        return value
    flattened: dict[str, object | None] = {}
    for key, nested_value in value.items():
        if not isinstance(key, str):
            continue
        next_prefix = f"{prefix}.{key}" if prefix else key
        if isinstance(nested_value, dict):
            nested_flat = _flatten_audit_value(nested_value, prefix=next_prefix)
            if isinstance(nested_flat, dict):
                flattened.update(cast(dict[str, object | None], nested_flat))
            else:
                flattened[next_prefix] = nested_flat
            continue
        flattened[next_prefix] = nested_value
    return flattened


def _normalize_default_changes_for_audit(
    changes: dict[str, dict[str, object | None]] | None,
) -> dict[str, dict[str, object | None]]:
    if not changes:
        return {}
    normalized: dict[str, dict[str, object | None]] = {}
    for field_name, diff in changes.items():
        normalized[field_name] = {
            "before": _flatten_audit_value(diff.get("before")),
            "after": _flatten_audit_value(diff.get("after")),
        }
    return normalized


def _to_mutation_out(result: ContentModelMutationResult) -> ContentModelMutationOut:
    record = result.record
    return ContentModelMutationOut(
        id=UUID(str(record.id)),
        workspace_id=UUID(str(record.workspace_id)),
        site_id=UUID(str(record.site_id)),
        key=str(record.key),
        name=str(record.name),
        description=record.description,
        protocol_key=record.protocol_key,
        protocol_version=int(record.protocol_version or 1),
        system_managed=bool(record.is_system_managed),
        system_field_keys=list(record.system_field_keys or []),
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


def _to_preview_out(result: ContentModelImpactPreviewResult) -> ContentModelImpactPreviewOut:
    return ContentModelImpactPreviewOut(
        affected_items_count=result.affected_items_count,
        recovery_items_count=result.recovery_items_count,
        reshape_items_count=result.reshape_items_count,
        has_blocking_changes=result.has_blocking_changes,
        preview_token=result.preview_token,
        impact=result.impact,
        change_plan=result.change_plan,
    )


def get_event_bus(request: Request) -> EventBus:
    bus = getattr(request.app.state, "event_bus", None)
    if bus is None:
        raise ServiceUnavailable(
            message=t("settings:EVENT_BUS_UNAVAILABLE"),
            error="EVENT_BUS_UNAVAILABLE",
        )
    return bus


async def _publish_content_model_activity_event(
    *,
    actor_user_id: UUID | None,
    ctx: WorkspaceContext,
    entity_id: UUID,
    event_bus: EventBus,
    result: ContentModelMutationResult,
) -> None:
    properties = {
        "model_key": str(result.record.key),
        "model_name": str(result.record.name),
        "draft_contract_revision": int(result.record.draft_contract_revision or 1),
        "published_contract_revision": (
            int(result.record.published_contract_revision)
            if result.record.published_contract_revision is not None
            else None
        ),
        "default_changes": _normalize_default_changes_for_audit(result.default_changes),
        "impact_preview": (
            {
                "affected_items_count": result.preview.affected_items_count,
                "recovery_items_count": result.preview.recovery_items_count,
                "reshape_items_count": result.preview.reshape_items_count,
                "has_blocking_changes": result.preview.has_blocking_changes,
            }
            if result.preview is not None
            else None
        ),
        "impact": {
            "has_breaking_changes": result.impact.has_breaking_changes,
            "breaking_changes": [change.model_dump(mode="json") for change in result.impact.breaking_changes],
            "warnings": list(result.impact.warnings),
        },
    }
    try:
        await event_bus.publish(
            Event(
                name="workspace.content.model.updated",
                payload={
                    "organization_id": str(ctx.organization_id),
                    "workspace_id": str(ctx.workspace_id),
                    "entity_type": "content_model",
                    "entity_id": str(entity_id),
                    **properties,
                },
                source="api",
                trace_id=correlation_id.get(None),
                actor_user_id=str(actor_user_id) if actor_user_id is not None else None,
            )
        )
    except (asyncio.CancelledError, GeneratorExit, KeyboardInterrupt, SystemExit):
        raise
    except BaseException:
        return


def get_workspace_content_canonical_models_service() -> WorkspaceContentCanonicalModelsService:
    return WorkspaceContentCanonicalModelsService(
        repo=WorkspaceContentModelsRepository(),
        settings=get_settings(),
    )


@canonical_models_router.post(
    "/models",
    response_model=ResponseModel[ContentModelMutationOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Create rebuilt content model contract (workspace RBAC protected)",
    dependencies=[require_workspace_permission("system:content:manage")],
)
async def create_workspace_content_model(
    payload: Annotated[ContentModelDefinitionContract, Body(description="Create model contract payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[
        WorkspaceContentCanonicalModelsService,
        Depends(get_workspace_content_canonical_models_service),
    ],
) -> ResponseModel[ContentModelMutationOut]:
    """Create rebuilt content model contract (workspace RBAC protected)."""
    record = await service.create_model(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        payload=payload,
    )
    return ApiResponse.success(data=_to_mutation_out(record))


@canonical_models_router.get(
    "/models",
    response_model=ResponseModel[PageData[ContentModelOut]],
    response_model_exclude_none=True,
    summary="List rebuilt content models (workspace RBAC protected)",
)
async def list_workspace_content_models_canonical(
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[
        WorkspaceContentCanonicalModelsService,
        Depends(get_workspace_content_canonical_models_service),
    ],
    params: PageParams = Depends(get_page_params),
) -> ResponseModel[PageData[ContentModelOut]]:
    """List rebuilt content models (workspace RBAC protected)."""
    data = await service.list_models_paginated(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        params=params,
    )
    return ApiResponse.success(data=data)


@canonical_models_router.post(
    "/models/{model_id}/impact-preview",
    response_model=ResponseModel[ContentModelImpactPreviewOut],
    response_model_exclude_none=True,
    summary="Preview rebuilt content model mutation impact (workspace RBAC protected)",
    dependencies=[require_workspace_permission("system:content:manage")],
)
async def preview_workspace_content_model_update(
    model_id: PublicUUID,
    payload: Annotated[ContentModelDefinitionPatchContract, Body(description="Patch model contract payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[
        WorkspaceContentCanonicalModelsService,
        Depends(get_workspace_content_canonical_models_service),
    ],
) -> ResponseModel[ContentModelImpactPreviewOut]:
    """Preview rebuilt content model mutation impact (workspace RBAC protected)."""
    result = await service.preview_model_update(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        model_id=model_id,
        payload=payload,
    )
    if result is None:
        raise NotFound("Content model not found", error="CONTENT_MODEL_NOT_FOUND")
    return ApiResponse.success(data=_to_preview_out(result))


@canonical_models_router.patch(
    "/models/{model_id}",
    response_model=ResponseModel[ContentModelMutationOut],
    response_model_exclude_none=True,
    summary="Update rebuilt content model contract (workspace RBAC protected)",
    dependencies=[require_workspace_permission("system:content:manage")],
)
async def update_workspace_content_model(
    model_id: PublicUUID,
    payload: Annotated[ContentModelDefinitionPatchContract, Body(description="Patch model contract payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    actor_user_id: Annotated[UUID | None, Depends(get_current_user_id)],
    event_bus: Annotated[EventBus, Depends(get_event_bus)],
    service: Annotated[
        WorkspaceContentCanonicalModelsService,
        Depends(get_workspace_content_canonical_models_service),
    ],
) -> ResponseModel[ContentModelMutationOut]:
    """Update rebuilt content model contract (workspace RBAC protected)."""
    record = await service.update_model(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        model_id=model_id,
        payload=payload,
    )
    if record is None:
        raise NotFound("Content model not found", error="CONTENT_MODEL_NOT_FOUND")
    await _publish_content_model_activity_event(
        actor_user_id=actor_user_id,
        ctx=ctx,
        entity_id=UUID(str(record.record.id)),
        event_bus=event_bus,
        result=record,
    )
    return ApiResponse.success(data=_to_mutation_out(record))
