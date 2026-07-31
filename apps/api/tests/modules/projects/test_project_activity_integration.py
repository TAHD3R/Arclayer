from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from src.config import get_settings
from src.models.analytics.audit_event import AuditEvent
from src.models.commerce.billing import (
    BillingCycle,
    CommercePlan,
    CommercePlanRevision,
    CommercePlanRevisionResourceAllowance,
    CommerceResourceDefinition,
    PlanRevisionStatus,
    ResourceLimitKind,
    SubscriptionStatus,
    WorkspaceSubscription,
)
from src.models.domains.domain_binding import DomainBindingRecord, DomainBindingSource
from src.models.organization.org_membership import OrgMembership, OrgRole
from src.models.projects._enums import ProjectAuthoringMode, ProjectAuthoringState
from src.models.projects.environment import ProjectEnvironmentRecord
from src.models.projects.membership import ProjectMembership
from src.models.projects.project import ProjectRecord
from src.models.projects.runtime import ProjectRuntimeRecord
from src.models.sites.site import SiteRecord
from src.models.workspaces.workspace import Workspace
from src.modules.auth.repository import UserRepository
from src.modules.auth.tokens.service import hash_password
from src.modules.organization.repository import OrganizationRepository
from src.modules.projects import service as project_service_module
from src.modules.projects.active_project_allowance import ACTIVE_PROJECT_RESOURCE_KEY
from src.modules.projects.schema import ProjectCreateRequest, ProjectUpdateRequest
from src.modules.projects.service import build_project_service

pytestmark = pytest.mark.integration


async def _bind_unlimited_active_project_allowance(*, workspace_id) -> None:
    now = datetime.now(UTC)
    plan = await CommercePlan.create(code=f"project-activity-{uuid4().hex[:24]}", is_active=True)
    revision = await CommercePlanRevision.create(
        plan_id=plan.id,
        sequence=1,
        status=PlanRevisionStatus.PUBLISHED,
        name_i18n_key="PLAN_TEST_NAME",
        description_i18n_key="PLAN_TEST_DESCRIPTION",
        credit_grant_amount=0,
        credit_refresh_interval="none",
        credit_value_micros=1,
        currency="USD",
        content_hash=uuid4().hex,
        published_at=now,
        is_selling=True,
    )
    resource = await CommerceResourceDefinition.create(key=ACTIVE_PROJECT_RESOURCE_KEY, is_active=True)
    await CommercePlanRevisionResourceAllowance.create(
        plan_revision_id=revision.id,
        resource_id=resource.id,
        limit_kind=ResourceLimitKind.UNLIMITED,
        limit_value=None,
    )
    await WorkspaceSubscription.create(
        workspace_id=workspace_id,
        plan_revision_id=revision.id,
        status=SubscriptionStatus.ACTIVE,
        billing_cycle=BillingCycle.MONTHLY,
        current_period_start=now,
        current_period_end=now + timedelta(days=31),
        billing_provider="test",
    )


async def test_project_create_activity_readback_and_rollback(db_schema, monkeypatch) -> None:
    _ = db_schema
    settings = get_settings()
    service = build_project_service(settings)
    org_repo = OrganizationRepository()
    user_repo = UserRepository()

    org = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Project Create Activity Org")
    owner = await user_repo.create_user(
        username=f"owner_{uuid4().hex[:8]}",
        email=f"owner_{uuid4().hex[:8]}@example.com",
        display_name="Owner",
        password_hash=hash_password("owner_pass_123", settings.auth),
    )
    await OrgMembership.create(
        organization_id=org.id,
        user_id=owner.id,
        role=OrgRole.OWNER,
        role_code=OrgRole.OWNER.value,
        status="active",
    )
    workspace = await Workspace.create(
        organization_id=org.id,
        name="Project Create Workspace",
        is_active=True,
        owner_user_id=owner.id,
        created_by_user_id=owner.id,
    )
    await _bind_unlimited_active_project_allowance(workspace_id=workspace.id)

    created_slug = f"created-{uuid4().hex[:8]}"
    created = await service.create_project(
        workspace_id=workspace.id,
        actor_user_id=owner.id,
        payload=ProjectCreateRequest(
            workspace_id=workspace.id,
            authoring_mode=ProjectAuthoringMode.BUILDER_MANAGED,
            name="Created Project",
            slug=created_slug,
            description="Created description",
        ),
    )

    project = await ProjectRecord.get(id=created.id)
    runtime = await ProjectRuntimeRecord.get(project_id=project.id)
    environment_keys = {
        str(value)
        for value in await ProjectEnvironmentRecord.filter(project_id=project.id).values_list("key", flat=True)
    }
    site = await SiteRecord.get(project_id=project.id, runtime_id=runtime.id)
    binding = await DomainBindingRecord.get(project_id=project.id, runtime_id=runtime.id, site_id=site.id)
    membership = await ProjectMembership.get(project_id=project.id, user_id=owner.id)

    assert project.workspace_id == workspace.id
    assert project.authoring_mode == ProjectAuthoringMode.BUILDER_MANAGED
    assert project.authoring_state == ProjectAuthoringState.READY
    assert project.authoring_revision == 1
    assert project.authoring_resolved_by_user_id == owner.id
    assert project.authoring_resolved_at is not None
    assert environment_keys == {"development", "staging", "production"}
    assert site.workspace_id == workspace.id
    assert binding.source == DomainBindingSource.PLATFORM
    assert binding.is_primary is True
    assert binding.is_verified is True
    assert membership.created_by_user_id == owner.id

    created_event = await AuditEvent.filter(
        event_name="project.created",
        workspace_id=workspace.id,
        actor_user_id=owner.id,
        entity_type="project",
        entity_id=project.id,
    ).first()
    assert created_event is not None
    assert created_event.properties["created"] is True
    assert created_event.properties["slug"] == created_slug
    assert created_event.properties["authoringMode"] == "builder_managed"
    assert created_event.properties["initialized"] == [
        "primary_runtime",
        "environments",
        "runtime_site",
        "platform_domain_binding",
    ]
    assert str(project.id) in str(created_event.properties)
    assert "Created Project" not in str(created_event.properties)
    assert "Created description" not in str(created_event.properties)

    original_write_required_activity_event = project_service_module.write_required_activity_event

    async def _failing_project_created_activity_event(*, settings, payload, conn=None):  # type: ignore[no-untyped-def]
        if payload.event_name == "project.created":
            raise RuntimeError("forced activity write failure: project.created")
        return await original_write_required_activity_event(settings=settings, payload=payload, conn=conn)

    monkeypatch.setattr(
        "src.modules.projects.service.write_required_activity_event",
        _failing_project_created_activity_event,
    )
    rollback_slug = f"rollback-created-{uuid4().hex[:8]}"
    counts_before = {
        "activity": await AuditEvent.filter(event_name="project.created").count(),
        "projects": await ProjectRecord.filter(workspace_id=workspace.id).count(),
        "runtimes": await ProjectRuntimeRecord.all().count(),
        "environments": await ProjectEnvironmentRecord.all().count(),
        "sites": await SiteRecord.all().count(),
        "domain_bindings": await DomainBindingRecord.all().count(),
        "memberships": await ProjectMembership.all().count(),
    }

    with pytest.raises(RuntimeError, match="forced activity write failure: project.created"):
        await service.create_project(
            workspace_id=workspace.id,
            actor_user_id=owner.id,
            payload=ProjectCreateRequest(
                workspace_id=workspace.id,
                authoring_mode=ProjectAuthoringMode.BUILDER_MANAGED,
                name="Rolled Back Created Project",
                slug=rollback_slug,
                description="Rolled back description",
            ),
        )

    assert await AuditEvent.filter(event_name="project.created").count() == counts_before["activity"]
    assert await ProjectRecord.filter(workspace_id=workspace.id).count() == counts_before["projects"]
    assert await ProjectRuntimeRecord.all().count() == counts_before["runtimes"]
    assert await ProjectEnvironmentRecord.all().count() == counts_before["environments"]
    assert await SiteRecord.all().count() == counts_before["sites"]
    assert await DomainBindingRecord.all().count() == counts_before["domain_bindings"]
    assert await ProjectMembership.all().count() == counts_before["memberships"]
    assert not await ProjectRecord.filter(workspace_id=workspace.id, slug=rollback_slug).exists()


async def test_project_metadata_archive_delete_activity_readback_and_rollback(db_schema, monkeypatch) -> None:
    _ = db_schema
    settings = get_settings()
    service = build_project_service(settings)
    org_repo = OrganizationRepository()
    user_repo = UserRepository()

    org = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Project Activity Org")
    owner = await user_repo.create_user(
        username=f"owner_{uuid4().hex[:8]}",
        email=f"owner_{uuid4().hex[:8]}@example.com",
        display_name="Owner",
        password_hash=hash_password("owner_pass_123", settings.auth),
    )
    await OrgMembership.create(
        organization_id=org.id,
        user_id=owner.id,
        role=OrgRole.OWNER,
        role_code=OrgRole.OWNER.value,
        status="active",
    )
    workspace = await Workspace.create(
        organization_id=org.id,
        name="Project Workspace",
        is_active=True,
        owner_user_id=owner.id,
        created_by_user_id=owner.id,
    )
    project = await ProjectRecord.create(
        workspace_id=workspace.id,
        slug=f"project-{uuid4().hex[:8]}",
        name="Original Project",
        description="Original description",
        is_active=True,
        created_by_user_id=owner.id,
    )

    await service.update_project(
        project_id=project.id,
        actor_user_id=owner.id,
        payload=ProjectUpdateRequest(
            name="Updated Project",
            description="Updated description",
            icon_color="#123456",
        ),
    )
    updated_event = await AuditEvent.filter(
        event_name="project.updated",
        workspace_id=workspace.id,
        actor_user_id=owner.id,
        entity_type="project",
        entity_id=project.id,
    ).first()
    assert updated_event is not None
    assert updated_event.properties["updated_fields"] == ["description", "icon_color", "name"]
    assert "Updated Project" not in str(updated_event.properties)
    assert "Updated description" not in str(updated_event.properties)

    await service.archive_project(project_id=project.id, actor_user_id=owner.id)
    archived_event = await AuditEvent.filter(
        event_name="project.archived",
        workspace_id=workspace.id,
        actor_user_id=owner.id,
        entity_type="project",
        entity_id=project.id,
    ).first()
    assert archived_event is not None
    assert archived_event.properties["archived"] is True

    original_write_required_activity_event = project_service_module.write_required_activity_event

    async def _failing_project_activity_event(*, settings, payload, conn=None):  # type: ignore[no-untyped-def]
        if payload.event_name in {"project.updated", "project.archived", "project.deleted"}:
            raise RuntimeError(f"forced activity write failure: {payload.event_name}")
        return await original_write_required_activity_event(settings=settings, payload=payload, conn=conn)

    monkeypatch.setattr(
        "src.modules.projects.service.write_required_activity_event",
        _failing_project_activity_event,
    )
    update_count_before = await AuditEvent.filter(event_name="project.updated").count()
    with pytest.raises(RuntimeError, match="forced activity write failure: project.updated"):
        await service.update_project(
            project_id=project.id,
            actor_user_id=owner.id,
            payload=ProjectUpdateRequest(name="Rolled Back Project"),
        )
    await project.refresh_from_db()
    assert await AuditEvent.filter(event_name="project.updated").count() == update_count_before
    assert project.name == "Updated Project"

    archive_count_before = await AuditEvent.filter(event_name="project.archived").count()
    with pytest.raises(RuntimeError, match="forced activity write failure: project.archived"):
        await service.archive_project(project_id=project.id, actor_user_id=owner.id)
    await project.refresh_from_db()
    assert await AuditEvent.filter(event_name="project.archived").count() == archive_count_before
    assert project.is_active is False

    monkeypatch.setattr(
        "src.modules.projects.service.write_required_activity_event",
        original_write_required_activity_event,
    )
    delete_project = await ProjectRecord.create(
        workspace_id=workspace.id,
        slug=f"delete-{uuid4().hex[:8]}",
        name="Delete Project",
        is_active=True,
        created_by_user_id=owner.id,
    )
    await service.delete_project(project_id=delete_project.id, actor_user_id=owner.id)
    deleted_event = await AuditEvent.filter(
        event_name="project.deleted",
        workspace_id=workspace.id,
        actor_user_id=owner.id,
        entity_type="project",
        entity_id=delete_project.id,
    ).first()
    assert deleted_event is not None
    assert deleted_event.properties["deleted"] is True
    assert not await ProjectRecord.filter(id=delete_project.id).exists()

    rollback_delete_project = await ProjectRecord.create(
        workspace_id=workspace.id,
        slug=f"rollback-delete-{uuid4().hex[:8]}",
        name="Rollback Delete Project",
        is_active=True,
        created_by_user_id=owner.id,
    )
    monkeypatch.setattr(
        "src.modules.projects.service.write_required_activity_event",
        _failing_project_activity_event,
    )
    delete_count_before = await AuditEvent.filter(event_name="project.deleted").count()
    with pytest.raises(RuntimeError, match="forced activity write failure: project.deleted"):
        await service.delete_project(project_id=rollback_delete_project.id, actor_user_id=owner.id)
    assert await AuditEvent.filter(event_name="project.deleted").count() == delete_count_before
    assert await ProjectRecord.filter(id=rollback_delete_project.id).exists()
