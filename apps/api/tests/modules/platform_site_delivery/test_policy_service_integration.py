from __future__ import annotations

from uuid import uuid4

import pytest

from src.config import get_settings
from src.core.exceptions import Conflict
from src.models.analytics.audit_event import AuditEvent
from src.models.hosting.commercial_access import (
    HostingCommercialAccessProjection,
    HostingCommercialAccessState,
    HostingContinuityPolicy,
)
from src.modules.platform_site_delivery.policy_service import PlatformSiteDeliveryPolicyService
from src.modules.platform_site_delivery.schema import (
    PlatformDeliveryPolicyApplyIn,
    PlatformDeliveryPolicyPreviewIn,
)


@pytest.mark.usefixtures("db")
async def test_policy_preview_apply_replay_is_revision_bound_and_audited() -> None:
    actor_user_id = uuid4()
    await HostingContinuityPolicy.create(revision=4, is_active=True, continuity_window_seconds=120)
    await HostingCommercialAccessProjection.create(
        workspace_id=uuid4(),
        state=HostingCommercialAccessState.PARTIAL,
        source_identity="hosting:partial-targets",
    )
    service = PlatformSiteDeliveryPolicyService(settings=get_settings())

    preview = await service.preview(
        payload=PlatformDeliveryPolicyPreviewIn(expected_revision=4, continuity_window_seconds=600)
    )
    receipt = await service.apply(
        preview_id=preview.id,
        payload=PlatformDeliveryPolicyApplyIn(
            idempotency_key="hosting-policy-apply-1",
            reason="Extend future continuity",
        ),
        actor_user_id=actor_user_id,
    )
    replay = await service.apply(
        preview_id=preview.id,
        payload=PlatformDeliveryPolicyApplyIn(
            idempotency_key="hosting-policy-apply-1",
            reason="Extend future continuity",
        ),
        actor_user_id=actor_user_id,
    )

    active = await HostingContinuityPolicy.get(is_active=True)
    assert preview.affected_active_transition_count == 1
    assert receipt.policy_revision == 5
    assert receipt.continuity_window_seconds == 600
    assert receipt.affected_active_transition_count == 1
    assert not receipt.partial_failure
    assert active.revision == 5
    assert active.continuity_window_seconds == 600
    assert replay.replayed
    assert replay.policy_revision == receipt.policy_revision
    audit = await AuditEvent.get(event_name="platform.hosting.continuity_policy.applied")
    assert audit.actor_user_id == actor_user_id
    assert audit.properties["expected_revision"] == 4
    assert audit.properties["policy_revision"] == 5


@pytest.mark.usefixtures("db")
async def test_policy_apply_rejects_preview_drift_and_idempotency_mismatch() -> None:
    actor_user_id = uuid4()
    await HostingContinuityPolicy.create(revision=1, is_active=True, continuity_window_seconds=60)
    service = PlatformSiteDeliveryPolicyService(settings=get_settings())
    preview = await service.preview(
        payload=PlatformDeliveryPolicyPreviewIn(expected_revision=1, continuity_window_seconds=90)
    )
    await HostingContinuityPolicy.create(revision=2, is_active=False, continuity_window_seconds=120)

    with pytest.raises(Conflict, match="HOSTING_CONTINUITY_POLICY_PREVIEW_STALE"):
        await service.apply(
            preview_id=preview.id,
            payload=PlatformDeliveryPolicyApplyIn(idempotency_key="hosting-policy-apply-2", reason="Stale preview"),
            actor_user_id=actor_user_id,
        )
