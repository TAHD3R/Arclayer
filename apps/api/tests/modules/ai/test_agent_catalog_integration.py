from __future__ import annotations

from dataclasses import replace
from uuid import UUID, uuid4

import pytest
from tortoise.transactions import in_transaction

from src.config import get_settings
from src.core.exceptions import Conflict, NotFound
from src.models.agents.catalog import AgentAssignmentRecord, AgentDefinitionRecord, AgentVersionRecord
from src.models.agents.runtime_v1 import (
    AgentExecutionModeV1,
    AgentRunStatusV1,
    AgentRunV1Record,
    AgentThreadV1Record,
)
from src.models.organization.organization import Organization
from src.models.platform.capability_rollout import (
    WorkspaceCapabilityRollout,
    WorkspaceCapabilityRolloutSelection,
    WorkspaceCapabilityRolloutStage,
)
from src.models.projects.project import ProjectRecord
from src.models.system.setting import SettingRecord
from src.models.workspaces.workspace import Workspace
from src.modules.ai.agent_catalog_manifest import (
    OFFICIAL_AGENT_SPEC_BY_SLUG,
    official_agent_id,
    official_agent_version_id,
)
from src.modules.ai.agent_catalog_repository import AgentCatalogRepository
from src.modules.ai.agent_catalog_service import AgentCatalogService
from src.modules.ai.agent_tool_grants import (
    BUILDER_STYLE_GUIDE_GENERATE_TOOL,
    HUMAN_REQUEST_INPUT_TOOL,
    WORKSPACE_SKILL_CREATE_TOOL,
)
from src.modules.ai.runtime_knowledge_context import TenantAgentKnowledgeContextResolver
from src.modules.ai.runtime_run_schema import AgentRunCreateRequestV1
from src.modules.ai.runtime_run_service import AgentRunService
from src.modules.ai.runtime_thread_schema import AgentThreadCreateRequestV1
from src.modules.ai.runtime_thread_service import AgentThreadService
from src.modules.jobs.service import BackgroundJobService
from src.modules.tenancy.router_helpers import ensure_workspace_tenant_context
from src.settings.core_schema import CORE_SETTINGS_NAMESPACE
from src.settings.runtime import invalidate_core_settings_cache
from src.settings.scopes import SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID

pytestmark = pytest.mark.integration


class _NoopPublisher:
    async def publish(self, event) -> None:  # type: ignore[no-untyped-def]
        _ = event


async def _scope(*, enable_rollout: bool = True) -> tuple[Workspace, ProjectRecord, UUID]:
    owner_user_id = uuid4()
    organization = await Organization.create(
        slug=f"agent-catalog-org-{uuid4().hex[:10]}",
        name="Agent Catalog Org",
        owner_user_id=owner_user_id,
        is_active=True,
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Agent Catalog Workspace",
        is_active=True,
        owner_user_id=owner_user_id,
        created_by_user_id=owner_user_id,
    )
    project = await ProjectRecord.create(
        workspace_id=workspace.id,
        slug=f"agent-catalog-project-{uuid4().hex[:10]}",
        name="Agent Catalog Project",
        is_active=True,
        created_by_user_id=owner_user_id,
    )
    if enable_rollout:
        rollout, _ = await WorkspaceCapabilityRollout.get_or_create(
            capability_id="ai-services",
            defaults={"stage": WorkspaceCapabilityRolloutStage.ALL_ELIGIBLE, "revision": 1},
        )
        rollout.stage = WorkspaceCapabilityRolloutStage.ALL_ELIGIBLE
        rollout.revision = max(int(rollout.revision), 1)
        rollout.selection_revision = 0
        await rollout.save(update_fields=["stage", "revision", "selection_revision", "updated_at"])
    return workspace, project, owner_user_id


@pytest.mark.asyncio
async def test_official_catalog_is_versioned_assigned_and_deterministic(prepared_db) -> None:
    _ = prepared_db
    workspace, project, _owner_user_id = await _scope()
    service = AgentCatalogService(get_settings())

    first = await service.list_available(workspace_id=workspace.id, project_id=project.id)
    second = await service.list_available(workspace_id=workspace.id, project_id=project.id)

    assert [agent.slug for agent in first.agents] == [
        "arclayer-coordinator",
        "site-architect",
        "visual-designer",
        "content-writer",
        "seo-strategist",
        "data-analyst",
    ]
    assert second == first
    assert first.default_agent_id == official_agent_id("arclayer-coordinator")
    assert all(agent.provenance == "arclayer_official" for agent in first.agents)
    assert [agent.version_number for agent in first.agents] == [7, 3, 3, 1, 1, 1]
    grants_by_slug = {agent.slug: set(agent.tool_grants) for agent in first.agents}
    assert BUILDER_STYLE_GUIDE_GENERATE_TOOL in grants_by_slug["arclayer-coordinator"]
    assert WORKSPACE_SKILL_CREATE_TOOL in grants_by_slug["arclayer-coordinator"]
    assert BUILDER_STYLE_GUIDE_GENERATE_TOOL in grants_by_slug["visual-designer"]
    assert BUILDER_STYLE_GUIDE_GENERATE_TOOL not in grants_by_slug["site-architect"]
    assert all(agent.available for agent in first.agents)
    assert await AgentDefinitionRecord.filter(is_official=True).count() == 6
    assert await AgentVersionRecord.all().count() == 6
    assert await AgentAssignmentRecord.filter(workspace_id=workspace.id).count() == 6


@pytest.mark.asyncio
async def test_product_catalog_defaults_to_all_eligible_without_rollout_record(prepared_db) -> None:
    _ = prepared_db
    await WorkspaceCapabilityRollout.filter(capability_id="ai-services").delete()
    workspace, project, _owner_user_id = await _scope(enable_rollout=False)

    catalog = await AgentCatalogService(get_settings()).list_available(
        workspace_id=workspace.id,
        project_id=project.id,
    )

    assert len(catalog.agents) == 6
    assert await AgentAssignmentRecord.filter(workspace_id=workspace.id).count() == 6


@pytest.mark.asyncio
async def test_product_catalog_enforces_selected_workspace_rollout_without_cross_workspace_propagation(
    prepared_db,
) -> None:
    _ = prepared_db
    selected_workspace, selected_project, _ = await _scope()
    unselected_workspace, unselected_project, _ = await _scope()
    rollout = await WorkspaceCapabilityRollout.get(capability_id="ai-services")
    rollout.stage = WorkspaceCapabilityRolloutStage.SELECTED_WORKSPACES
    rollout.revision = 2
    rollout.selection_revision = 1
    await rollout.save(update_fields=["stage", "revision", "selection_revision", "updated_at"])
    await WorkspaceCapabilityRolloutSelection.create(rollout_id=rollout.id, workspace_id=selected_workspace.id)

    selected = await AgentCatalogService(get_settings()).list_available(
        workspace_id=selected_workspace.id,
        project_id=selected_project.id,
    )
    assert len(selected.agents) == 6

    with pytest.raises(Conflict) as denied:
        await AgentCatalogService(get_settings()).list_available(
            workspace_id=unselected_workspace.id,
            project_id=unselected_project.id,
        )

    assert denied.value.error == "WORKSPACE_CAPABILITY_ROLLOUT_NOT_SELECTED"
    assert not await AgentAssignmentRecord.filter(workspace_id=unselected_workspace.id).exists()


@pytest.mark.asyncio
async def test_startup_catalog_readiness_does_not_propagate_official_assignments(prepared_db) -> None:
    _ = prepared_db
    await WorkspaceCapabilityRollout.filter(capability_id="ai-services").delete()
    workspace, _project, _owner_user_id = await _scope(enable_rollout=False)

    await AgentCatalogService(get_settings()).ensure_all_workspaces_ready()

    assert not await AgentAssignmentRecord.filter(workspace_id=workspace.id).exists()


@pytest.mark.asyncio
async def test_thread_create_requires_real_assignment_and_pins_version(prepared_db) -> None:
    _ = prepared_db
    workspace, project, owner_user_id = await _scope()
    service = AgentThreadService(event_publisher=_NoopPublisher())

    with pytest.raises(NotFound) as error:
        await service.create(
            workspace_id=workspace.id,
            owner_user_id=owner_user_id,
            idempotency_key="unknown-agent-thread",
            payload=AgentThreadCreateRequestV1(
                project_id=project.id,
                lead_agent_id=uuid4(),
                title="Unknown Agent",
            ),
        )
    assert error.value.error == "AGENT_ASSIGNMENT_NOT_FOUND"

    created = await service.create(
        workspace_id=workspace.id,
        owner_user_id=owner_user_id,
        idempotency_key="coordinator-thread",
        payload=AgentThreadCreateRequestV1(
            project_id=project.id,
            lead_agent_id=official_agent_id("arclayer-coordinator"),
            title="Plan the launch site",
        ),
    )

    assert created.lead_agent_id == official_agent_id("arclayer-coordinator")
    assert created.lead_agent_version_id is not None


@pytest.mark.asyncio
async def test_run_create_rejects_unassigned_mentions_and_unsupported_mode(prepared_db) -> None:
    _ = prepared_db
    workspace, project, owner_user_id = await _scope()
    coordinator_id = official_agent_id("arclayer-coordinator")
    data_analyst_id = official_agent_id("data-analyst")
    thread = await AgentThreadService(event_publisher=_NoopPublisher()).create(
        workspace_id=workspace.id,
        owner_user_id=owner_user_id,
        idempotency_key="catalog-run-thread",
        payload=AgentThreadCreateRequestV1(
            project_id=project.id,
            lead_agent_id=coordinator_id,
            title="Coordinate specialists",
        ),
    )
    tenant_context = await ensure_workspace_tenant_context(
        workspace_id=workspace.id,
        organization_id=workspace.organization_id,
    )
    service = AgentRunService(
        job_service=BackgroundJobService(event_publisher=_NoopPublisher()),
        event_publisher=_NoopPublisher(),
        knowledge_context_resolver=TenantAgentKnowledgeContextResolver(tenant_context),
    )

    with pytest.raises(NotFound) as missing:
        await service.create(
            workspace_id=workspace.id,
            thread_id=thread.thread_id,
            owner_user_id=owner_user_id,
            idempotency_key="unknown-mentioned-agent",
            payload=AgentRunCreateRequestV1(
                project_id=project.id,
                lead_agent_id=coordinator_id,
                mentioned_agent_ids=(uuid4(),),
                execution_mode="plan",
                message="Ask an unavailable specialist.",
            ),
        )
    assert missing.value.error == "AGENT_MENTION_ASSIGNMENT_NOT_FOUND"

    analyst_thread = await AgentThreadService(event_publisher=_NoopPublisher()).create(
        workspace_id=workspace.id,
        owner_user_id=owner_user_id,
        idempotency_key="analyst-thread",
        payload=AgentThreadCreateRequestV1(
            project_id=project.id,
            lead_agent_id=data_analyst_id,
            title="Analyze performance",
        ),
    )
    with pytest.raises(Conflict) as unsupported:
        await service.create(
            workspace_id=workspace.id,
            thread_id=analyst_thread.thread_id,
            owner_user_id=owner_user_id,
            idempotency_key="analyst-build",
            payload=AgentRunCreateRequestV1(
                project_id=project.id,
                lead_agent_id=data_analyst_id,
                execution_mode="build",
                message="Apply production changes.",
            ),
        )
    assert unsupported.value.error == "AGENT_EXECUTION_MODE_UNSUPPORTED"


@pytest.mark.asyncio
async def test_reconcile_backfills_all_known_legacy_runtime_identities(prepared_db) -> None:
    _ = prepared_db
    workspace, project, owner_user_id = await _scope()
    thread = await AgentThreadV1Record.create(
        workspace_id=workspace.id,
        project_id=project.id,
        owner_user_id=owner_user_id,
        lead_agent_id="content_builder",
        title="Legacy runtime",
    )
    run = await AgentRunV1Record.create(
        workspace_id=workspace.id,
        project_id=project.id,
        thread_id=thread.id,
        owner_user_id=owner_user_id,
        idempotency_key="legacy-runtime-run",
        execution_mode=AgentExecutionModeV1.PLAN,
        lead_agent_id="content_model_advisor",
        mentioned_agent_ids=["content_analyzer", "content_advisor"],
        status=AgentRunStatusV1.CREATED,
        correlation_id="legacy-runtime-correlation",
    )

    await AgentCatalogService(get_settings()).ensure_official_assignments(workspace_id=workspace.id)
    await thread.refresh_from_db()
    await run.refresh_from_db()

    coordinator_id = official_agent_id("arclayer-coordinator")
    architect_id = official_agent_id("site-architect")
    analyst_id = official_agent_id("data-analyst")
    assert thread.lead_agent_id == str(coordinator_id)
    assert thread.lead_agent_version_id == OFFICIAL_AGENT_SPEC_BY_SLUG["arclayer-coordinator"].version_id
    assert thread.lead_agent_assignment_id is not None
    assert run.lead_agent_id == str(architect_id)
    assert run.lead_agent_version_id == OFFICIAL_AGENT_SPEC_BY_SLUG["site-architect"].version_id
    assert run.lead_agent_assignment_id is not None
    assert run.mentioned_agent_ids == [str(analyst_id), str(coordinator_id)]
    assert run.mentioned_agent_version_ids == [
        str(official_agent_version_id("data-analyst", 1)),
        str(OFFICIAL_AGENT_SPEC_BY_SLUG["arclayer-coordinator"].version_id),
    ]
    assert len(run.mentioned_agent_assignment_ids) == 2


@pytest.mark.asyncio
async def test_reconcile_rejects_unknown_legacy_identity_without_partial_assignments(prepared_db) -> None:
    _ = prepared_db
    workspace, project, owner_user_id = await _scope()
    await AgentThreadV1Record.create(
        workspace_id=workspace.id,
        project_id=project.id,
        owner_user_id=owner_user_id,
        lead_agent_id="unknown_legacy_agent",
        title="Unknown legacy runtime",
    )

    with pytest.raises(Conflict) as error:
        await AgentCatalogService(get_settings()).ensure_official_assignments(workspace_id=workspace.id)

    assert error.value.error == "AGENT_LEGACY_IDENTITY_UNMAPPED"
    assert await AgentAssignmentRecord.filter(workspace_id=workspace.id).count() == 0


@pytest.mark.asyncio
async def test_project_assignment_overrides_workspace_assignment_and_disables_resolution(prepared_db) -> None:
    _ = prepared_db
    workspace, project, _owner_user_id = await _scope()
    service = AgentCatalogService(get_settings())
    await service.ensure_official_assignments(workspace_id=workspace.id)
    coordinator_id = official_agent_id("arclayer-coordinator")
    workspace_assignment = await AgentAssignmentRecord.get(
        workspace_id=workspace.id,
        project_id=None,
        definition_id=coordinator_id,
    )
    project_assignment = await AgentAssignmentRecord.create(
        workspace_id=workspace.id,
        project_id=project.id,
        definition_id=coordinator_id,
        version_id=workspace_assignment.version_id,
        assignment_key=f"{workspace.id}:project:{project.id}:{coordinator_id}",
        enabled=False,
        is_default=True,
        is_pinned=True,
        sort_order=0,
    )

    project_catalog = await service.list_available(workspace_id=workspace.id, project_id=project.id)
    coordinator = next(item for item in project_catalog.agents if item.agent_id == coordinator_id)
    workspace_catalog = await service.list_available(workspace_id=workspace.id, project_id=None)

    assert coordinator.assignment_id == project_assignment.id
    assert coordinator.available is False
    assert coordinator.unavailable_reason == "assignment_disabled"
    assert project_catalog.default_agent_id is None
    assert workspace_catalog.default_agent_id == coordinator_id
    with pytest.raises(Conflict) as disabled:
        await service.resolve_lead(
            workspace_id=workspace.id,
            project_id=project.id,
            agent_id=coordinator_id,
        )
    assert disabled.value.error == "AGENT_ASSIGNMENT_DISABLED"


@pytest.mark.asyncio
async def test_worker_snapshot_revalidation_rejects_disabled_exact_assignment(prepared_db) -> None:
    _ = prepared_db
    workspace, _project, _owner_user_id = await _scope()
    service = AgentCatalogService(get_settings())
    resolved = await service.resolve_lead(
        workspace_id=workspace.id,
        project_id=None,
        agent_id=official_agent_id("arclayer-coordinator"),
        execution_mode="build",
    )
    await AgentAssignmentRecord.filter(id=resolved.assignment_id).update(enabled=False)

    with pytest.raises(Conflict) as disabled:
        await service.validate_run_snapshot(
            workspace_id=workspace.id,
            project_id=None,
            lead_agent_id=resolved.agent_id,
            lead_agent_version_id=resolved.version_id,
            lead_agent_assignment_id=resolved.assignment_id,
            mentioned_agent_ids=(),
            mentioned_agent_version_ids=(),
            mentioned_agent_assignment_ids=(),
            execution_mode="build",
        )
    assert disabled.value.error == "AGENT_ASSIGNMENT_DISABLED"


@pytest.mark.asyncio
async def test_worker_snapshot_revalidation_enforces_current_rollout_stage(prepared_db) -> None:
    _ = prepared_db
    workspace, project, _owner_user_id = await _scope()
    service = AgentCatalogService(get_settings())
    resolved = await service.resolve_lead(
        workspace_id=workspace.id,
        project_id=project.id,
        agent_id=official_agent_id("arclayer-coordinator"),
        execution_mode="plan",
    )
    rollout = await WorkspaceCapabilityRollout.get(capability_id="ai-services")
    rollout.stage = WorkspaceCapabilityRolloutStage.NOT_AVAILABLE
    rollout.revision = 2
    await rollout.save(update_fields=["stage", "revision", "updated_at"])

    with pytest.raises(Conflict) as denied:
        await service.validate_run_snapshot(
            workspace_id=workspace.id,
            project_id=project.id,
            lead_agent_id=resolved.agent_id,
            lead_agent_version_id=resolved.version_id,
            lead_agent_assignment_id=resolved.assignment_id,
            mentioned_agent_ids=(),
            mentioned_agent_version_ids=(),
            mentioned_agent_assignment_ids=(),
            execution_mode="plan",
        )

    assert denied.value.error == "WORKSPACE_CAPABILITY_ROLLOUT_NOT_AVAILABLE"


@pytest.mark.asyncio
async def test_global_agents_disabled_is_explicit_in_catalog_and_resolution(prepared_db) -> None:
    _ = prepared_db
    workspace, project, _owner_user_id = await _scope()
    prior = await SettingRecord.get_or_none(
        scope_type=SCOPE_TYPE_SYSTEM,
        scope_id=SYSTEM_SCOPE_ID,
        namespace=CORE_SETTINGS_NAMESPACE,
    )
    prior_value = prior.value if prior is not None else None
    await SettingRecord.update_or_create(
        scope_type=SCOPE_TYPE_SYSTEM,
        scope_id=SYSTEM_SCOPE_ID,
        namespace=CORE_SETTINGS_NAMESPACE,
        defaults={"value": {"ai_agents": {"enabled": False}}, "updated_by": None},
    )
    invalidate_core_settings_cache()

    try:
        service = AgentCatalogService(get_settings())
        catalog = await service.list_available(workspace_id=workspace.id, project_id=project.id)

        assert catalog.default_agent_id is None
        assert len(catalog.agents) == 6
        assert all(agent.available is False for agent in catalog.agents)
        assert all(agent.unavailable_reason == "agents_disabled" for agent in catalog.agents)
        with pytest.raises(Conflict) as disabled:
            await service.resolve_lead(
                workspace_id=workspace.id,
                project_id=project.id,
                agent_id=official_agent_id("arclayer-coordinator"),
            )
        assert disabled.value.error == "AGENT_ASSIGNMENT_DISABLED"
    finally:
        if prior is None:
            await SettingRecord.filter(
                scope_type=SCOPE_TYPE_SYSTEM,
                scope_id=SYSTEM_SCOPE_ID,
                namespace=CORE_SETTINGS_NAMESPACE,
            ).delete()
        else:
            await SettingRecord.filter(id=prior.id).update(value=prior_value)
        invalidate_core_settings_cache()


@pytest.mark.asyncio
async def test_worker_snapshot_revalidation_rejects_mismatched_mention_arrays(prepared_db) -> None:
    _ = prepared_db
    workspace, project, _owner_user_id = await _scope()
    service = AgentCatalogService(get_settings())
    lead = await service.resolve_lead(
        workspace_id=workspace.id,
        project_id=project.id,
        agent_id=official_agent_id("arclayer-coordinator"),
        execution_mode="plan",
    )

    with pytest.raises(Conflict) as invalid:
        await service.validate_run_snapshot(
            workspace_id=workspace.id,
            project_id=project.id,
            lead_agent_id=lead.agent_id,
            lead_agent_version_id=lead.version_id,
            lead_agent_assignment_id=lead.assignment_id,
            mentioned_agent_ids=(official_agent_id("data-analyst"),),
            mentioned_agent_version_ids=(),
            mentioned_agent_assignment_ids=(),
            execution_mode="plan",
        )
    assert invalid.value.error == "AGENT_RUN_AGENT_SNAPSHOT_INVALID"


@pytest.mark.asyncio
async def test_worker_snapshot_revalidation_rejects_replaced_assignment_version(prepared_db) -> None:
    _ = prepared_db
    workspace, project, _owner_user_id = await _scope()
    service = AgentCatalogService(get_settings())
    lead = await service.resolve_lead(
        workspace_id=workspace.id,
        project_id=project.id,
        agent_id=official_agent_id("arclayer-coordinator"),
        execution_mode="plan",
    )
    await AgentAssignmentRecord.filter(id=lead.assignment_id).update(
        version_id=OFFICIAL_AGENT_SPEC_BY_SLUG["site-architect"].version_id
    )

    with pytest.raises(NotFound) as replaced:
        await service.validate_run_snapshot(
            workspace_id=workspace.id,
            project_id=project.id,
            lead_agent_id=lead.agent_id,
            lead_agent_version_id=lead.version_id,
            lead_agent_assignment_id=lead.assignment_id,
            mentioned_agent_ids=(),
            mentioned_agent_version_ids=(),
            mentioned_agent_assignment_ids=(),
            execution_mode="plan",
        )
    assert replaced.value.error == "AGENT_ASSIGNMENT_NOT_FOUND"


@pytest.mark.asyncio
async def test_worker_snapshot_revalidation_rejects_project_assignment_in_another_project(prepared_db) -> None:
    _ = prepared_db
    workspace, project, owner_user_id = await _scope()
    other_project = await ProjectRecord.create(
        workspace_id=workspace.id,
        slug=f"agent-catalog-other-project-{uuid4().hex[:10]}",
        name="Other Agent Catalog Project",
        is_active=True,
        created_by_user_id=owner_user_id,
    )
    service = AgentCatalogService(get_settings())
    await service.ensure_official_assignments(workspace_id=workspace.id)
    coordinator_id = official_agent_id("arclayer-coordinator")
    workspace_assignment = await AgentAssignmentRecord.get(
        workspace_id=workspace.id,
        project_id=None,
        definition_id=coordinator_id,
    )
    project_assignment = await AgentAssignmentRecord.create(
        workspace_id=workspace.id,
        project_id=project.id,
        definition_id=coordinator_id,
        version_id=workspace_assignment.version_id,
        assignment_key=f"{workspace.id}:project:{project.id}:{coordinator_id}",
        enabled=True,
        is_default=True,
        is_pinned=True,
        sort_order=0,
    )

    with pytest.raises(NotFound) as wrong_scope:
        await service.validate_run_snapshot(
            workspace_id=workspace.id,
            project_id=other_project.id,
            lead_agent_id=coordinator_id,
            lead_agent_version_id=project_assignment.version_id,
            lead_agent_assignment_id=project_assignment.id,
            mentioned_agent_ids=(),
            mentioned_agent_version_ids=(),
            mentioned_agent_assignment_ids=(),
            execution_mode="plan",
        )
    assert wrong_scope.value.error == "AGENT_ASSIGNMENT_NOT_FOUND"


@pytest.mark.asyncio
async def test_worker_snapshot_revalidation_rechecks_delegation_allowlist(prepared_db) -> None:
    _ = prepared_db
    workspace, project, _owner_user_id = await _scope()
    service = AgentCatalogService(get_settings())
    lead = await service.resolve_lead(
        workspace_id=workspace.id,
        project_id=project.id,
        agent_id=official_agent_id("data-analyst"),
        execution_mode="plan",
    )
    mentioned = await service.resolve_lead(
        workspace_id=workspace.id,
        project_id=project.id,
        agent_id=official_agent_id("site-architect"),
        execution_mode="plan",
    )

    with pytest.raises(Conflict) as forbidden:
        await service.validate_run_snapshot(
            workspace_id=workspace.id,
            project_id=project.id,
            lead_agent_id=lead.agent_id,
            lead_agent_version_id=lead.version_id,
            lead_agent_assignment_id=lead.assignment_id,
            mentioned_agent_ids=(mentioned.agent_id,),
            mentioned_agent_version_ids=(mentioned.version_id,),
            mentioned_agent_assignment_ids=(mentioned.assignment_id,),
            execution_mode="plan",
        )
    assert forbidden.value.error == "AGENT_DELEGATION_NOT_ALLOWED"


@pytest.mark.asyncio
async def test_official_manifest_checksum_drift_fails_fast(prepared_db) -> None:
    _ = prepared_db
    workspace, _project, _owner_user_id = await _scope()
    service = AgentCatalogService(get_settings())
    await service.ensure_official_assignments(workspace_id=workspace.id)
    coordinator_version_id = OFFICIAL_AGENT_SPEC_BY_SLUG["arclayer-coordinator"].version_id
    await AgentVersionRecord.filter(id=coordinator_version_id).update(content_checksum="0" * 64)

    with pytest.raises(Conflict) as drift:
        await service.ensure_official_assignments(workspace_id=workspace.id)
    assert drift.value.error == "AGENT_OFFICIAL_CATALOG_DRIFT"


@pytest.mark.asyncio
async def test_official_catalog_upgrade_publishes_new_version_and_advances_assignment(prepared_db) -> None:
    _ = prepared_db
    workspace, _project, _owner_user_id = await _scope()
    current_spec = OFFICIAL_AGENT_SPEC_BY_SLUG["arclayer-coordinator"]
    legacy_spec = replace(
        current_spec,
        version_number=1,
        tool_grants=(HUMAN_REQUEST_INPUT_TOOL,),
    )
    repository = AgentCatalogRepository()

    async with in_transaction() as conn:
        definition = await repository._sync_definition(spec=legacy_spec, conn=conn)
        legacy_version = await repository._sync_version(spec=legacy_spec, definition=definition, conn=conn)
        assignment = await repository._sync_assignment(
            workspace_id=workspace.id,
            spec=legacy_spec,
            definition=definition,
            version=legacy_version,
            conn=conn,
        )
        assignment.enabled = False
        assignment.is_default = False
        assignment.is_pinned = False
        assignment.sort_order = 99
        await assignment.save(
            using_db=conn,
            update_fields=["enabled", "is_default", "is_pinned", "sort_order"],
        )

    legacy_checksum = legacy_version.content_checksum
    await AgentCatalogService(get_settings()).ensure_official_assignments(workspace_id=workspace.id)
    await assignment.refresh_from_db()
    await legacy_version.refresh_from_db()

    assert assignment.version_id == current_spec.version_id
    assert assignment.enabled is False
    assert assignment.is_default is False
    assert assignment.is_pinned is False
    assert assignment.sort_order == 99
    assert legacy_version.content_checksum == legacy_checksum
    assert legacy_version.tool_grants == [HUMAN_REQUEST_INPUT_TOOL]
    assert await AgentVersionRecord.filter(definition_id=current_spec.agent_id).count() == 2
