from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from tortoise.transactions import in_transaction

from src.config import get_settings
from src.core.exceptions import Conflict, ServiceUnavailable
from src.models.analytics.audit_event import AuditEvent
from src.models.commerce.billing import (
    BillingCycle,
    CommerceEntitlementDefinition,
    CommercePlan,
    CommercePlanRevision,
    CommercePlanRevisionEntitlement,
    FeatureAccessAllocationScope,
    FeatureAccessAssignment,
    FeatureAccessCommandReceipt,
    PlanAccessConvergence,
    PlanAccessConvergenceFeatureOutcome,
    PlanRevisionStatus,
    ResourceLimitKind,
    SubscriptionStatus,
    WorkspaceCommercialAccess,
    WorkspaceSubscription,
)
from src.models.commerce.feature_access import FeatureAccessConvergenceOutboxRecord
from src.models.workspaces.workspace import Workspace, WorkspaceMembership, WorkspaceMembershipStatus
from src.modules.auth.repository import UserRepository
from src.modules.auth.tokens.service import hash_password
from src.modules.commerce.convergence.schema import (
    FeatureAccessConvergenceCommand,
    FeatureAccessScopeRevisionImpact,
)
from src.modules.commerce.entitlement_schema import WORKSPACE_ROLES_MANAGE_ENTITLEMENT
from src.modules.commerce.feature_access.composition import (
    build_feature_access_convergence_participant,
    build_feature_access_service,
)
from src.modules.commerce.feature_access.contracts import (
    AssignFeatureAccessCommand,
    FeatureAccessConvergenceResult,
    RevokeFeatureAccessCommand,
)
from src.modules.commerce.feature_access.convergence_outbox import TortoiseFeatureAccessConvergenceOutbox
from src.modules.commerce.feature_access.read_contracts import (
    EMPTY_FEATURE_ACCESS_METADATA_REGISTRY,
    FeatureAccessCapabilityMetadata,
    FeatureAccessMetadataRegistry,
)
from src.modules.commerce.feature_access.read_repository import TortoiseFeatureAccessReadRepository
from src.modules.commerce.feature_access.repository import TortoiseFeatureAccessRepository
from src.modules.commerce.feature_access.service import FeatureAccessMembershipReleaseParticipant
from src.modules.organization.repository import OrganizationRepository

pytestmark = pytest.mark.integration

FEATURE_KEY = "agents.member-access"


@dataclass(frozen=True)
class _FeatureWorkspace:
    workspace_id: UUID
    owner_user_id: UUID
    membership_ids: tuple[UUID, UUID]
    source_revision_id: UUID
    feature_definition_id: UUID


class _ConvergenceOutbox:
    def __init__(self) -> None:
        self.results: list[FeatureAccessConvergenceResult] = []

    async def append_feature_access_convergence(
        self,
        *,
        result: FeatureAccessConvergenceResult,
        conn,
    ) -> None:
        _ = conn
        self.results.append(result)


async def _create_feature_workspace(*, limit: int | None = 1) -> _FeatureWorkspace:
    settings = get_settings()
    organization = await OrganizationRepository().create_organization(
        slug=f"feature-access-{uuid4().hex}",
        name="Feature access",
    )
    users = []
    for index in range(3):
        users.append(
            await UserRepository().create_user(
                username=f"feature_access_{index}_{uuid4().hex[:8]}",
                email=f"feature-access-{index}-{uuid4().hex[:8]}@example.com",
                display_name=f"Feature access {index}",
                password_hash=hash_password("feature_access_pass_123", settings.auth),
            )
        )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Feature access workspace",
        owner_user_id=users[0].id,
        created_by_user_id=users[0].id,
        is_active=True,
    )
    memberships = [
        await WorkspaceMembership.create(
            workspace_id=workspace.id,
            user_id=user.id,
            status=WorkspaceMembershipStatus.ACTIVE,
        )
        for user in users
    ]
    now = datetime.now(UTC)
    plan = await CommercePlan.create(code=f"feature-access-{uuid4().hex[:24]}", is_active=True)
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
    roles_definition, _ = await CommerceEntitlementDefinition.get_or_create(
        key=WORKSPACE_ROLES_MANAGE_ENTITLEMENT,
        defaults={
            "supports_workspace_allocation": True,
            "supports_member_seat_allocation": False,
            "is_active": True,
        },
    )
    assert roles_definition.supports_workspace_allocation is True
    assert roles_definition.supports_member_seat_allocation is False
    assert roles_definition.is_active is True
    feature_definition, _ = await CommerceEntitlementDefinition.get_or_create(
        key=FEATURE_KEY,
        defaults={
            "supports_workspace_allocation": False,
            "supports_member_seat_allocation": True,
            "is_active": True,
        },
    )
    assert feature_definition.supports_workspace_allocation is False
    assert feature_definition.supports_member_seat_allocation is True
    assert feature_definition.is_active is True
    await CommercePlanRevisionEntitlement.create(
        plan_revision_id=revision.id,
        entitlement_id=roles_definition.id,
        is_included=True,
        allocation_mode="workspace",
    )
    await CommercePlanRevisionEntitlement.create(
        plan_revision_id=revision.id,
        entitlement_id=feature_definition.id,
        is_included=True,
        allocation_mode="member_seat",
        seat_limit_kind=ResourceLimitKind.UNLIMITED if limit is None else ResourceLimitKind.LIMITED,
        seat_limit_value=limit,
    )
    subscription = await WorkspaceSubscription.create(
        workspace_id=workspace.id,
        plan_revision_id=revision.id,
        status=SubscriptionStatus.ACTIVE,
        billing_cycle=BillingCycle.MONTHLY,
        current_period_start=now,
        current_period_end=now + timedelta(days=31),
        billing_provider="test",
        revision=1,
    )
    await WorkspaceCommercialAccess.create(
        workspace_id=workspace.id,
        subscription_id=subscription.id,
        state="normal",
        deadline_at=None,
        state_revision=1,
        source_identity=f"feature-access:{workspace.id}:normal",
    )
    return _FeatureWorkspace(
        workspace_id=workspace.id,
        owner_user_id=users[0].id,
        membership_ids=(memberships[1].id, memberships[2].id),
        source_revision_id=revision.id,
        feature_definition_id=feature_definition.id,
    )


async def _create_target_revision(
    fixture: _FeatureWorkspace,
    *,
    feature_limit: int | None,
    sequence: int = 2,
) -> CommercePlanRevision:
    source = await CommercePlanRevision.get(id=fixture.source_revision_id)
    target = await CommercePlanRevision.create(
        plan_id=source.plan_id,
        sequence=sequence,
        status=PlanRevisionStatus.PUBLISHED,
        name_i18n_key="PLAN_TARGET_NAME",
        description_i18n_key="PLAN_TARGET_DESCRIPTION",
        credit_grant_amount=0,
        credit_refresh_interval="none",
        credit_value_micros=1,
        currency="USD",
        content_hash=uuid4().hex,
        published_at=datetime.now(UTC),
        is_selling=False,
    )
    if feature_limit is not None:
        await CommercePlanRevisionEntitlement.create(
            plan_revision_id=target.id,
            entitlement_id=fixture.feature_definition_id,
            is_included=True,
            allocation_mode="member_seat",
            seat_limit_kind=ResourceLimitKind.LIMITED,
            seat_limit_value=feature_limit,
        )
    return target


def _assign_command(
    fixture: _FeatureWorkspace,
    *,
    membership_id: UUID,
    expected_revision: int,
    key: str,
) -> AssignFeatureAccessCommand:
    return AssignFeatureAccessCommand(
        workspace_id=fixture.workspace_id,
        actor_user_id=fixture.owner_user_id,
        entitlement_key=FEATURE_KEY,
        membership_id=membership_id,
        expected_revision=expected_revision,
        idempotency_key=key,
    )


async def test_postgres_serializes_the_last_limited_feature_access_place(db_schema) -> None:
    _ = db_schema
    fixture = await _create_feature_workspace(limit=1)
    service = build_feature_access_service(get_settings())

    results = await asyncio.gather(
        service.assign(
            _assign_command(
                fixture,
                membership_id=fixture.membership_ids[0],
                expected_revision=0,
                key="last-place-a",
            )
        ),
        service.assign(
            _assign_command(
                fixture,
                membership_id=fixture.membership_ids[1],
                expected_revision=0,
                key="last-place-b",
            )
        ),
        return_exceptions=True,
    )

    successes = [result for result in results if not isinstance(result, BaseException)]
    failures = [result for result in results if isinstance(result, BaseException)]
    assert len(successes) == 1
    assert len(failures) == 1
    assert isinstance(failures[0], Conflict)
    assert failures[0].error == "FEATURE_ACCESS_REVISION_CONFLICT"
    assert failures[0].meta is not None
    assert failures[0].meta["revision"] == 1
    assert len(failures[0].meta["assignedMembershipIds"]) == 1
    assert await FeatureAccessAssignment.filter(workspace_id=fixture.workspace_id, ended_at=None).count() == 1
    scope = await FeatureAccessAllocationScope.get(workspace_id=fixture.workspace_id)
    assert scope.revision == 1


async def test_receipts_replay_original_result_without_restoring_later_revoked_access(db_schema) -> None:
    _ = db_schema
    fixture = await _create_feature_workspace(limit=1)
    service = build_feature_access_service(get_settings())
    membership_id = fixture.membership_ids[0]
    assign = _assign_command(
        fixture,
        membership_id=membership_id,
        expected_revision=0,
        key="durable-assign",
    )

    assigned = await service.assign(assign)
    revoked = await service.revoke(
        RevokeFeatureAccessCommand(
            workspace_id=fixture.workspace_id,
            actor_user_id=fixture.owner_user_id,
            entitlement_key=FEATURE_KEY,
            membership_id=membership_id,
            expected_revision=assigned.state.revision,
            idempotency_key="durable-revoke",
        )
    )
    replayed = await service.assign(assign)

    assert revoked.state.revision == 2
    assert replayed.replayed is True
    assert replayed.state == assigned.state
    assert await FeatureAccessAssignment.filter(workspace_id=fixture.workspace_id, ended_at=None).count() == 0
    with pytest.raises(Conflict) as conflict:
        await service.assign(
            _assign_command(
                fixture,
                membership_id=fixture.membership_ids[1],
                expected_revision=2,
                key="durable-assign",
            )
        )
    assert conflict.value.error == "IDEMPOTENCY_KEY_CONFLICT"
    assert conflict.value.meta is not None
    assert conflict.value.meta["revision"] == 2
    assert conflict.value.meta["assignedMembershipIds"] == []
    assert await FeatureAccessCommandReceipt.all().count() == 2
    assert await AuditEvent.filter(event_name__startswith="workspace.feature_access.").count() == 2


async def test_membership_release_is_transactional_idempotent_and_never_restores_on_rejoin(db_schema) -> None:
    _ = db_schema
    fixture = await _create_feature_workspace(limit=1)
    settings = get_settings()
    repository = TortoiseFeatureAccessRepository(settings)
    service = build_feature_access_service(settings)
    membership_id = fixture.membership_ids[0]
    await service.assign(
        _assign_command(
            fixture,
            membership_id=membership_id,
            expected_revision=0,
            key="release-setup",
        )
    )
    participant = FeatureAccessMembershipReleaseParticipant(repository)

    async with in_transaction() as conn:
        membership = await WorkspaceMembership.filter(id=membership_id).using_db(conn).select_for_update().get()
        membership.status = WorkspaceMembershipStatus.DISABLED
        await membership.save(update_fields=["status", "updated_at"], using_db=conn)
        released = await participant.release_for_membership_end(
            workspace_id=fixture.workspace_id,
            membership_id=membership_id,
            lifecycle_idempotency_key="membership-ended",
            conn=conn,
        )
    async with in_transaction() as conn:
        replayed = await participant.release_for_membership_end(
            workspace_id=fixture.workspace_id,
            membership_id=membership_id,
            lifecycle_idempotency_key="membership-ended",
            conn=conn,
        )

    assert released.released_assignment_count == 1
    assert replayed.released_assignment_count == 1
    assert await FeatureAccessAssignment.filter(workspace_id=fixture.workspace_id, ended_at=None).count() == 0
    assignment = await FeatureAccessAssignment.get(workspace_id=fixture.workspace_id, membership_id=membership_id)
    assert assignment.ended_reason == "membership_ended"
    membership = await WorkspaceMembership.get(id=membership_id)
    membership.status = WorkspaceMembershipStatus.ACTIVE
    await membership.save(update_fields=["status", "updated_at"])
    assert await FeatureAccessAssignment.filter(workspace_id=fixture.workspace_id, ended_at=None).count() == 0


async def test_plan_convergence_is_review_bound_idempotent_and_writes_receipt_outcomes_and_outbox(db_schema) -> None:
    _ = db_schema
    fixture = await _create_feature_workspace(limit=2)
    service = build_feature_access_service(get_settings())
    first = await service.assign(
        _assign_command(
            fixture,
            membership_id=fixture.membership_ids[0],
            expected_revision=0,
            key="convergence-setup-a",
        )
    )
    await service.assign(
        _assign_command(
            fixture,
            membership_id=fixture.membership_ids[1],
            expected_revision=first.state.revision,
            key="convergence-setup-b",
        )
    )
    target = await _create_target_revision(fixture, feature_limit=1)
    assignments = await FeatureAccessAssignment.filter(
        workspace_id=fixture.workspace_id,
        ended_at=None,
    ).order_by("membership_id")
    retained = assignments[0]
    retired = assignments[1]
    convergence_id = uuid4()
    effective_at = datetime.now(UTC)
    await PlanAccessConvergence.create(
        id=convergence_id,
        workspace_id=fixture.workspace_id,
        source_plan_revision_id=fixture.source_revision_id,
        target_plan_revision_id=target.id,
        preview_token_hash=uuid4().hex,
        effective_at=effective_at,
        status="scheduled",
        revision=1,
    )
    command = FeatureAccessConvergenceCommand(
        convergence_id=convergence_id,
        workspace_id=fixture.workspace_id,
        target_revision_id=target.id,
        effective_at=effective_at,
        reviewed_assignment_ids=tuple(assignment.id for assignment in assignments),
        retained_assignment_ids=(retained.id,),
        expected_scope_revisions=(FeatureAccessScopeRevisionImpact(entitlement_key=FEATURE_KEY, revision=2),),
        idempotency_key="apply-reviewed-feature-access",
    )
    await PlanAccessConvergenceFeatureOutcome.bulk_create([
        PlanAccessConvergenceFeatureOutcome(
            convergence_id=convergence_id,
            assignment_id=assignment.id,
            is_retained=assignment.id == retained.id,
        )
        for assignment in assignments
    ])
    participant = build_feature_access_convergence_participant(
        get_settings(),
        outbox=TortoiseFeatureAccessConvergenceOutbox(),
    )

    async with in_transaction() as conn:
        await participant.apply_feature_access_convergence(command=command, conn=conn)
    async with in_transaction() as conn:
        await participant.apply_feature_access_convergence(command=command, conn=conn)
    with pytest.raises(Conflict) as idempotency_conflict:
        async with in_transaction() as conn:
            await participant.apply_feature_access_convergence(
                command=command.model_copy(update={"retained_assignment_ids": (retired.id,)}),
                conn=conn,
            )

    scope = await FeatureAccessAllocationScope.get(workspace_id=fixture.workspace_id)
    assert scope.revision == 3
    assert await FeatureAccessAssignment.filter(id=retained.id, ended_at=None).exists()
    ended = await FeatureAccessAssignment.get(id=retired.id)
    assert ended.ended_at == effective_at
    assert ended.ended_reason == "plan_convergence"
    receipt = await FeatureAccessCommandReceipt.get(scope_id=scope.id, operation="convergence")
    assert receipt.result_revision == 3
    outcomes = (
        await PlanAccessConvergenceFeatureOutcome
        .filter(convergence_id=convergence_id)
        .order_by("assignment_id")
        .values_list("assignment_id", "is_retained")
    )
    assert {(UUID(str(assignment_id)), is_retained) for assignment_id, is_retained in outcomes} == {
        (retained.id, True),
        (retired.id, False),
    }
    outbox = await FeatureAccessConvergenceOutboxRecord.get(convergence_id=convergence_id)
    assert outbox.workspace_id == fixture.workspace_id
    assert outbox.payload["endedAssignmentIds"] == [str(retired.id)]
    assert await AuditEvent.filter(event_name="workspace.feature_access.plan_converged").count() == 1
    assert idempotency_conflict.value.error == "FEATURE_ACCESS_CONVERGENCE_IDEMPOTENCY_CONFLICT"


async def test_plan_convergence_rejects_stale_review_without_partial_writes(db_schema) -> None:
    _ = db_schema
    fixture = await _create_feature_workspace(limit=2)
    service = build_feature_access_service(get_settings())
    assigned = await service.assign(
        _assign_command(
            fixture,
            membership_id=fixture.membership_ids[0],
            expected_revision=0,
            key="stale-convergence-setup",
        )
    )
    target = await _create_target_revision(fixture, feature_limit=None)
    assignment = await FeatureAccessAssignment.get(
        workspace_id=fixture.workspace_id,
        membership_id=fixture.membership_ids[0],
        ended_at=None,
    )
    convergence_id = uuid4()
    await PlanAccessConvergence.create(
        id=convergence_id,
        workspace_id=fixture.workspace_id,
        source_plan_revision_id=fixture.source_revision_id,
        target_plan_revision_id=target.id,
        preview_token_hash=uuid4().hex,
        effective_at=datetime.now(UTC),
        status="scheduled",
        revision=1,
    )
    command = FeatureAccessConvergenceCommand(
        convergence_id=convergence_id,
        workspace_id=fixture.workspace_id,
        target_revision_id=target.id,
        effective_at=datetime.now(UTC),
        reviewed_assignment_ids=(),
        retained_assignment_ids=(),
        expected_scope_revisions=(
            FeatureAccessScopeRevisionImpact(entitlement_key=FEATURE_KEY, revision=assigned.state.revision),
        ),
        idempotency_key="stale-reviewed-feature-access",
    )
    outbox = _ConvergenceOutbox()
    participant = build_feature_access_convergence_participant(get_settings(), outbox=outbox)

    with pytest.raises(Conflict) as exc:
        async with in_transaction() as conn:
            await participant.apply_feature_access_convergence(command=command, conn=conn)

    assert exc.value.error == "FEATURE_ACCESS_CONVERGENCE_ASSIGNMENTS_STALE"
    assert await FeatureAccessAssignment.filter(id=assignment.id, ended_at=None).exists()
    assert await FeatureAccessCommandReceipt.filter(operation="convergence").count() == 0
    assert await PlanAccessConvergenceFeatureOutcome.filter(convergence_id=convergence_id).count() == 0
    assert outbox.results == []


async def test_plan_convergence_rejects_unsupported_or_over_capacity_retained_assignments(db_schema) -> None:
    _ = db_schema
    fixture = await _create_feature_workspace(limit=2)
    service = build_feature_access_service(get_settings())
    first = await service.assign(
        _assign_command(
            fixture,
            membership_id=fixture.membership_ids[0],
            expected_revision=0,
            key="invalid-retained-setup-a",
        )
    )
    await service.assign(
        _assign_command(
            fixture,
            membership_id=fixture.membership_ids[1],
            expected_revision=first.state.revision,
            key="invalid-retained-setup-b",
        )
    )
    assignments = tuple(
        await FeatureAccessAssignment.filter(workspace_id=fixture.workspace_id, ended_at=None).order_by("id")
    )
    unsupported_target = await _create_target_revision(fixture, feature_limit=None)
    limited_target = await _create_target_revision(fixture, feature_limit=1, sequence=3)
    outbox = _ConvergenceOutbox()
    participant = build_feature_access_convergence_participant(get_settings(), outbox=outbox)

    for target, error in (
        (unsupported_target, "FEATURE_ACCESS_CONVERGENCE_RETAINED_UNSUPPORTED"),
        (limited_target, "FEATURE_ACCESS_CONVERGENCE_RETAINED_CAPACITY_EXCEEDED"),
    ):
        convergence_id = uuid4()
        effective_at = datetime.now(UTC)
        await PlanAccessConvergence.create(
            id=convergence_id,
            workspace_id=fixture.workspace_id,
            source_plan_revision_id=fixture.source_revision_id,
            target_plan_revision_id=target.id,
            preview_token_hash=uuid4().hex,
            effective_at=effective_at,
            status="scheduled",
            revision=1,
        )
        command = FeatureAccessConvergenceCommand(
            convergence_id=convergence_id,
            workspace_id=fixture.workspace_id,
            target_revision_id=target.id,
            effective_at=effective_at,
            reviewed_assignment_ids=tuple(assignment.id for assignment in assignments),
            retained_assignment_ids=tuple(assignment.id for assignment in assignments),
            expected_scope_revisions=(FeatureAccessScopeRevisionImpact(entitlement_key=FEATURE_KEY, revision=2),),
            idempotency_key=f"invalid-retained-{target.id}",
        )

        with pytest.raises(Conflict) as exc:
            async with in_transaction() as conn:
                await participant.apply_feature_access_convergence(command=command, conn=conn)

        assert exc.value.error == error

    assert await FeatureAccessAssignment.filter(workspace_id=fixture.workspace_id, ended_at=None).count() == 2
    assert await FeatureAccessCommandReceipt.filter(operation="convergence").count() == 0
    assert await PlanAccessConvergenceFeatureOutcome.all().count() == 0
    assert outbox.results == []


async def test_read_repository_returns_registered_limited_and_unlimited_capability_state(db_schema) -> None:
    _ = db_schema
    limited_fixture = await _create_feature_workspace(limit=2)
    unlimited_fixture = await _create_feature_workspace(limit=None)
    service = build_feature_access_service(get_settings())
    await service.assign(
        _assign_command(
            limited_fixture,
            membership_id=limited_fixture.membership_ids[0],
            expected_revision=0,
            key="read-limited-assignment",
        )
    )
    await service.assign(
        _assign_command(
            unlimited_fixture,
            membership_id=unlimited_fixture.membership_ids[0],
            expected_revision=0,
            key="read-unlimited-assignment",
        )
    )
    repository = TortoiseFeatureAccessReadRepository(
        FeatureAccessMetadataRegistry((
            FeatureAccessCapabilityMetadata(
                entitlement_key=FEATURE_KEY,
                name_i18n_key="featureAccess:AGENT_ACCESS_NAME",
                description_i18n_key="featureAccess:AGENT_ACCESS_DESCRIPTION",
            ),
        ))
    )

    async with in_transaction() as conn:
        limited = await repository.read_workspace_feature_access(
            workspace_id=limited_fixture.workspace_id,
            actor_user_id=limited_fixture.owner_user_id,
            conn=conn,
        )
        unlimited = await repository.read_workspace_feature_access(
            workspace_id=unlimited_fixture.workspace_id,
            actor_user_id=unlimited_fixture.owner_user_id,
            conn=conn,
        )

    assert limited is not None and unlimited is not None
    assert limited.capabilities[0].capacity.kind == "limited"
    assert limited.capabilities[0].revision == 1
    assert limited.capabilities[0].assigned_membership_ids == (limited_fixture.membership_ids[0],)
    assert unlimited.capabilities[0].capacity.kind == "unlimited"
    assert unlimited.capabilities[0].metadata.name_i18n_key == "featureAccess:AGENT_ACCESS_NAME"


async def test_read_repository_default_empty_registry_only_allows_a_real_empty_result(db_schema) -> None:
    _ = db_schema
    fixture = await _create_feature_workspace(limit=1)
    await CommercePlanRevisionEntitlement.filter(
        plan_revision_id=fixture.source_revision_id,
        entitlement_id=fixture.feature_definition_id,
    ).delete()
    repository = TortoiseFeatureAccessReadRepository(EMPTY_FEATURE_ACCESS_METADATA_REGISTRY)

    async with in_transaction() as conn:
        result = await repository.read_workspace_feature_access(
            workspace_id=fixture.workspace_id,
            actor_user_id=fixture.owner_user_id,
            conn=conn,
        )

    assert result is not None
    assert result.capabilities == ()


async def test_read_repository_rejects_active_member_seat_capability_without_metadata(db_schema) -> None:
    _ = db_schema
    fixture = await _create_feature_workspace(limit=1)
    service = build_feature_access_service(get_settings())
    await service.assign(
        _assign_command(
            fixture,
            membership_id=fixture.membership_ids[0],
            expected_revision=0,
            key="read-metadata-required",
        )
    )
    repository = TortoiseFeatureAccessReadRepository(EMPTY_FEATURE_ACCESS_METADATA_REGISTRY)

    with pytest.raises(ServiceUnavailable) as exc:
        async with in_transaction() as conn:
            await repository.read_workspace_feature_access(
                workspace_id=fixture.workspace_id,
                actor_user_id=fixture.owner_user_id,
                conn=conn,
            )

    assert exc.value.error == "FEATURE_ACCESS_METADATA_NOT_REGISTERED"
