from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest

from src.core.exceptions import Conflict, ServiceUnavailable
from src.models.commerce.access_facts import CommercialAccessFact, CommercialAccessFactKind
from src.models.hosting.commercial_access import (
    HostingCommercialAccessProjection,
    HostingCommercialAccessReceipt,
    HostingCommercialAccessState,
    HostingContinuityPolicy,
    HostingContinuityTarget,
    HostingContinuityTargetGate,
    HostingContinuityTargetRestorationState,
)
from src.models.organization.organization import Organization
from src.models.organization.user import User
from src.models.workspaces.workspace import Workspace, WorkspaceMembership
from src.modules.hosting.commercial_access_consumer import HostingCommercialAccessConsumer
from src.modules.hosting.delivery_contracts import (
    HostingDeliveryTarget,
    HostingDeliveryTargetResult,
    HostingRestorationTarget,
    HostingVisitorDeliveryGate,
)


class _Delivery:
    def __init__(
        self,
        *,
        targets: tuple[HostingDeliveryTarget, ...],
        restoration_verified: bool = True,
        failed_gate_attempts: int = 0,
        partial_gate_target: tuple[UUID, UUID] | None = None,
    ) -> None:
        self.targets = targets
        self.restoration_verified = restoration_verified
        self.failed_gate_attempts = failed_gate_attempts
        self.partial_gate_target = partial_gate_target
        self.gates: list[tuple[HostingVisitorDeliveryGate, tuple[HostingDeliveryTarget, ...]]] = []
        self.invalidations: list[tuple[HostingDeliveryTarget, ...]] = []
        self.starts: list[tuple[str, tuple[HostingDeliveryTarget, ...]]] = []
        self.verifications: list[tuple[HostingRestorationTarget, ...]] = []

    async def list_current_serving_targets(self, *, workspace_id: UUID) -> tuple[HostingDeliveryTarget, ...]:
        _ = workspace_id
        return self.targets

    async def apply_visitor_delivery_gate(
        self,
        *,
        workspace_id: UUID,
        gate: HostingVisitorDeliveryGate,
        targets: tuple[HostingDeliveryTarget, ...],
    ) -> tuple[HostingDeliveryTargetResult, ...]:
        _ = workspace_id
        self.gates.append((gate, targets))
        if self.failed_gate_attempts:
            self.failed_gate_attempts -= 1
            raise RuntimeError("delivery gate unavailable")
        return tuple(
            HostingDeliveryTargetResult(
                target=target,
                succeeded=(target.site_id, target.runtime_id) != self.partial_gate_target,
                failure_code="GATE_TARGET_FAILED"
                if (target.site_id, target.runtime_id) == self.partial_gate_target
                else None,
            )
            for target in targets
        )

    async def invalidate_delivery_cache(
        self,
        *,
        workspace_id: UUID,
        targets: tuple[HostingDeliveryTarget, ...],
    ) -> tuple[HostingDeliveryTargetResult, ...]:
        _ = workspace_id
        self.invalidations.append(targets)
        return tuple(HostingDeliveryTargetResult(target=target, succeeded=True) for target in targets)

    async def start_restoration(
        self,
        *,
        workspace_id: UUID,
        source_identity: str,
        targets: tuple[HostingDeliveryTarget, ...],
    ) -> tuple[HostingDeliveryTargetResult, ...]:
        _ = workspace_id
        self.starts.append((source_identity, targets))
        return tuple(
            HostingDeliveryTargetResult(
                target=target,
                succeeded=True,
                operation_identity=f"restore:{source_identity}:{target.site_id}",
            )
            for target in targets
        )

    async def verify_restoration(
        self,
        *,
        workspace_id: UUID,
        targets: tuple[HostingRestorationTarget, ...],
    ) -> tuple[HostingDeliveryTargetResult, ...]:
        _ = workspace_id
        self.verifications.append(targets)
        return tuple(
            HostingDeliveryTargetResult(
                target=request.target,
                succeeded=self.restoration_verified,
                verification_evidence="verified" if self.restoration_verified else None,
                failure_code=None if self.restoration_verified else "RESTORATION_NOT_VERIFIED",
            )
            for request in targets
        )


async def _workspace() -> Workspace:
    user = await User.create(username=f"hosting-{uuid4().hex}", email=f"hosting-{uuid4().hex}@example.com")
    organization = await Organization.create(
        slug=f"hosting-{uuid4().hex}",
        name="Hosting lifecycle",
        owner_user_id=user.id,
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Hosting lifecycle",
        owner_user_id=user.id,
        created_by_user_id=user.id,
    )
    await WorkspaceMembership.create(workspace_id=workspace.id, user_id=user.id)
    return workspace


def _targets() -> tuple[HostingDeliveryTarget, ...]:
    return (
        HostingDeliveryTarget(site_id=uuid4(), runtime_id=uuid4(), preserved_release_id=uuid4()),
        HostingDeliveryTarget(site_id=uuid4(), runtime_id=uuid4(), preserved_release_id=None),
    )


async def _fact(
    *, workspace_id: UUID, source_identity: str, state: str, effective_at: datetime
) -> CommercialAccessFact:
    return await CommercialAccessFact.create(
        workspace_id=workspace_id,
        kind=CommercialAccessFactKind.HOSTING_HANDOFF,
        source_identity=source_identity,
        payload={"state": state, "cause": "provider_test"},
        effective_at=effective_at,
    )


@pytest.mark.usefixtures("db")
async def test_restriction_without_hosting_policy_fails_explicitly() -> None:
    workspace = await _workspace()
    await _fact(
        workspace_id=workspace.id,
        source_identity="provider:stripe:missing-policy",
        state="payment_restricted",
        effective_at=datetime(2026, 8, 1, 10, tzinfo=UTC),
    )
    consumer = HostingCommercialAccessConsumer(delivery=_Delivery(targets=_targets()))

    with pytest.raises(ServiceUnavailable, match="HOSTING_CONTINUITY_POLICY_UNAVAILABLE"):
        await consumer.consume(source_identity="provider:stripe:missing-policy")

    assert await HostingCommercialAccessProjection.filter(workspace_id=workspace.id).count() == 0


@pytest.mark.usefixtures("db")
async def test_restriction_persists_every_target_and_replay_preserves_them() -> None:
    workspace = await _workspace()
    await HostingContinuityPolicy.create(revision=7, is_active=True, continuity_window_seconds=1800)
    effective_at = datetime(2026, 8, 1, 10, tzinfo=UTC)
    source_identity = "provider:stripe:restricted-replay"
    await _fact(
        workspace_id=workspace.id,
        source_identity=source_identity,
        state="payment_restricted",
        effective_at=effective_at,
    )
    targets = _targets()
    delivery = _Delivery(targets=targets)
    consumer = HostingCommercialAccessConsumer(delivery=delivery)

    assert await consumer.consume(source_identity=source_identity) is HostingCommercialAccessState.CONTINUITY_REQUIRED
    assert await consumer.consume(source_identity=source_identity) is HostingCommercialAccessState.CONTINUITY_REQUIRED

    projection = await HostingCommercialAccessProjection.get(workspace_id=workspace.id)
    persisted = await HostingContinuityTarget.filter(projection_id=projection.id).order_by("site_id", "runtime_id")
    assert projection.continuity_deadline == effective_at + timedelta(minutes=30)
    assert projection.policy_revision == 7
    assert {(target.site_id, target.runtime_id, target.preserved_release_id) for target in persisted} == {
        (target.site_id, target.runtime_id, target.preserved_release_id) for target in targets
    }
    assert {target.gate for target in persisted} == {HostingContinuityTargetGate.CONTINUITY}
    assert len(delivery.gates) == 1
    assert await HostingCommercialAccessReceipt.filter(source_identity=source_identity).count() == 1


@pytest.mark.usefixtures("db")
async def test_partial_target_gate_exposes_partial_until_same_fact_retries_every_target() -> None:
    workspace = await _workspace()
    await HostingContinuityPolicy.create(revision=8, is_active=True, continuity_window_seconds=1800)
    source_identity = "provider:stripe:restriction-partial"
    await _fact(
        workspace_id=workspace.id,
        source_identity=source_identity,
        state="payment_restricted",
        effective_at=datetime(2026, 8, 1, 10, tzinfo=UTC),
    )
    targets = _targets()
    delivery = _Delivery(targets=targets, partial_gate_target=(targets[1].site_id, targets[1].runtime_id))
    consumer = HostingCommercialAccessConsumer(delivery=delivery)

    with pytest.raises(ServiceUnavailable, match="HOSTING_DELIVERY_TRANSITION_FAILED"):
        await consumer.consume(source_identity=source_identity)

    projection = await HostingCommercialAccessProjection.get(workspace_id=workspace.id)
    failed_target = await HostingContinuityTarget.get(projection_id=projection.id, site_id=targets[1].site_id)
    assert projection.state is HostingCommercialAccessState.PARTIAL
    assert failed_target.failure_code == "GATE_TARGET_FAILED"
    assert await HostingCommercialAccessReceipt.filter(source_identity=source_identity).count() == 0

    stale_source_identity = "provider:stripe:restriction-partial-stale"
    await _fact(
        workspace_id=workspace.id,
        source_identity=stale_source_identity,
        state="payment_restricted",
        effective_at=datetime(2026, 8, 1, 9, 59, tzinfo=UTC),
    )
    assert await consumer.consume(source_identity=stale_source_identity) is HostingCommercialAccessState.PARTIAL
    stale_receipt = await HostingCommercialAccessReceipt.get(source_identity=stale_source_identity)
    assert stale_receipt.resulting_state is HostingCommercialAccessState.PARTIAL

    delivery.partial_gate_target = None
    assert await consumer.consume(source_identity=source_identity) is HostingCommercialAccessState.CONTINUITY_REQUIRED
    assert len(delivery.gates) == 2
    assert await HostingCommercialAccessReceipt.filter(source_identity=source_identity).count() == 1


@pytest.mark.usefixtures("db")
async def test_stale_restriction_cannot_reopen_continuity_after_recovery() -> None:
    workspace = await _workspace()
    await HostingContinuityPolicy.create(revision=1, is_active=True, continuity_window_seconds=60)
    restricted_at = datetime(2026, 8, 1, 10, tzinfo=UTC)
    recovered_at = restricted_at + timedelta(minutes=2)
    stale_at = restricted_at + timedelta(minutes=1)
    await _fact(
        workspace_id=workspace.id,
        source_identity="provider:stripe:restricted",
        state="payment_restricted",
        effective_at=restricted_at,
    )
    await _fact(
        workspace_id=workspace.id,
        source_identity="provider:stripe:recovered",
        state="normal",
        effective_at=recovered_at,
    )
    await _fact(
        workspace_id=workspace.id,
        source_identity="provider:stripe:stale",
        state="payment_restricted",
        effective_at=stale_at,
    )
    delivery = _Delivery(targets=_targets())
    consumer = HostingCommercialAccessConsumer(delivery=delivery)

    await consumer.consume(source_identity="provider:stripe:restricted")
    assert await consumer.consume(source_identity="provider:stripe:recovered") is HostingCommercialAccessState.RESTORED
    assert await consumer.consume(source_identity="provider:stripe:stale") is HostingCommercialAccessState.RESTORED


@pytest.mark.usefixtures("db")
async def test_equal_effective_time_with_different_fact_identity_is_an_ordering_conflict() -> None:
    workspace = await _workspace()
    await HostingContinuityPolicy.create(revision=4, is_active=True, continuity_window_seconds=60)
    effective_at = datetime(2026, 8, 1, 10, tzinfo=UTC)
    await _fact(
        workspace_id=workspace.id,
        source_identity="provider:stripe:restriction-same-time",
        state="payment_restricted",
        effective_at=effective_at,
    )
    await _fact(
        workspace_id=workspace.id,
        source_identity="provider:stripe:recovery-same-time",
        state="normal",
        effective_at=effective_at,
    )
    consumer = HostingCommercialAccessConsumer(delivery=_Delivery(targets=_targets()))

    await consumer.consume(source_identity="provider:stripe:restriction-same-time")
    with pytest.raises(Conflict, match="HOSTING_COMMERCIAL_FACT_ORDER_CONFLICT"):
        await consumer.consume(source_identity="provider:stripe:recovery-same-time")


@pytest.mark.usefixtures("db")
async def test_expired_continuity_suspends_every_target_without_removing_bindings() -> None:
    workspace = await _workspace()
    await HostingContinuityPolicy.create(revision=2, is_active=True, continuity_window_seconds=60)
    effective_at = datetime(2026, 8, 1, 10, tzinfo=UTC)
    await _fact(
        workspace_id=workspace.id,
        source_identity="provider:stripe:deadline",
        state="payment_restricted",
        effective_at=effective_at,
    )
    targets = _targets()
    delivery = _Delivery(targets=targets)
    consumer = HostingCommercialAccessConsumer(delivery=delivery, now=lambda: effective_at + timedelta(minutes=1))

    await consumer.consume(source_identity="provider:stripe:deadline")
    assert await consumer.suspend_due(workspace_id=workspace.id) is HostingCommercialAccessState.SUSPENDED

    projection = await HostingCommercialAccessProjection.get(workspace_id=workspace.id)
    persisted = await HostingContinuityTarget.filter(projection_id=projection.id)
    assert projection.state is HostingCommercialAccessState.SUSPENDED
    assert {target.gate for target in persisted} == {HostingContinuityTargetGate.SUSPENDED}
    assert {target.preserved_release_id for target in persisted} == {target.preserved_release_id for target in targets}


@pytest.mark.usefixtures("db")
async def test_failed_restoration_reuses_each_target_operation_until_verified() -> None:
    workspace = await _workspace()
    await HostingContinuityPolicy.create(revision=3, is_active=True, continuity_window_seconds=60)
    effective_at = datetime(2026, 8, 1, 10, tzinfo=UTC)
    restricted_source = "provider:stripe:restriction"
    recovered_source = "provider:stripe:recovery"
    await _fact(
        workspace_id=workspace.id,
        source_identity=restricted_source,
        state="payment_restricted",
        effective_at=effective_at,
    )
    await _fact(
        workspace_id=workspace.id,
        source_identity=recovered_source,
        state="normal",
        effective_at=effective_at + timedelta(minutes=1),
    )
    targets = _targets()
    delivery = _Delivery(targets=targets, restoration_verified=False)
    consumer = HostingCommercialAccessConsumer(delivery=delivery)

    await consumer.consume(source_identity=restricted_source)
    with pytest.raises(ServiceUnavailable, match="HOSTING_RESTORATION_FAILED"):
        await consumer.consume(source_identity=recovered_source)

    projection = await HostingCommercialAccessProjection.get(workspace_id=workspace.id)
    failed = await HostingContinuityTarget.filter(projection_id=projection.id)
    assert projection.state is HostingCommercialAccessState.PARTIAL
    assert {target.restoration_state for target in failed} == {HostingContinuityTargetRestorationState.FAILED}
    assert all(target.operation_identity for target in failed)
    assert await HostingCommercialAccessReceipt.filter(source_identity=recovered_source).count() == 0

    delivery.restoration_verified = True
    assert await consumer.consume(source_identity=recovered_source) is HostingCommercialAccessState.RESTORED
    restored = await HostingContinuityTarget.filter(projection_id=projection.id)
    assert {target.restoration_state for target in restored} == {HostingContinuityTargetRestorationState.SUCCEEDED}
    assert all(target.verification_evidence == "verified" for target in restored)
    assert len(delivery.starts) == 1
    assert len(delivery.verifications) == 2
    assert await HostingCommercialAccessReceipt.filter(source_identity=recovered_source).count() == 1
