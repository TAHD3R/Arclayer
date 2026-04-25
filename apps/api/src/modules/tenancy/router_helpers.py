from __future__ import annotations

from typing import Any
from uuid import UUID

from structlog.contextvars import bind_contextvars

from src.models.tenancy.workspace_tenant import WorkspaceTenantIsolationMode
from src.modules.tenancy.context import (
    get_current_tenant_context,
    require_current_tenant_context,
    set_current_tenant_context,
)
from src.modules.tenancy.registry import WorkspaceTenantRegistryService
from src.modules.tenancy.schema import (
    TenantContext,
    TenantIdentity,
    TenantIsolationMode,
    TenantJobContextPayload,
    TenantScope,
)


def _to_isolation_mode(raw: WorkspaceTenantIsolationMode | str) -> TenantIsolationMode:
    return TenantIsolationMode(str(raw))


def bind_tenant_context(context: TenantContext) -> TenantContext:
    bind_contextvars(
        tenant_scope=context.scope.value,
        tenant_schema_name=context.schema_name,
        tenant_workspace_id=str(context.workspace_id),
        tenant_project_id=str(context.project_id) if context.project_id is not None else None,
        tenant_runtime_id=str(context.runtime_id) if context.runtime_id is not None else None,
        tenant_site_id=str(context.site_id) if context.site_id is not None else None,
    )
    set_current_tenant_context(context)
    return context


async def ensure_workspace_tenant_context(*, workspace_id: UUID, organization_id: UUID) -> TenantContext:
    record = await WorkspaceTenantRegistryService().ensure_ready_for_workspace(
        workspace_id=workspace_id,
        organization_id=organization_id,
    )
    return TenantContext(
        identity=TenantIdentity(
            organization_id=organization_id,
            workspace_id=workspace_id,
            project_id=None,
            runtime_id=None,
            site_id=None,
            schema_name=record.schema_name,
            isolation_mode=_to_isolation_mode(record.isolation_mode),
        ),
        scope=TenantScope.WORKSPACE,
    )


async def bind_workspace_tenant_context(*, workspace_id: UUID, organization_id: UUID) -> TenantContext:
    return bind_tenant_context(
        await ensure_workspace_tenant_context(
            workspace_id=workspace_id,
            organization_id=organization_id,
        )
    )


def bind_project_tenant_context(
    *,
    project_id: UUID,
    runtime_id: UUID | None = None,
    site_id: UUID | None = None,
    scope: TenantScope = TenantScope.PROJECT,
    base_context: TenantContext | None = None,
) -> TenantContext:
    current = base_context or require_current_tenant_context()
    next_context = current.with_project(
        project_id=project_id,
        runtime_id=runtime_id,
        site_id=site_id,
        scope=scope,
    )
    return bind_tenant_context(next_context)


def resolve_project_tenant_context(*, project_id: UUID, runtime_id: UUID | None = None) -> TenantContext:
    return bind_project_tenant_context(
        project_id=project_id,
        runtime_id=runtime_id,
        scope=TenantScope.PROJECT,
    )


def tenant_payload_from_context(context: TenantContext | None = None) -> dict[str, Any]:
    payload = (context or require_current_tenant_context()).to_job_payload()
    return payload.model_dump(mode="json", by_alias=True)


def tenant_context_from_payload(payload: dict[str, Any] | None) -> TenantContext | None:
    if not isinstance(payload, dict):
        return None
    tenant_payload = payload.get("tenant")
    if not isinstance(tenant_payload, dict):
        return None
    return TenantJobContextPayload.model_validate(tenant_payload).to_context()


def require_tenant_context_from_payload(payload: dict[str, Any] | None) -> TenantContext:
    context = tenant_context_from_payload(payload)
    if context is None:
        raise RuntimeError("TENANT_CONTEXT_REQUIRED")
    return context


def current_tenant_context_or_none() -> TenantContext | None:
    return get_current_tenant_context()
