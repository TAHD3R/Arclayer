from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from uuid import uuid4

import pytest

from src.core.events import Event, EventBus
from src.modules.projects.content.items.router_helpers import publish_content_runtime_event
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.tenancy.context import reset_current_tenant_context, set_current_tenant_context
from src.modules.tenancy.schema import TenantContext, TenantIdentity, TenantIsolationMode, TenantScope


class _FakeEventBus:
    def __init__(self) -> None:
        self.events: list[Event] = []

    async def publish(self, event: Event) -> None:
        self.events.append(event)


@pytest.mark.asyncio
async def test_publish_content_runtime_event_includes_tenant_job_payload() -> None:
    organization_id = uuid4()
    workspace_id = uuid4()
    project_id = uuid4()
    runtime_id = uuid4()
    site_id = uuid4()
    tenant_context = TenantContext(
        identity=TenantIdentity(
            organization_id=organization_id,
            workspace_id=workspace_id,
            project_id=project_id,
            runtime_id=runtime_id,
            site_id=site_id,
            schema_name="tenant_workspace",
            isolation_mode=TenantIsolationMode.WORKSPACE_SCHEMA,
        ),
        scope=TenantScope.RUNTIME,
    )
    token = set_current_tenant_context(tenant_context)
    event_bus = _FakeEventBus()

    try:
        await publish_content_runtime_event(
            actor_user_id=uuid4(),
            project_ctx=cast(
                ProjectRequestContext,
                SimpleNamespace(
                    organization_id=organization_id,
                    workspace_id=workspace_id,
                ),
            ),
            entity_id=uuid4(),
            entity_type="content_item",
            event_bus=cast(EventBus, event_bus),
            event_name="project.content.item.workflow.updated",
            properties={"site_id": str(site_id), "project_id": str(project_id), "runtime_id": str(runtime_id)},
        )
    finally:
        reset_current_tenant_context(token)

    assert len(event_bus.events) == 1
    payload = event_bus.events[0].payload
    assert payload["tenant"] == {
        "organizationId": str(organization_id),
        "workspaceId": str(workspace_id),
        "projectId": str(project_id),
        "runtimeId": str(runtime_id),
        "siteId": str(site_id),
        "schemaName": "tenant_workspace",
        "isolationMode": "workspace_schema",
        "scope": "runtime",
    }
    assert payload["activity_ingest"] is False
