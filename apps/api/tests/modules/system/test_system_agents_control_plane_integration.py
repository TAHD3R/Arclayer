from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI

from src.common.utils.public_ids import decode_public_id, encode_uuid
from src.config import get_settings
from src.core.exceptions import init_exception_handlers
from src.models.agents.catalog import (
    AgentDefinitionRecord,
    AgentVersionRecord,
    AgentVersionState,
)
from src.models.analytics.audit_event import AuditEvent
from src.models.organization.organization import Organization, OrganizationKind
from src.models.projects.project import ProjectRecord
from src.models.workspaces.workspace import Workspace
from src.modules.ai.agent_catalog_manifest import OFFICIAL_AGENT_SPEC_BY_SLUG
from src.modules.ai.agent_catalog_service import AgentCatalogService
from src.modules.ai.agent_tool_grants import SUPPORTED_AGENT_TOOL_GRANTS
from src.modules.auth.http.service import get_current_user, require_super_admin
from src.modules.system.agents.repository import SystemAgentRepository
from src.modules.system.agents.schema import SystemAgentDefinitionCreateRequest
from src.modules.system.agents.service import SystemAgentCatalogService
from src.modules.system.router import router as system_router
from tests.utils.asgi_client import asgi_client

pytestmark = pytest.mark.integration


class _NoopSkillGrantValidator:
    async def validate(self, **_kwargs) -> None:
        return None


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


async def _create_custom_definition(
    client,
    *,
    slug: str,
    display_name: str = "Research Editor",
) -> dict[str, Any]:
    response = await client.post(
        "/api/v1/system/agents",
        json={
            "slug": slug,
            "displayName": display_name,
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
        kind=OrganizationKind.TEAM,
        owner_user_id=actor_user_id,
        is_active=True,
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="System Agent Workspace",
        is_active=True,
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


def _test_app(*, actor_user_id: UUID | None = None, is_super_admin: bool = True) -> FastAPI:
    app = FastAPI()
    init_exception_handlers(app, get_settings())
    app.include_router(system_router, prefix="/api/v1/system")
    resolved_actor_user_id = actor_user_id or uuid4()

    async def _actor():
        return SimpleNamespace(id=resolved_actor_user_id, is_super_admin=is_super_admin)

    app.dependency_overrides[get_current_user] = _actor
    if is_super_admin:
        app.dependency_overrides[require_super_admin] = _actor
    return app


async def test_system_agent_control_plane_preserves_versions_assignments_and_official_authority(
    prepared_db,
) -> None:
    _ = prepared_db
    settings = get_settings()
    actor_user_id = uuid4()
    workspace, project = await _workspace_scope(actor_user_id=actor_user_id)
    await AgentCatalogService(settings).ensure_official_assignments(workspace_id=workspace.id)
    app = _test_app(actor_user_id=actor_user_id)

    async with asgi_client(app) as client:
        capabilities = await client.get("/api/v1/system/agents/capabilities")
        assert capabilities.status_code == 200, capabilities.text
        assert capabilities.json()["data"] == {
            "supportedToolGrants": list(SUPPORTED_AGENT_TOOL_GRANTS),
            "skillGrantsAvailable": True,
            "knowledgeGrantsAvailable": False,
            "modelRoutingPolicies": ["workspace_default"],
            "agentRuntimeProtocol": 1,
            "hardDeleteSupported": False,
            "constraints": {
                "customApprovalProfiles": ["human-input-v1"],
                "officialDefinitionsMutable": False,
                "versionsImmutable": True,
            },
        }

        created_response = await client.post(
            "/api/v1/system/agents",
            json={
                "slug": "research-editor",
                "displayName": "Research Editor",
                "role": "content_research",
                "description": "Turns workspace evidence into cited editorial plans.",
                "initialVersion": _version_payload(instructions="Use cited workspace evidence only."),
            },
        )
        assert created_response.status_code == 201, created_response.text
        created = created_response.json()["data"]
        assert created["slug"] == "research-editor"
        assert created["isOfficial"] is False
        assert created["latestVersion"]["versionNumber"] == 1
        assert len(created["latestVersion"]["contentChecksum"]) == 64
        definition_id = created["id"]
        version_1_id = created["latestVersion"]["id"]

        version_2_response = await client.post(
            f"/api/v1/system/agents/{definition_id}/versions",
            json=_version_payload(instructions="Use cited evidence and expose source gaps."),
        )
        assert version_2_response.status_code == 201, version_2_response.text
        version_2 = version_2_response.json()["data"]
        assert version_2["versionNumber"] == 2
        assert version_2["id"] != version_1_id

        detail_response = await client.get(f"/api/v1/system/agents/{definition_id}")
        assert detail_response.status_code == 200, detail_response.text
        versions = detail_response.json()["data"]["versions"]
        assert [version["versionNumber"] for version in versions] == [2, 1]
        assert versions[1]["instructions"] == "Use cited workspace evidence only."

        custom_assignment_response = await client.post(
            "/api/v1/system/agent-assignments",
            json={
                "workspaceId": encode_uuid(workspace.id),
                "projectId": encode_uuid(project.id),
                "agentId": definition_id,
                "versionId": version_2["id"],
                "enabled": True,
                "isDefault": True,
                "isPinned": True,
                "sortOrder": 5,
            },
        )
        assert custom_assignment_response.status_code == 201, custom_assignment_response.text
        assignment = custom_assignment_response.json()["data"]
        assert assignment["workspaceName"] == workspace.name
        assert assignment["projectName"] == project.name
        assert assignment["versionNumber"] == 2
        assert assignment["isDefault"] is True
        assignment_id = assignment["id"]

        effective_catalog = await AgentCatalogService(settings).list_available(
            workspace_id=workspace.id,
            project_id=project.id,
        )
        assert effective_catalog.default_agent_id == decode_public_id(definition_id)

        blocked_default_disable = await client.patch(
            f"/api/v1/system/agent-assignments/{assignment_id}",
            json={"enabled": False},
        )
        assert blocked_default_disable.status_code == 409, blocked_default_disable.text
        assert blocked_default_disable.json()["error"] == "AGENT_DEFAULT_ASSIGNMENT_DISABLED"

        blocked_retire = await client.patch(
            f"/api/v1/system/agents/{definition_id}/versions/{version_2['id']}",
            json={"state": "retired"},
        )
        assert blocked_retire.status_code == 409, blocked_retire.text
        assert blocked_retire.json()["error"] == "AGENT_VERSION_IN_USE"

        disabled_assignment = await client.patch(
            f"/api/v1/system/agent-assignments/{assignment_id}",
            json={"enabled": False, "isDefault": False},
        )
        assert disabled_assignment.status_code == 200, disabled_assignment.text
        assert disabled_assignment.json()["data"]["enabled"] is False
        assert disabled_assignment.json()["data"]["isDefault"] is False

        retired = await client.patch(
            f"/api/v1/system/agents/{definition_id}/versions/{version_2['id']}",
            json={"state": "retired"},
        )
        assert retired.status_code == 200, retired.text
        assert retired.json()["data"]["state"] == "retired"

        coordinator = OFFICIAL_AGENT_SPEC_BY_SLUG["arclayer-coordinator"]
        official_patch = await client.patch(
            f"/api/v1/system/agents/{encode_uuid(coordinator.agent_id)}",
            json={"displayName": "Changed Coordinator"},
        )
        assert official_patch.status_code == 409, official_patch.text
        assert official_patch.json()["error"] == "AGENT_OFFICIAL_DEFINITION_PROTECTED"

        unavailable_skill_grant = await client.post(
            f"/api/v1/system/agents/{definition_id}/versions",
            json={
                **_version_payload(instructions="Request an unavailable Skill."),
                "skillGrantWorkspaceId": encode_uuid(workspace.id),
                "skillInstallationIds": [encode_uuid(uuid4())],
            },
        )
        assert unavailable_skill_grant.status_code == 409, unavailable_skill_grant.text
        assert unavailable_skill_grant.json()["error"] == "AGENT_SKILL_INSTALLATION_NOT_FOUND"

        listed = await client.get("/api/v1/system/agents", params={"q": "research"})
        assert listed.status_code == 200, listed.text
        assert listed.json()["data"]["total"] == 1
        assert listed.json()["data"]["items"][0]["slug"] == "research-editor"

    definition_uuid = (await AgentDefinitionRecord.get(slug="research-editor")).id
    assert await AuditEvent.filter(
        entity_type="agent_definition",
        entity_id=definition_uuid,
        event_name="system.agent.definition.created",
    ).exists()
    assert await AuditEvent.filter(event_name="system.agent.version.created").count() >= 2
    assert await AuditEvent.filter(event_name="system.agent.assignment.updated").exists()


async def test_system_agent_control_plane_requires_super_admin(prepared_db) -> None:
    _ = prepared_db
    app = _test_app(is_super_admin=False)

    async with asgi_client(app) as client:
        response = await client.get("/api/v1/system/agents/capabilities")

    assert response.status_code == 403, response.text
    assert response.json()["error"] == "SUPER_ADMIN_REQUIRED"


async def test_system_agent_create_rolls_back_when_required_activity_write_fails(prepared_db) -> None:
    _ = prepared_db
    settings = get_settings()

    async def _failing_activity_writer(**_kwargs):
        raise RuntimeError("audit unavailable")

    service = SystemAgentCatalogService(
        settings,
        repository=SystemAgentRepository(),
        activity_writer=_failing_activity_writer,
        skill_grant_validator=_NoopSkillGrantValidator(),
    )
    payload = SystemAgentDefinitionCreateRequest.model_validate({
        "slug": "rollback-editor",
        "displayName": "Rollback Editor",
        "role": "content_research",
        "description": "Must not survive without audit evidence.",
        "initialVersion": _version_payload(instructions="This transaction must roll back."),
    })

    with pytest.raises(RuntimeError, match="audit unavailable"):
        await service.create_definition(
            payload=payload,
            actor_user_id=uuid4(),
        )

    assert not await AgentDefinitionRecord.filter(slug="rollback-editor").exists()


async def test_system_agent_definition_http_contract_and_validation(prepared_db) -> None:
    _ = prepared_db
    app = _test_app()

    async with asgi_client(app) as client:
        created = await _create_custom_definition(client, slug="boundary-editor")
        definition_id = created["id"]

        versions_response = await client.get(f"/api/v1/system/agents/{definition_id}/versions")
        assert versions_response.status_code == 200, versions_response.text
        versions = versions_response.json()["data"]["items"]
        assert [version["versionNumber"] for version in versions] == [1]

        updated_response = await client.patch(
            f"/api/v1/system/agents/{definition_id}",
            json={
                "displayName": "Evidence Editor",
                "description": "Builds reviewable plans from cited workspace evidence.",
            },
        )
        assert updated_response.status_code == 200, updated_response.text
        assert updated_response.json()["data"]["displayName"] == "Evidence Editor"

        duplicate_slug = await client.post(
            "/api/v1/system/agents",
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
            f"/api/v1/system/agents/{definition_id}",
            json={"displayName": "Ignored", "unknownField": True},
        )
        assert invalid_extra.status_code == 422, invalid_extra.text

        invalid_slug = await client.post(
            "/api/v1/system/agents",
            json={
                "slug": "invalid slug",
                "displayName": "Invalid Slug",
                "role": "content_research",
                "description": "Must fail schema validation.",
                "initialVersion": _version_payload(instructions="Reject invalid slugs."),
            },
        )
        assert invalid_slug.status_code == 422, invalid_slug.text

        duplicate_grants_payload = _version_payload(instructions="Reject duplicate grants.")
        duplicate_grants_payload["toolGrants"] = ["human.request_input", "human.request_input"]
        duplicate_grants = await client.post(
            f"/api/v1/system/agents/{definition_id}/versions",
            json=duplicate_grants_payload,
        )
        assert duplicate_grants.status_code == 422, duplicate_grants.text


async def test_system_agent_assignment_http_filters_and_scope_invariants(prepared_db) -> None:
    _ = prepared_db
    settings = get_settings()
    actor_user_id = uuid4()
    workspace, project = await _workspace_scope(actor_user_id=actor_user_id)
    other_workspace, other_project = await _workspace_scope(actor_user_id=uuid4())
    await AgentCatalogService(settings).ensure_official_assignments(workspace_id=workspace.id)
    app = _test_app(actor_user_id=actor_user_id)

    async with asgi_client(app) as client:
        created = await _create_custom_definition(client, slug="assignment-editor")
        assignment_response = await client.post(
            "/api/v1/system/agent-assignments",
            json={
                "workspaceId": encode_uuid(workspace.id),
                "projectId": encode_uuid(project.id),
                "agentId": created["id"],
                "versionId": created["latestVersion"]["id"],
                "enabled": True,
                "isDefault": False,
                "isPinned": True,
                "sortOrder": 7,
            },
        )
        assert assignment_response.status_code == 201, assignment_response.text

        listed_response = await client.get(
            "/api/v1/system/agent-assignments",
            params={
                "workspaceId": encode_uuid(workspace.id),
                "projectId": encode_uuid(project.id),
                "agentId": created["id"],
                "enabled": "true",
                "page": 1,
                "size": 1,
            },
        )
        assert listed_response.status_code == 200, listed_response.text
        listed = listed_response.json()["data"]
        assert listed["total"] == 1
        assert listed["pages"] == 1
        assert listed["items"][0]["agentId"] == created["id"]
        assert listed["items"][0]["projectId"] == encode_uuid(project.id)

        cross_workspace_project = await client.post(
            "/api/v1/system/agent-assignments",
            json={
                "workspaceId": encode_uuid(other_workspace.id),
                "projectId": encode_uuid(project.id),
                "agentId": created["id"],
                "versionId": created["latestVersion"]["id"],
            },
        )
        assert cross_workspace_project.status_code == 404, cross_workspace_project.text
        assert cross_workspace_project.json()["error"] == "AGENT_PROJECT_NOT_FOUND"

        coordinator = OFFICIAL_AGENT_SPEC_BY_SLUG["arclayer-coordinator"]
        official_version = await AgentVersionRecord.get(id=coordinator.version_id)
        non_manifest_version = await AgentVersionRecord.create(
            definition_id=coordinator.agent_id,
            version_number=official_version.version_number + 100,
            state=AgentVersionState.PUBLISHED,
            instructions="Non-manifest test version.",
            model_policy=official_version.model_policy,
            supported_execution_modes=official_version.supported_execution_modes,
            tool_grants=official_version.tool_grants,
            skill_installation_ids=official_version.skill_installation_ids,
            knowledge_base_ids=official_version.knowledge_base_ids,
            delegation_definition_ids=official_version.delegation_definition_ids,
            approval_profile=official_version.approval_profile,
            compatibility=official_version.compatibility,
            provenance={"kind": "system_custom", "createdByUserId": str(actor_user_id)},
            content_checksum="0" * 64,
            published_at=official_version.published_at,
            created_by_user_id=actor_user_id,
        )
        protected_version = await client.post(
            "/api/v1/system/agent-assignments",
            json={
                "workspaceId": encode_uuid(other_workspace.id),
                "projectId": encode_uuid(other_project.id),
                "agentId": encode_uuid(coordinator.agent_id),
                "versionId": encode_uuid(non_manifest_version.id),
            },
        )
        assert protected_version.status_code == 409, protected_version.text
        assert protected_version.json()["error"] == "AGENT_OFFICIAL_VERSION_PROTECTED"
