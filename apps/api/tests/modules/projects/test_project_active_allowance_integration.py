from __future__ import annotations

from asyncio import gather
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest

from src.config import get_settings
from src.core.exceptions import Conflict
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
from src.models.organization.org_membership import OrgMembership, OrgRole
from src.models.projects._enums import ProjectAuthoringMode
from src.models.projects.project import ProjectRecord
from src.models.workspaces.workspace import Workspace
from src.modules.auth.repository import UserRepository
from src.modules.auth.tokens.service import hash_password
from src.modules.organization.repository import OrganizationRepository
from src.modules.projects.active_project_allowance import ACTIVE_PROJECT_RESOURCE_KEY
from src.modules.projects.schema import ProjectCreateRequest
from src.modules.projects.service import build_project_service

pytestmark = pytest.mark.integration


async def _create_limited_workspace(*, limit: int) -> tuple[Workspace, UUID]:
    settings = get_settings()
    organization = await OrganizationRepository().create_organization(
        slug=f"project-allowance-{uuid4().hex}",
        name="Project allowance",
    )
    owner = await UserRepository().create_user(
        username=f"project_allowance_{uuid4().hex[:8]}",
        email=f"project-allowance-{uuid4().hex[:8]}@example.com",
        display_name="Project allowance owner",
        password_hash=hash_password("owner_pass_123", settings.auth),
    )
    await OrgMembership.create(
        organization_id=organization.id,
        user_id=owner.id,
        role=OrgRole.OWNER,
        role_code=OrgRole.OWNER.value,
        status="active",
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Project allowance workspace",
        owner_user_id=owner.id,
        created_by_user_id=owner.id,
        is_active=True,
    )
    now = datetime.now(UTC)
    plan = await CommercePlan.create(code=f"project-allowance-{uuid4().hex[:24]}", is_active=True)
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
        limit_kind=ResourceLimitKind.LIMITED,
        limit_value=limit,
    )
    await WorkspaceSubscription.create(
        workspace_id=workspace.id,
        plan_revision_id=revision.id,
        status=SubscriptionStatus.ACTIVE,
        billing_cycle=BillingCycle.MONTHLY,
        current_period_start=now,
        current_period_end=now + timedelta(days=31),
        billing_provider="test",
    )
    return workspace, owner.id


def _create_payload(*, workspace_id: UUID, suffix: str) -> ProjectCreateRequest:
    return ProjectCreateRequest(
        workspace_id=workspace_id,
        authoring_mode=ProjectAuthoringMode.BUILDER_MANAGED,
        name=f"Concurrent project {suffix}",
        slug=f"concurrent-{suffix}",
    )


async def test_concurrent_project_creates_claim_only_one_last_active_project_slot(db_schema) -> None:
    _ = db_schema
    settings = get_settings()
    workspace, owner_user_id = await _create_limited_workspace(limit=1)

    results = await gather(
        build_project_service(settings).create_project(
            workspace_id=workspace.id,
            payload=_create_payload(workspace_id=workspace.id, suffix="one"),
            actor_user_id=owner_user_id,
        ),
        build_project_service(settings).create_project(
            workspace_id=workspace.id,
            payload=_create_payload(workspace_id=workspace.id, suffix="two"),
            actor_user_id=owner_user_id,
        ),
        return_exceptions=True,
    )

    created = [result for result in results if not isinstance(result, BaseException)]
    failures = [result for result in results if isinstance(result, BaseException)]
    assert len(created) == 1
    assert len(failures) == 1
    assert isinstance(failures[0], Conflict)
    assert failures[0].error == "WORKSPACE_ACTIVE_PROJECT_LIMIT_REACHED"
    assert await ProjectRecord.filter(workspace_id=workspace.id, is_active=True).count() == 1
