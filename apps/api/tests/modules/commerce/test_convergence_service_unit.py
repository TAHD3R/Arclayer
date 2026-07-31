from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import cast
from uuid import UUID, uuid4

import pytest
from fastapi.routing import APIRoute
from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import get_settings
from src.core.exceptions import ServiceUnavailable
from src.modules.commerce.convergence import composition
from src.modules.commerce.convergence.router import router as convergence_router
from src.modules.commerce.convergence.schema import (
    ConvergenceImpactSnapshot,
    ConvergencePreview,
    ConvergencePreviewRequest,
    ConvergenceReceipt,
    FeatureAccessScopeRevisionImpact,
    FeatureSeatAssignmentImpact,
    PlanRevisionRef,
    ProviderConfirmedConvergenceApplication,
)
from src.modules.commerce.convergence.service import (
    ConvergenceRepository,
    FeatureAccessConvergenceParticipant,
    PlanAccessConvergenceService,
)
from src.modules.commerce.feature_access.convergence_outbox import TortoiseFeatureAccessConvergenceOutbox


def test_product_convergence_router_does_not_expose_direct_apply() -> None:
    assert all(not route.path.endswith("/apply") for route in convergence_router.routes if isinstance(route, APIRoute))


class _Allowance:
    def __init__(self) -> None:
        self.calls: list[tuple[UUID, UUID]] = []

    async def assert_eligible(self, *, prospective_owner_user_id, excluding_workspace_id, conn):  # type: ignore[no-untyped-def]
        _ = conn
        self.calls.append((prospective_owner_user_id, excluding_workspace_id))


class _Repository:
    def __init__(self, snapshot: ConvergenceImpactSnapshot) -> None:
        self.snapshot = snapshot
        self.previewed = False

    async def capture_impact_snapshot(
        self, *, workspace_id, source_revision_id, target_revision_id, effective_at, conn
    ):  # type: ignore[no-untyped-def]
        _ = (workspace_id, source_revision_id, target_revision_id, effective_at, conn)
        return self.snapshot

    async def save_preview(self, *, preview, audit, conn):  # type: ignore[no-untyped-def]
        _ = (preview, audit, conn)
        self.previewed = True


class _RoleAccess:
    def __init__(self) -> None:
        self.conn = None

    async def apply_role_management_removal(self, **kwargs):  # type: ignore[no-untyped-def]
        self.conn = kwargs["conn"]


class _FeatureAccess:
    def __init__(self) -> None:
        self.command = None
        self.conn = None

    async def apply_feature_access_convergence(self, *, command, conn):  # type: ignore[no-untyped-def]
        self.command = command
        self.conn = conn


class _ApplyRepository(_Repository):
    def __init__(self, preview: ConvergencePreview) -> None:
        super().__init__(preview.snapshot)
        self.preview = preview

    async def load_preview_for_update(self, *, preview_id, conn):  # type: ignore[no-untyped-def]
        _ = conn
        assert preview_id == self.preview.id
        return self.preview

    async def apply_convergence(self, *, preview, request, applied_at, audit, conn):  # type: ignore[no-untyped-def]
        _ = (preview, audit, conn)
        return ConvergenceReceipt(
            preview_id=request.preview_id,
            workspace_id=self.preview.snapshot.workspace_id,
            applied_at=applied_at,
            correlation_id=request.correlation_id,
        )


async def test_free_convergence_preview_rechecks_owner_allowance_and_keeps_named_assignments() -> None:
    workspace_id = uuid4()
    owner_user_id = uuid4()
    source = PlanRevisionRef(id=uuid4(), plan_id=uuid4(), code="premium", is_free=False)
    target = PlanRevisionRef(id=uuid4(), plan_id=uuid4(), code="free", is_free=True)
    assignment = FeatureSeatAssignmentImpact(
        assignment_id=uuid4(),
        membership_id=uuid4(),
        user_id=uuid4(),
        entitlement_key="ai.priority",
        name_i18n_key="feature.ai.priority.name",
        description_i18n_key="feature.ai.priority.description",
    )
    snapshot = ConvergenceImpactSnapshot(
        workspace_id=workspace_id,
        owner_user_id=owner_user_id,
        subscription_revision=4,
        source_revision=source,
        target_revision=target,
        requires_convergence=True,
        active_members=(),
        role_responsibilities=(),
        custom_roles=(),
        billing_managers=(),
        feature_seat_managers=(),
        feature_assignments=(assignment,),
        feature_allocation_scope_revisions=(),
        email_invitations=(),
        reusable_invitation_links=(),
        queued_effects=(),
    )
    allowance = _Allowance()
    repository = _Repository(snapshot)
    service = PlanAccessConvergenceService(
        repository=cast(ConvergenceRepository, repository),
        free_allowance=allowance,
        role_access=_RoleAccess(),
        feature_access=_FeatureAccess(),
    )

    preview = await service.create_preview(
        request=ConvergencePreviewRequest(
            workspace_id=workspace_id,
            source_revision_id=source.id,
            target_revision_id=target.id,
            expected_subscription_revision=4,
            effective_at=datetime.now(UTC) + timedelta(days=1),
            retained_assignment_ids=(),
            idempotency_key="free-downgrade-preview",
            correlation_id=uuid4(),
        ),
        conn=cast(BaseDBAsyncClient, object()),
    )

    assert repository.previewed is True
    assert allowance.calls == [(owner_user_id, workspace_id)]
    assert preview.snapshot.feature_assignments == (assignment,)


async def test_apply_passes_full_reviewed_feature_command_and_rechecks_free_allowance() -> None:
    workspace_id = uuid4()
    owner_user_id = uuid4()
    assignment = FeatureSeatAssignmentImpact(
        assignment_id=uuid4(),
        membership_id=uuid4(),
        user_id=uuid4(),
        entitlement_key="ai.priority",
        name_i18n_key="feature.ai.priority.name",
        description_i18n_key="feature.ai.priority.description",
    )
    source = PlanRevisionRef(id=uuid4(), plan_id=uuid4(), code="premium", is_free=False)
    target = PlanRevisionRef(
        id=uuid4(),
        plan_id=uuid4(),
        code="free",
        is_free=True,
        roles_manage_included=False,
        member_seat_limits={"ai.priority": 1},
    )
    snapshot = ConvergenceImpactSnapshot(
        workspace_id=workspace_id,
        owner_user_id=owner_user_id,
        subscription_revision=9,
        source_revision=source,
        target_revision=target,
        requires_convergence=True,
        active_members=(),
        role_responsibilities=(),
        custom_roles=(),
        billing_managers=(),
        feature_seat_managers=(),
        feature_assignments=(assignment,),
        feature_allocation_scope_revisions=(
            FeatureAccessScopeRevisionImpact(entitlement_key="ai.priority", revision=3),
        ),
        email_invitations=(),
        reusable_invitation_links=(),
        queued_effects=(),
    )
    preview = ConvergencePreview(
        id=uuid4(),
        preview_revision=1,
        snapshot_hash="reviewed",
        effective_at=datetime.now(UTC),
        snapshot=snapshot,
        retained_assignment_ids=(assignment.assignment_id,),
        idempotency_key="preview-key",
        correlation_id=uuid4(),
    )
    allowance = _Allowance()
    feature_access = _FeatureAccess()
    role_access = _RoleAccess()
    service = PlanAccessConvergenceService(
        repository=cast(ConvergenceRepository, _ApplyRepository(preview)),
        free_allowance=allowance,
        role_access=role_access,
        feature_access=feature_access,
    )
    request = ProviderConfirmedConvergenceApplication(
        preview_id=preview.id,
        workspace_id=workspace_id,
        target_revision_id=target.id,
        effective_at=preview.effective_at,
        provider_event_id="provider-event-1",
        idempotency_key="apply-key",
        correlation_id=uuid4(),
    )

    conn = cast(BaseDBAsyncClient, object())
    receipt = await service.apply_provider_confirmed(request=request, conn=conn)

    assert receipt.preview_id == preview.id
    assert allowance.calls == [(owner_user_id, workspace_id)]
    assert feature_access.command is not None
    assert feature_access.command.reviewed_assignment_ids == (assignment.assignment_id,)
    assert feature_access.command.retained_assignment_ids == (assignment.assignment_id,)
    assert feature_access.command.expected_scope_revisions == snapshot.feature_allocation_scope_revisions
    assert feature_access.command.idempotency_key == "provider:provider-event-1:apply-key"
    assert feature_access.conn is conn
    assert role_access.conn is conn


def test_service_rejects_missing_feature_access_participant_at_composition_time() -> None:
    with pytest.raises(ServiceUnavailable) as exc:
        PlanAccessConvergenceService(
            repository=cast(ConvergenceRepository, object()),
            free_allowance=cast(_Allowance, object()),
            role_access=cast(_RoleAccess, object()),
            feature_access=cast(FeatureAccessConvergenceParticipant, None),
        )

    assert exc.value.error == "PLAN_ACCESS_CONVERGENCE_FEATURE_PARTICIPANT_UNAVAILABLE"


def test_production_builder_injects_transactional_feature_access_participant(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    participant = _FeatureAccess()

    def build_participant(settings, *, outbox):  # type: ignore[no-untyped-def]
        assert settings is get_settings()
        assert isinstance(outbox, TortoiseFeatureAccessConvergenceOutbox)
        return participant

    monkeypatch.setattr(composition, "build_feature_access_convergence_participant", build_participant)

    service = composition.build_plan_access_convergence_service(get_settings())

    assert service._feature_access is participant
