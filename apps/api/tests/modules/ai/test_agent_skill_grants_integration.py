from __future__ import annotations

from uuid import UUID, uuid4

import pytest

from src.config import get_settings
from src.core.exceptions import Conflict
from src.models.agents.runtime_skill_v1 import AgentRunSkillSnapshotV1Record
from src.models.organization.organization import Organization
from src.models.projects.project import ProjectRecord
from src.models.skills._enums import SkillPackageScope
from src.models.workspaces.workspace import Workspace
from src.modules.ai.agent_catalog_service import AgentCatalogService
from src.modules.ai.agent_skill_grant_service import (
    AgentSkillGrantError,
    build_agent_skill_grant_resolver,
)
from src.modules.ai.runtime_run_schema import AgentRunCreateRequestV1
from src.modules.ai.runtime_run_service import AgentRunService
from src.modules.ai.runtime_thread_schema import AgentThreadCreateRequestV1
from src.modules.ai.runtime_thread_service import AgentThreadService
from src.modules.jobs.service import BackgroundJobService
from src.modules.system.agents.repository import SystemAgentRepository
from src.modules.system.agents.schema import (
    SystemAgentAssignmentCreateRequest,
    SystemAgentDefinitionCreateRequest,
)
from src.modules.system.agents.service import SystemAgentCatalogService
from src.modules.system.agents.skill_grant_validator import TenantAgentVersionSkillGrantValidator
from src.modules.tenancy.router_helpers import ensure_workspace_tenant_context
from src.modules.workspaces.skills.lifecycle_repository import WorkspaceSkillLifecycleRepository
from src.modules.workspaces.skills.lifecycle_service import WorkspaceSkillLifecycleService
from src.modules.workspaces.skills.official_catalog_repository import OfficialSkillCatalogRepository
from src.modules.workspaces.skills.official_catalog_service import WorkspaceOfficialSkillCatalogService
from src.modules.workspaces.skills.repository import WorkspaceSkillsRepository
from src.modules.workspaces.skills.schema import (
    SkillInstallationCreateRequest,
    SkillInstallationUpdateRequest,
    SkillPackageCreateRequest,
    SkillValidationCreateRequest,
)
from src.modules.workspaces.skills.service import WorkspaceSkillsService

pytestmark = pytest.mark.integration


class _NoopPublisher:
    async def publish(self, event) -> None:  # type: ignore[no-untyped-def]
        _ = event


async def _noop_activity_writer(**_kwargs) -> object:
    return object()


async def _scope() -> tuple[Organization, Workspace, ProjectRecord, UUID]:
    owner_user_id = uuid4()
    organization = await Organization.create(
        slug=f"agent-skill-org-{uuid4().hex[:10]}",
        name="Agent Skill Grants",
        owner_user_id=owner_user_id,
        is_active=True,
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Agent Skill Workspace",
        is_active=True,
        owner_user_id=owner_user_id,
        created_by_user_id=owner_user_id,
    )
    project = await ProjectRecord.create(
        workspace_id=workspace.id,
        slug=f"agent-skill-project-{uuid4().hex[:10]}",
        name="Agent Skill Project",
        is_active=True,
        created_by_user_id=owner_user_id,
    )
    return organization, workspace, project, owner_user_id


async def test_agent_skill_grants_pin_exact_run_context_and_reject_new_disabled_use(prepared_db) -> None:
    _ = prepared_db
    settings = get_settings()
    organization, workspace, project, owner_user_id = await _scope()
    tenant_context = await ensure_workspace_tenant_context(
        workspace_id=workspace.id,
        organization_id=organization.id,
    )
    packages = WorkspaceSkillsRepository(tenant_context)
    lifecycle = WorkspaceSkillLifecycleRepository(tenant_context)
    official_catalog = WorkspaceOfficialSkillCatalogService(
        catalog=OfficialSkillCatalogRepository(),
        installations=lifecycle,
        settings=settings,
    )
    package_service = WorkspaceSkillsService(
        repository=packages,
        settings=settings,
        activity_writer=_noop_activity_writer,
    )
    lifecycle_service = WorkspaceSkillLifecycleService(
        packages=packages,
        lifecycle=lifecycle,
        official_catalog=official_catalog,
        settings=settings,
        activity_writer=_noop_activity_writer,
    )
    created = await package_service.create_package(
        workspace_id=workspace.id,
        organization_id=organization.id,
        actor_user_id=owner_user_id,
        idempotency_key="agent-skill-package",
        payload=SkillPackageCreateRequest.model_validate({
            "slug": "guided-planner",
            "displayName": "Guided Planner",
            "description": "Adds exact workspace planning guidance.",
            "instructions": "Use the approved planning sequence and cite every assumption.",
            "references": [
                {
                    "path": "references/checklist.md",
                    "content": "# Checklist\n\nConfirm audience, structure, and launch evidence.",
                    "mimeType": "text/markdown",
                }
            ],
            "requiredTools": [
                {
                    "toolId": "human.request_input",
                    "versionRange": ">=1",
                    "intendedUse": "Ask for one decision only when planning is blocked.",
                }
            ],
            "permissions": [],
            "dataEgress": [],
            "capabilityTags": ["site.planning"],
        }),
    )
    validation = await lifecycle_service.create_validation(
        workspace_id=workspace.id,
        organization_id=organization.id,
        package_id=created.package.id,
        version_id=created.version.id,
        actor_user_id=owner_user_id,
        idempotency_key="agent-skill-validation",
        payload=SkillValidationCreateRequest(policy_version=1),
    )
    installation = await lifecycle_service.create_installation(
        workspace_id=workspace.id,
        organization_id=organization.id,
        actor_user_id=owner_user_id,
        idempotency_key="agent-skill-installation",
        payload=SkillInstallationCreateRequest(
            package_scope=SkillPackageScope.WORKSPACE,
            package_id=created.package.id,
            version_id=created.version.id,
            expected_package_checksum=created.version.package_checksum,
            validation_finding_hash=validation.finding_hash,
            accepted_required_tools=("human.request_input",),
        ),
    )

    async def _resolve_tenant_context(**_kwargs):
        return tenant_context

    agent_service = SystemAgentCatalogService(
        settings,
        repository=SystemAgentRepository(),
        activity_writer=_noop_activity_writer,
        skill_grant_validator=TenantAgentVersionSkillGrantValidator(tenant_context_resolver=_resolve_tenant_context),
    )
    mentioned_definition = await agent_service.create_definition(
        actor_user_id=owner_user_id,
        payload=SystemAgentDefinitionCreateRequest.model_validate({
            "slug": "workspace-guided-reviewer",
            "displayName": "Workspace Guided Reviewer",
            "role": "site_review",
            "description": "Reviews plans with the same exact workspace Skill version.",
            "initialVersion": {
                "instructions": "Review the requested site plan without inventing completed work.",
                "supportedExecutionModes": ["plan"],
                "toolGrants": ["human.request_input"],
                "skillGrantWorkspaceId": str(workspace.id),
                "skillInstallationIds": [str(installation.id)],
                "approvalProfile": {"profileId": "human-input-v1"},
            },
        }),
    )
    mentioned_version = mentioned_definition.latest_version
    assert mentioned_version is not None
    mentioned_assignment = await agent_service.create_assignment(
        actor_user_id=owner_user_id,
        payload=SystemAgentAssignmentCreateRequest(
            workspace_id=workspace.id,
            project_id=project.id,
            agent_id=mentioned_definition.id,
            version_id=mentioned_version.id,
            enabled=True,
            is_default=False,
            is_pinned=True,
        ),
    )
    definition = await agent_service.create_definition(
        actor_user_id=owner_user_id,
        payload=SystemAgentDefinitionCreateRequest.model_validate({
            "slug": "workspace-guided-planner",
            "displayName": "Workspace Guided Planner",
            "role": "site_planning",
            "description": "Plans with one exact workspace Skill version.",
            "initialVersion": {
                "instructions": "Plan the requested site without inventing completed work.",
                "supportedExecutionModes": ["plan"],
                "toolGrants": ["human.request_input"],
                "skillGrantWorkspaceId": str(workspace.id),
                "skillInstallationIds": [str(installation.id)],
                "delegationDefinitionIds": [str(mentioned_definition.id)],
                "approvalProfile": {"profileId": "human-input-v1"},
            },
        }),
    )
    version = definition.latest_version
    assert version is not None
    assignment = await agent_service.create_assignment(
        actor_user_id=owner_user_id,
        payload=SystemAgentAssignmentCreateRequest(
            workspace_id=workspace.id,
            project_id=project.id,
            agent_id=definition.id,
            version_id=version.id,
            enabled=True,
            is_default=False,
            is_pinned=True,
        ),
    )
    thread = await AgentThreadService(event_publisher=_NoopPublisher()).create(
        workspace_id=workspace.id,
        owner_user_id=owner_user_id,
        idempotency_key="agent-skill-thread",
        payload=AgentThreadCreateRequestV1(
            project_id=project.id,
            lead_agent_id=definition.id,
            title="Plan with exact guidance",
        ),
    )
    resolver = build_agent_skill_grant_resolver(tenant_context)
    run_service = AgentRunService(
        settings,
        job_service=BackgroundJobService(event_publisher=_NoopPublisher()),
        skill_grant_resolver=resolver,
        event_publisher=_NoopPublisher(),
    )
    run = await run_service.create(
        workspace_id=workspace.id,
        thread_id=thread.thread_id,
        owner_user_id=owner_user_id,
        idempotency_key="agent-skill-run",
        payload=AgentRunCreateRequestV1(
            project_id=project.id,
            lead_agent_id=definition.id,
            mentioned_agent_ids=(mentioned_definition.id,),
            execution_mode="plan",
            message="Create the launch plan.",
        ),
    )
    snapshots = tuple(
        await AgentRunSkillSnapshotV1Record.filter(run_id=run.run_id).order_by("agent_order", "skill_order")
    )
    assert len(snapshots) == 2
    snapshot = snapshots[0]
    assert snapshot.agent_assignment_id == assignment.id
    assert snapshot.agent_version_id == version.id
    assert snapshot.installation_id == installation.id
    assert snapshot.skill_version_id == created.version.id
    assert snapshot.package_checksum == created.version.package_checksum
    assert snapshot.validation_finding_hash == validation.finding_hash
    assert snapshot.context_byte_size > 0
    mentioned_snapshot = snapshots[1]
    assert mentioned_snapshot.agent_order == 1
    assert mentioned_snapshot.agent_assignment_id == mentioned_assignment.id
    assert mentioned_snapshot.agent_version_id == mentioned_version.id
    assert mentioned_snapshot.installation_id == installation.id

    resolved = await AgentCatalogService(settings).validate_run_snapshot(
        workspace_id=workspace.id,
        project_id=project.id,
        lead_agent_id=definition.id,
        lead_agent_version_id=version.id,
        lead_agent_assignment_id=assignment.id,
        mentioned_agent_ids=(mentioned_definition.id,),
        mentioned_agent_version_ids=(mentioned_version.id,),
        mentioned_agent_assignment_ids=(mentioned_assignment.id,),
        execution_mode="plan",
    )
    context = await resolver.load_run_context(
        workspace_id=workspace.id,
        run_id=run.run_id,
        agents=(resolved[0], *resolved[1]),
    )
    assert len(context) == 1
    assert context[0].name == "Guided Planner"
    assert [resource.path for resource in context[0].resources] == [
        "SKILL.md",
        "references/checklist.md",
    ]

    await lifecycle_service.update_installation(
        workspace_id=workspace.id,
        organization_id=organization.id,
        installation_id=installation.id,
        actor_user_id=owner_user_id,
        payload=SkillInstallationUpdateRequest(
            expected_revision=installation.metadata_revision,
            enabled=False,
        ),
    )
    assert (
        await resolver.load_run_context(
            workspace_id=workspace.id,
            run_id=run.run_id,
            agents=(resolved[0], *resolved[1]),
        )
        == context
    )

    with pytest.raises(Conflict) as disabled:
        await run_service.create(
            workspace_id=workspace.id,
            thread_id=thread.thread_id,
            owner_user_id=owner_user_id,
            idempotency_key="agent-skill-run-disabled",
            payload=AgentRunCreateRequestV1(
                project_id=project.id,
                lead_agent_id=definition.id,
                mentioned_agent_ids=(mentioned_definition.id,),
                execution_mode="plan",
                message="Create another launch plan.",
            ),
        )
    assert disabled.value.error == "AGENT_SKILL_INSTALLATION_DISABLED"

    snapshot.package_checksum = "sha256:" + ("0" * 64)
    await snapshot.save(update_fields=("package_checksum", "updated_at"))
    with pytest.raises(AgentSkillGrantError, match="AGENT_SKILL_SNAPSHOT_INVALID"):
        await resolver.load_run_context(
            workspace_id=workspace.id,
            run_id=run.run_id,
            agents=(resolved[0], *resolved[1]),
        )
