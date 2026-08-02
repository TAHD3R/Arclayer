from __future__ import annotations

from uuid import UUID, uuid4

import pytest

from src.config import get_settings
from src.core.exceptions import Conflict
from src.models.agents.catalog import (
    AgentAssignmentRecord,
    AgentDefinitionRecord,
    AgentDefinitionScope,
    AgentLifecycleState,
    AgentVersionRecord,
    AgentVersionState,
)
from src.models.agents.runtime_skill_v1 import AgentRunSkillSnapshotV1Record
from src.models.organization.organization import Organization
from src.models.platform.capability_rollout import WorkspaceCapabilityRollout, WorkspaceCapabilityRolloutStage
from src.models.projects.project import ProjectRecord
from src.models.skills._enums import SkillPackageScope
from src.models.workspaces.workspace import Workspace
from src.modules.ai.agent_catalog_service import AgentCatalogService
from src.modules.ai.agent_skill_grant_service import (
    AgentSkillGrantError,
    build_agent_skill_grant_resolver,
)
from src.modules.ai.runtime_knowledge_context import TenantAgentKnowledgeContextResolver
from src.modules.ai.runtime_run_schema import AgentRunCreateRequestV1
from src.modules.ai.runtime_run_service import AgentRunService
from src.modules.ai.runtime_thread_schema import AgentThreadCreateRequestV1
from src.modules.ai.runtime_thread_service import AgentThreadService
from src.modules.jobs.service import BackgroundJobService
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
    rollout, _ = await WorkspaceCapabilityRollout.get_or_create(
        capability_id="ai-services",
        defaults={"stage": WorkspaceCapabilityRolloutStage.ALL_ELIGIBLE, "revision": 1},
    )
    rollout.stage = WorkspaceCapabilityRolloutStage.ALL_ELIGIBLE
    rollout.revision = max(int(rollout.revision), 1)
    rollout.selection_revision = 0
    await rollout.save(update_fields=["stage", "revision", "selection_revision", "updated_at"])
    return organization, workspace, project, owner_user_id


async def _workspace_agent(
    *,
    workspace: Workspace,
    project: ProjectRecord,
    owner_user_id: UUID,
    slug: str,
    installation_id: UUID | None,
    delegation_definition_ids: tuple[UUID, ...] = (),
) -> tuple[AgentDefinitionRecord, AgentVersionRecord, AgentAssignmentRecord]:
    definition = await AgentDefinitionRecord.create(
        workspace_id=workspace.id,
        stable_key=f"workspace:{workspace.id}:{slug}",
        scope=AgentDefinitionScope.WORKSPACE,
        slug=slug,
        display_name=slug.replace("-", " ").title(),
        role="site_planning",
        description="Workspace-authored agent fixture.",
        lifecycle_state=AgentLifecycleState.ACTIVE,
        is_official=False,
        created_by_user_id=owner_user_id,
    )
    version = await AgentVersionRecord.create(
        definition_id=definition.id,
        version_number=1,
        state=AgentVersionState.PUBLISHED,
        instructions="Plan the requested site without inventing completed work.",
        model_policy={"routingPolicy": "workspace_default"},
        supported_execution_modes=["plan"],
        tool_grants=["human.request_input"],
        skill_grant_workspace_id=workspace.id if installation_id is not None else None,
        skill_installation_ids=[] if installation_id is None else [str(installation_id)],
        knowledge_base_ids=[],
        delegation_definition_ids=[str(item) for item in delegation_definition_ids],
        approval_profile={"profileId": "human-input-v1"},
        compatibility={"agentRuntimeProtocol": 1},
        provenance={"kind": "workspace_custom", "createdByUserId": str(owner_user_id)},
        content_checksum="0" * 64,
        published_at=None,
        created_by_user_id=owner_user_id,
    )
    assignment = await AgentAssignmentRecord.create(
        workspace_id=workspace.id,
        project_id=project.id,
        definition_id=definition.id,
        version_id=version.id,
        assignment_key=f"{workspace.id}:project:{project.id}:{definition.id}",
        enabled=True,
        is_default=False,
        is_pinned=True,
        sort_order=0,
        assigned_by_user_id=owner_user_id,
    )
    return definition, version, assignment


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

    mentioned_definition, mentioned_version, mentioned_assignment = await _workspace_agent(
        workspace=workspace,
        project=project,
        owner_user_id=owner_user_id,
        slug="workspace-guided-reviewer",
        installation_id=installation.id,
    )
    definition, version, assignment = await _workspace_agent(
        workspace=workspace,
        project=project,
        owner_user_id=owner_user_id,
        slug="workspace-guided-planner",
        installation_id=None,
        delegation_definition_ids=(mentioned_definition.id,),
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
        knowledge_context_resolver=TenantAgentKnowledgeContextResolver(tenant_context),
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
            selected_skill_installation_ids=(installation.id,),
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

    with pytest.raises(Conflict) as conflicting_replay:
        await run_service.create(
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
    assert conflicting_replay.value.error == "AGENT_RUN_IDEMPOTENCY_CONFLICT"

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

    snapshot.skill_order = 1
    await snapshot.save(update_fields=("skill_order", "updated_at"))
    with pytest.raises(AgentSkillGrantError, match="AGENT_SKILL_SNAPSHOT_INVALID"):
        await resolver.load_run_context(
            workspace_id=workspace.id,
            run_id=run.run_id,
            agents=(resolved[0], *resolved[1]),
        )
    snapshot.skill_order = 0
    await snapshot.save(update_fields=("skill_order", "updated_at"))

    mentioned_snapshot.skill_order = 1
    await mentioned_snapshot.save(update_fields=("skill_order", "updated_at"))
    with pytest.raises(AgentSkillGrantError, match="AGENT_SKILL_SNAPSHOT_INVALID"):
        await resolver.load_run_context(
            workspace_id=workspace.id,
            run_id=run.run_id,
            agents=(resolved[0], *resolved[1]),
        )
    mentioned_snapshot.skill_order = 0
    await mentioned_snapshot.save(update_fields=("skill_order", "updated_at"))

    snapshot.package_checksum = "sha256:" + ("0" * 64)
    await snapshot.save(update_fields=("package_checksum", "updated_at"))
    with pytest.raises(AgentSkillGrantError, match="AGENT_SKILL_SNAPSHOT_INVALID"):
        await resolver.load_run_context(
            workspace_id=workspace.id,
            run_id=run.run_id,
            agents=(resolved[0], *resolved[1]),
        )
