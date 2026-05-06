from __future__ import annotations

from uuid import uuid4

import pytest

from src.core.entity_manager.manager import EntityManager
from src.core.events import Event
from src.modules.projects.content.items.canonical_service import ProjectContentCanonicalItemsService
from src.modules.projects.content.items.repository import ProjectContentItemsRepository
from src.modules.tenancy.context import reset_current_tenant_context, set_current_tenant_context
from src.modules.tenancy.schema import TenantContext, TenantIdentity, TenantIsolationMode, TenantScope


class _FakeEventPublisher:
    def __init__(self) -> None:
        self.events: list[Event] = []

    async def publish(self, event: Event) -> None:
        self.events.append(event)


@pytest.mark.asyncio
async def test_content_runtime_event_uses_service_domain_event_contract() -> None:
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
    publisher = _FakeEventPublisher()
    service = ProjectContentCanonicalItemsService(
        repo=ProjectContentItemsRepository(tenant_context),
        entity_manager=EntityManager(items_repo=ProjectContentItemsRepository(tenant_context)),
        organization_id=organization_id,
    )
    service._event_publisher = publisher

    try:
        await service._publish_content_runtime_event(
            actor_user_id=uuid4(),
            workspace_id=workspace_id,
            site_id=site_id,
            project_id=project_id,
            runtime_id=runtime_id,
            entity_id=uuid4(),
            entity_type="content_item",
            event_name="project.content.item.workflow.updated",
        )
    finally:
        reset_current_tenant_context(token)

    assert len(publisher.events) == 1
    payload = publisher.events[0].payload
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
    assert payload["organization_id"] == str(organization_id)
    assert payload["workspace_id"] == str(workspace_id)
    assert payload["project_id"] == str(project_id)
    assert payload["runtime_id"] == str(runtime_id)
    assert payload["site_id"] == str(site_id)
