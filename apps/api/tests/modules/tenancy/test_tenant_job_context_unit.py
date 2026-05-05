from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import cast
from uuid import uuid4

import pytest

from src.core.events import Event
from src.models.content._enums import ContentReleaseStatus
from src.models.workspaces.workspace import WorkspaceKind
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.releases.events import publish_project_release_event
from src.modules.projects.releases.schema import ReleaseLineageOut, ReleaseOut
from src.modules.tenancy.router_helpers import require_tenant_context_from_payload, tenant_context_from_payload
from src.modules.tenancy.schema import TenantContext, TenantIdentity, TenantIsolationMode, TenantScope
from src.modules.workspaces.http.schema import WorkspaceAccessType
from src.platform.jobs.assets_thumbnails import generate_asset_thumbnails


def _tenant_context() -> TenantContext:
    return TenantContext(
        identity=TenantIdentity(
            organization_id=uuid4(),
            workspace_id=uuid4(),
            project_id=uuid4(),
            runtime_id=uuid4(),
            site_id=uuid4(),
            schema_name="cms_ws_1234567890abcdefghij",
            isolation_mode=TenantIsolationMode.WORKSPACE_SCHEMA,
        ),
        scope=TenantScope.RUNTIME,
    )


def test_tenant_job_payload_round_trip() -> None:
    context = _tenant_context()
    payload = {"tenant": context.to_job_payload().model_dump(mode="json")}
    restored = tenant_context_from_payload(payload)
    assert restored == context
    assert restored is not None
    assert isinstance(restored.scope, TenantScope)
    assert isinstance(restored.isolation_mode, TenantIsolationMode)
    assert restored.scope.value == "runtime"


def test_require_tenant_context_from_payload_raises_when_missing() -> None:
    with pytest.raises(RuntimeError, match="TENANT_CONTEXT_REQUIRED"):
        require_tenant_context_from_payload({})


@pytest.mark.asyncio
async def test_asset_thumbnail_job_requires_tenant_payload() -> None:
    settings = SimpleNamespace(database=SimpleNamespace(enabled=True))
    with pytest.raises(RuntimeError, match="TENANT_CONTEXT_REQUIRED"):
        await generate_asset_thumbnails({"settings": settings}, str(uuid4()), str(uuid4()), None)


@pytest.mark.asyncio
async def test_publish_release_event_serializes_enriched_tenant_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    actor_user_id = uuid4()
    organization_id = uuid4()
    workspace_id = uuid4()
    project_id = uuid4()
    runtime_id = uuid4()
    site_id = uuid4()
    release_id = uuid4()
    published: dict[str, object] = {}

    project_ctx = ProjectRequestContext(
        project_id=project_id,
        workspace_id=workspace_id,
        organization_id=organization_id,
        runtime_id=runtime_id,
        workspace_kind=WorkspaceKind.TEAM,
        access_type=WorkspaceAccessType.MEMBER,
        org_membership_id=None,
        is_org_owner=False,
        workspace_membership_id=None,
        visible_only=False,
        is_creator_admin=False,
    )
    now = datetime(2026, 4, 25, 10, 0, tzinfo=UTC)
    release = ReleaseOut(
        id=release_id,
        workspace_id=workspace_id,
        site_id=site_id,
        release_number=3,
        is_active=True,
        status=ContentReleaseStatus.ACTIVE,
        created_by_user_id=actor_user_id,
        activated_at=now,
        selection_count=4,
        lineage=ReleaseLineageOut(),
        created_at=now,
        updated_at=now,
    )

    async def _fake_publish_and_wait(event, timeout):  # type: ignore[no-untyped-def]
        published["event"] = event
        published["timeout"] = timeout

    monkeypatch.setattr(
        "src.modules.projects.releases.events.current_tenant_context_or_none",
        lambda: TenantContext(
            identity=TenantIdentity(
                organization_id=organization_id,
                workspace_id=workspace_id,
                project_id=project_id,
                runtime_id=runtime_id,
                site_id=None,
                schema_name="cms_ws_1234567890abcdefghij",
                isolation_mode=TenantIsolationMode.WORKSPACE_SCHEMA,
            ),
            scope=TenantScope.PROJECT,
        ),
    )
    monkeypatch.setattr("src.modules.projects.releases.events.events.publish_and_wait", _fake_publish_and_wait)

    await publish_project_release_event(
        actor_user_id=actor_user_id,
        project_ctx=project_ctx,
        event_name="release.published",
        payload=release,
        project_id=project_id,
    )

    event = cast(Event, published["event"])
    payload = cast(dict[str, object], event.payload)
    tenant_payload = cast(dict[str, str | None], payload["tenant"])
    assert published["timeout"] == 1.0
    assert tenant_payload["workspaceId"] == str(workspace_id)
    assert tenant_payload["projectId"] == str(project_id)
    assert tenant_payload["runtimeId"] == str(runtime_id)
    assert tenant_payload["siteId"] == str(site_id)
    restored = tenant_context_from_payload({"tenant": tenant_payload})
    assert restored is not None
    assert restored.project_id == project_id
    assert restored.runtime_id == runtime_id
    assert restored.site_id == site_id
