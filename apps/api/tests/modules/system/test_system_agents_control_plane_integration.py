from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI

from src.common.utils.public_ids import encode_uuid
from src.config import get_settings
from src.core.exceptions import init_exception_handlers
from src.models.agents.catalog import AgentDefinitionRecord
from src.models.analytics.audit_event import AuditEvent
from src.models.organization.organization import Organization
from src.models.projects.project import ProjectRecord
from src.models.workspaces.workspace import Workspace
from src.modules.ai.agent_catalog_manifest import OFFICIAL_AGENT_SPEC_BY_SLUG
from src.modules.ai.agent_catalog_service import AgentCatalogService
from src.modules.ai.agent_tool_grants import SUPPORTED_AGENT_TOOL_GRANTS
from src.modules.platform_identity.http import get_current_platform_session
from src.modules.system.agents.repository import SystemAgentRepository
from src.modules.system.agents.router import assignments_router
from src.modules.system.agents.router import router as system_agents_router
from src.modules.system.agents.schema import SystemAgentDefinitionCreateRequest
from src.modules.system.agents.service import SystemAgentCatalogService
from tests.utils.asgi_client import asgi_client

pytestmark = pytest.mark.integration


def _version_payload(*, instructions: str) -> dict[str, object]:
    return {
        "instructions": instructions,
        "modelPolicy": {"routingPolicy": "workspace_default"},
        "supportedExecutionModes": ["plan", "build"],
        "toolGrants": list(SUPPORTED_AGENT_TOOL_GRANTS),
        "skillInstallationIds": [],
        "knowledgeBaseIds": [],
        "delegationDefinitionIds": [],
        "approvalProfile": {"profileId": "human-input-v1"},
        "compatibility": {"agentRuntimeProtocol": 1},
    }


async def _create_custom_definition(client: Any, *, slug: str) -> dict[str, Any]:
    response = await client.post(
        "/platform-api/v1/agents",
        json={
            "slug": slug,
            "displayName": "Research Editor",
            "role": "content_research",
            "description": "Turns workspace evidence into cited editorial plans.",
            "initialVersion": _version_payload(instructions="Use cited workspace evidence only."),
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["data"]


async def _workspace_scope(*, actor_user_id: UUID) -> tuple[Workspace, ProjectRecord]:
    organization = await Organization.create(
        slug=f"system-agent-control-{uuid4().hex[:12]}",
        name="System Agent Control Plane",
        owner_user_id=actor_user_id,
        is_active=True,
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="System Agent Workspace",
        is_active=True,
        owner_user_id=actor_user_id,
        created_by_user_id=actor_user_id,
    )
    project = await ProjectRecord.create(
        workspace_id=workspace.id,
        slug=f"system-agent-project-{uuid4().hex[:10]}",
        name="System Agent Project",
        is_active=True,
        created_by_user_id=actor_user_id,
    )
    return workspace, project


def _test_app(*, actor_user_id: UUID | None = None, platform_authorized: bool = True) -> FastAPI:
    app = FastAPI()
    init_exception_handlers(app, get_settings())
    app.include_router(system_agents_router, prefix="/platform-api/v1/agents")
    app.include_router(assignments_router, prefix="/platform-api/v1/agent-assignments")
    resolved_actor_user_id = actor_user_id or uuid4()

    async def _platform_principal() -> SimpleNamespace:
        return SimpleNamespace(
            actor_id=resolved_actor_user_id,
            is_instance_owner=platform_authorized,
            operator_id=None,
        )

    app.dependency_overrides[get_current_platform_session] = _platform_principal
    return app


async def test_system_agent_control_plane_requires_real_validation_before_publication_and_has_no_assignment_writes(
    prepared_db,
) -> None:
    _ = prepared_db
    settings = get_settings()
    actor_user_id = uuid4()
    workspace, _project = await _workspace_scope(actor_user_id=actor_user_id)
    await AgentCatalogService(settings).ensure_official_assignments(workspace_id=workspace.id)
    app = _test_app(actor_user_id=actor_user_id)

    async with asgi_client(app) as client:
        capabilities = await client.get("/platform-api/v1/agents/capabilities")
        assert capabilities.status_code == 200, capabilities.text
        assert capabilities.json()["data"]["skillGrantsAvailable"] is False
        assert capabilities.json()["data"]["constraints"] == {
            "customApprovalProfiles": ["human-input-v1"],
            "officialDefinitionsMutable": False,
            "versionsImmutable": True,
            "runtimeValidationPortAvailable": True,
            "versionPublicationRequiresRuntimeValidation": True,
        }

        created = await _create_custom_definition(client, slug="research-editor")
        definition_id = created["id"]
        version_1 = created["latestVersion"]
        assert version_1["state"] == "draft"
        assert version_1["publishedAt"] is None

        version_2_response = await client.post(
            f"/platform-api/v1/agents/{definition_id}/versions",
            json=_version_payload(instructions="Use cited evidence and expose source gaps."),
        )
        assert version_2_response.status_code == 201, version_2_response.text
        version_2 = version_2_response.json()["data"]
        assert version_2["state"] == "draft"

        publish = await client.patch(
            f"/platform-api/v1/agents/{definition_id}/versions/{version_2['id']}",
            json={"state": "published"},
        )
        assert publish.status_code == 200, publish.text
        assert publish.json()["data"]["state"] == "published"
        assert publish.json()["data"]["publishedAt"] is not None

        retired = await client.patch(
            f"/platform-api/v1/agents/{definition_id}/versions/{version_2['id']}",
            json={"state": "retired"},
        )
        assert retired.status_code == 200, retired.text
        assert retired.json()["data"]["state"] == "retired"

        workspace_grant = await client.post(
            f"/platform-api/v1/agents/{definition_id}/versions",
            json={
                **_version_payload(instructions="Must not claim a Workspace Skill."),
                "skillGrantWorkspaceId": encode_uuid(workspace.id),
                "skillInstallationIds": [encode_uuid(uuid4())],
            },
        )
        assert workspace_grant.status_code == 409, workspace_grant.text
        assert workspace_grant.json()["error"] == "AGENT_WORKSPACE_CONTENT_BOUNDARY"

        assignment_write = await client.post(
            "/platform-api/v1/agent-assignments",
            json={"workspaceId": encode_uuid(workspace.id)},
        )
        assert assignment_write.status_code == 405, assignment_write.text

        assignments = await client.get(
            "/platform-api/v1/agent-assignments",
            params={"workspaceId": encode_uuid(workspace.id)},
        )
        assert assignments.status_code == 200, assignments.text
        assert assignments.json()["data"]["total"] == len(OFFICIAL_AGENT_SPEC_BY_SLUG)

        official = OFFICIAL_AGENT_SPEC_BY_SLUG["arclayer-coordinator"]
        official_patch = await client.patch(
            f"/platform-api/v1/agents/{encode_uuid(official.agent_id)}",
            json={"displayName": "Changed Coordinator"},
        )
        assert official_patch.status_code == 409, official_patch.text
        assert official_patch.json()["error"] == "AGENT_OFFICIAL_DEFINITION_PROTECTED"

    definition_uuid = (await AgentDefinitionRecord.get(slug="research-editor")).id
    assert await AuditEvent.filter(
        entity_type="agent_definition",
        entity_id=definition_uuid,
        event_name="system.agent.definition.created",
    ).exists()
    assert await AuditEvent.filter(event_name="system.agent.version.created").count() >= 2
    assert await AuditEvent.filter(event_name="system.agent.version.retired").exists()


async def test_system_agent_control_plane_requires_platform_permission(prepared_db) -> None:
    _ = prepared_db
    app = _test_app(platform_authorized=False)

    async with asgi_client(app) as client:
        response = await client.get("/platform-api/v1/agents/capabilities")

    assert response.status_code == 403, response.text
    assert response.json()["error"] == "PLATFORM_PERMISSION_DENIED"


async def test_system_agent_create_rolls_back_when_required_activity_write_fails(prepared_db) -> None:
    _ = prepared_db
    settings = get_settings()

    async def _failing_activity_writer(**_kwargs: object) -> None:
        raise RuntimeError("audit unavailable")

    service = SystemAgentCatalogService(
        settings,
        repository=SystemAgentRepository(),
        activity_writer=_failing_activity_writer,
    )
    payload = SystemAgentDefinitionCreateRequest.model_validate({
        "slug": "rollback-editor",
        "displayName": "Rollback Editor",
        "role": "content_research",
        "description": "Must not survive without audit evidence.",
        "initialVersion": _version_payload(instructions="This transaction must roll back."),
    })

    with pytest.raises(RuntimeError, match="audit unavailable"):
        await service.create_definition(payload=payload, actor_user_id=uuid4())

    assert not await AgentDefinitionRecord.filter(slug="rollback-editor").exists()


async def test_system_agent_definition_http_contract_and_validation(prepared_db) -> None:
    _ = prepared_db
    app = _test_app()

    async with asgi_client(app) as client:
        created = await _create_custom_definition(client, slug="boundary-editor")
        definition_id = created["id"]

        versions_response = await client.get(f"/platform-api/v1/agents/{definition_id}/versions")
        assert versions_response.status_code == 200, versions_response.text
        versions = versions_response.json()["data"]["items"]
        assert [version["versionNumber"] for version in versions] == [1]
        assert versions[0]["state"] == "draft"

        updated_response = await client.patch(
            f"/platform-api/v1/agents/{definition_id}",
            json={"displayName": "Evidence Editor", "description": "Builds reviewable plans from cited evidence."},
        )
        assert updated_response.status_code == 200, updated_response.text
        assert updated_response.json()["data"]["displayName"] == "Evidence Editor"

        duplicate_slug = await client.post(
            "/platform-api/v1/agents",
            json={
                "slug": "boundary-editor",
                "displayName": "Duplicate Editor",
                "role": "content_research",
                "description": "Must not reuse the canonical slug.",
                "initialVersion": _version_payload(instructions="Reject duplicate slugs."),
            },
        )
        assert duplicate_slug.status_code == 409, duplicate_slug.text
        assert duplicate_slug.json()["error"] == "AGENT_DEFINITION_SLUG_EXISTS"

        invalid_extra = await client.patch(
            f"/platform-api/v1/agents/{definition_id}",
            json={"displayName": "Ignored", "unknownField": True},
        )
        assert invalid_extra.status_code == 422, invalid_extra.text

        duplicate_grants_payload = _version_payload(instructions="Reject duplicate grants.")
        duplicate_grants_payload["toolGrants"] = ["human.request_input", "human.request_input"]
        duplicate_grants = await client.post(
            f"/platform-api/v1/agents/{definition_id}/versions",
            json=duplicate_grants_payload,
        )
        assert duplicate_grants.status_code == 422, duplicate_grants.text
