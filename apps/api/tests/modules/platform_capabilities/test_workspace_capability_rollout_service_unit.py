from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest

from src.config import get_settings
from src.core.exceptions import Conflict, NotFound
from src.modules.platform_capabilities import rollout_service
from src.modules.platform_capabilities.rollout_schema import (
    WorkspaceCapabilityEligibility,
    WorkspaceCapabilityEligibilitySnapshot,
    WorkspaceCapabilityRolloutApplyReceipt,
    WorkspaceCapabilityRolloutApplyRequest,
    WorkspaceCapabilityRolloutPolicy,
    WorkspaceCapabilityRolloutPreview,
    WorkspaceCapabilityRolloutPreviewRequest,
    WorkspaceCapabilityRolloutStage,
)
from src.modules.platform_capabilities.rollout_service import WorkspaceCapabilityRolloutService
from src.modules.platform_identity.session_schema import PlatformSessionPrincipal


class _Repository:
    def __init__(self) -> None:
        self.policy = WorkspaceCapabilityRolloutPolicy(
            capability_id="workspace-feature",
            stage=WorkspaceCapabilityRolloutStage.NOT_AVAILABLE,
            revision=0,
            selection_revision=0,
            selected_workspace_ids=(),
        )
        self.previews: dict[UUID, WorkspaceCapabilityRolloutPreview] = {}
        self.applied_idempotency_keys: dict[UUID, tuple[UUID, str]] = {}
        self._apply_lock = asyncio.Lock()

    async def load_policy_for_update(self, **_kwargs: object) -> WorkspaceCapabilityRolloutPolicy:
        return self.policy

    async def save_preview(self, *, preview: WorkspaceCapabilityRolloutPreview, **_kwargs: object) -> None:
        self.previews[preview.id] = preview

    async def load_preview_for_update(
        self, *, preview_id: UUID, **_kwargs: object
    ) -> WorkspaceCapabilityRolloutPreview:
        return self.previews[preview_id]

    async def apply_preview(
        self,
        *,
        preview: WorkspaceCapabilityRolloutPreview,
        actor_user_id: UUID,
        idempotency_key: str,
        applied_at: datetime,
        **_kwargs: object,
    ) -> WorkspaceCapabilityRolloutApplyReceipt:
        async with self._apply_lock:
            stored = self.previews[preview.id]
            if stored.applied_rollout_revision is not None:
                if self.applied_idempotency_keys[stored.id] != (actor_user_id, idempotency_key):
                    raise Conflict(error="WORKSPACE_CAPABILITY_ROLLOUT_IDEMPOTENCY_MISMATCH")
                return WorkspaceCapabilityRolloutApplyReceipt(
                    capability_id=stored.capability_id,
                    rollout_revision=stored.applied_rollout_revision,
                    selection_revision=self.policy.selection_revision,
                    applied_at=applied_at,
                    replayed=True,
                )
            revision = self.policy.revision + 1
            self.policy = WorkspaceCapabilityRolloutPolicy(
                capability_id=stored.capability_id,
                stage=stored.proposed_stage,
                revision=revision,
                selection_revision=self.policy.selection_revision
                + int(self.policy.selected_workspace_ids != stored.proposed_selected_workspace_ids),
                selected_workspace_ids=stored.proposed_selected_workspace_ids,
            )
            applied = stored.model_copy(update={"applied_rollout_revision": revision})
            self.applied_idempotency_keys[stored.id] = (actor_user_id, idempotency_key)
            self.previews[preview.id] = applied
            return WorkspaceCapabilityRolloutApplyReceipt(
                capability_id=stored.capability_id,
                rollout_revision=revision,
                selection_revision=self.policy.selection_revision,
                applied_at=applied_at,
            )


class _Eligibility:
    def __init__(self, snapshot: WorkspaceCapabilityEligibilitySnapshot) -> None:
        self.snapshot = snapshot

    async def capture_eligibility(self, **_kwargs: object) -> WorkspaceCapabilityEligibilitySnapshot:
        return self.snapshot


class _Permission:
    def __init__(self) -> None:
        self.calls = 0

    async def assert_can_apply(self, **_kwargs: object) -> None:
        self.calls += 1


def _principal() -> PlatformSessionPrincipal:
    return PlatformSessionPrincipal(
        actor_id=uuid4(),
        session_id=uuid4(),
        operator_id=uuid4(),
        is_instance_owner=False,
        policy_revision=1,
        absolute_expires_at=datetime.now(UTC),
    )


def _snapshot(*, eligibility_revision: int = 7) -> tuple[WorkspaceCapabilityEligibilitySnapshot, UUID, UUID]:
    eligible_workspace_id = uuid4()
    blocked_workspace_id = uuid4()
    return (
        WorkspaceCapabilityEligibilitySnapshot(
            capability_revision=3,
            eligibility_revision=eligibility_revision,
            workspaces=(
                WorkspaceCapabilityEligibility(workspace_id=eligible_workspace_id, is_eligible=True),
                WorkspaceCapabilityEligibility(
                    workspace_id=blocked_workspace_id,
                    is_eligible=False,
                    ineligibility_reasons=("PLAN_NOT_ENTITLED",),
                ),
            ),
        ),
        eligible_workspace_id,
        blocked_workspace_id,
    )


def _service(
    repository: _Repository,
    eligibility: _Eligibility,
    permission: _Permission,
    *,
    preview_ttl: timedelta = timedelta(minutes=15),
) -> WorkspaceCapabilityRolloutService:
    return WorkspaceCapabilityRolloutService(
        repository=repository,
        eligibility=eligibility,
        permission=permission,
        settings=get_settings(),
        rollout_capability_ids=frozenset({"workspace-feature"}),
        preview_ttl=preview_ttl,
    )


def test_selected_workspace_request_accepts_pydantic_normalized_stage() -> None:
    workspace_id = uuid4()

    request = WorkspaceCapabilityRolloutPreviewRequest(
        proposed_stage=WorkspaceCapabilityRolloutStage.SELECTED_WORKSPACES,
        selected_workspace_ids=(workspace_id,),
    )

    assert request.proposed_stage == WorkspaceCapabilityRolloutStage.SELECTED_WORKSPACES
    assert request.selected_workspace_ids == (workspace_id,)


@pytest.mark.asyncio
async def test_preview_only_makes_explicitly_selected_eligible_workspaces_available() -> None:
    snapshot, eligible_workspace_id, blocked_workspace_id = _snapshot()
    service = _service(_Repository(), _Eligibility(snapshot), _Permission())

    preview = await service.create_preview(
        capability_id="workspace-feature",
        request=WorkspaceCapabilityRolloutPreviewRequest(
            proposed_stage=WorkspaceCapabilityRolloutStage.SELECTED_WORKSPACES,
            selected_workspace_ids=(eligible_workspace_id, blocked_workspace_id),
        ),
        conn=object(),
    )

    impacts = {item.workspace_id: item for item in preview.workspaces}
    assert impacts[eligible_workspace_id].proposed_available is True
    assert impacts[blocked_workspace_id].proposed_available is False
    assert impacts[blocked_workspace_id].ineligibility_reasons == ("PLAN_NOT_ENTITLED",)
    assert preview.summary.newly_available_workspace_ids == (eligible_workspace_id,)
    assert preview.summary.blocked_workspace_count == 1
    assert preview.summary.eligible_workspace_count == 1
    assert preview.summary.ineligible_workspace_count == 1


@pytest.mark.asyncio
async def test_apply_denies_eligibility_revision_drift(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _audit(**_kwargs: object) -> None:
        return None

    monkeypatch.setattr(rollout_service, "write_required_activity_event", _audit)
    snapshot, eligible_workspace_id, _ = _snapshot()
    repository = _Repository()
    eligibility = _Eligibility(snapshot)
    service = _service(repository, eligibility, _Permission())
    preview = await service.create_preview(
        capability_id="workspace-feature",
        request=WorkspaceCapabilityRolloutPreviewRequest(
            proposed_stage=WorkspaceCapabilityRolloutStage.SELECTED_WORKSPACES,
            selected_workspace_ids=(eligible_workspace_id,),
        ),
        conn=object(),
    )
    changed_snapshot, _, _ = _snapshot(eligibility_revision=8)
    eligibility.snapshot = changed_snapshot

    with pytest.raises(Conflict, match="WORKSPACE_CAPABILITY_ROLLOUT_ELIGIBILITY_STALE"):
        await service.apply(
            principal=_principal(),
            request=WorkspaceCapabilityRolloutApplyRequest(
                preview_id=preview.id,
                idempotency_key="apply-1",
                reason="Controlled adoption",
            ),
            conn=object(),
        )


@pytest.mark.asyncio
async def test_concurrent_same_idempotency_apply_commits_one_revision_and_replays(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _audit(**_kwargs: object) -> None:
        return None

    monkeypatch.setattr(rollout_service, "write_required_activity_event", _audit)
    snapshot, eligible_workspace_id, _ = _snapshot()
    repository = _Repository()
    permission = _Permission()
    service = _service(repository, _Eligibility(snapshot), permission)
    preview = await service.create_preview(
        capability_id="workspace-feature",
        request=WorkspaceCapabilityRolloutPreviewRequest(
            proposed_stage=WorkspaceCapabilityRolloutStage.SELECTED_WORKSPACES,
            selected_workspace_ids=(eligible_workspace_id,),
        ),
        conn=object(),
    )
    request = WorkspaceCapabilityRolloutApplyRequest(
        preview_id=preview.id,
        idempotency_key="same-command",
        reason="Controlled adoption",
    )
    principal = _principal()

    receipts = await asyncio.gather(
        service.apply(principal=principal, request=request, conn=object()),
        service.apply(principal=principal, request=request, conn=object()),
    )

    assert repository.policy.revision == 1
    assert {receipt.rollout_revision for receipt in receipts} == {1}
    assert sum(receipt.replayed for receipt in receipts) == 1
    assert permission.calls == 2


@pytest.mark.asyncio
async def test_preview_rejects_capabilities_outside_the_build_trusted_rollout_allowlist() -> None:
    snapshot, _, _ = _snapshot()
    service = _service(_Repository(), _Eligibility(snapshot), _Permission())

    with pytest.raises(NotFound, match="WORKSPACE_CAPABILITY_ROLLOUT_UNSUPPORTED"):
        await service.create_preview(
            capability_id="untrusted-capability",
            request=WorkspaceCapabilityRolloutPreviewRequest(
                proposed_stage=WorkspaceCapabilityRolloutStage.NOT_AVAILABLE,
            ),
            conn=object(),
        )


@pytest.mark.asyncio
async def test_apply_rejects_expired_preview_and_selected_ineligible_workspace(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _audit(**_kwargs: object) -> None:
        return None

    monkeypatch.setattr(rollout_service, "write_required_activity_event", _audit)
    snapshot, eligible_workspace_id, blocked_workspace_id = _snapshot()
    expired_service = _service(
        _Repository(),
        _Eligibility(snapshot),
        _Permission(),
        preview_ttl=timedelta(seconds=-1),
    )
    expired_preview = await expired_service.create_preview(
        capability_id="workspace-feature",
        request=WorkspaceCapabilityRolloutPreviewRequest(
            proposed_stage=WorkspaceCapabilityRolloutStage.SELECTED_WORKSPACES,
            selected_workspace_ids=(eligible_workspace_id,),
        ),
        conn=object(),
    )
    with pytest.raises(Conflict, match="WORKSPACE_CAPABILITY_ROLLOUT_PREVIEW_EXPIRED"):
        await expired_service.apply(
            principal=_principal(),
            request=WorkspaceCapabilityRolloutApplyRequest(
                preview_id=expired_preview.id,
                idempotency_key="expired",
                reason="Expired review",
            ),
            conn=object(),
        )

    service = _service(_Repository(), _Eligibility(snapshot), _Permission())
    blocked_preview = await service.create_preview(
        capability_id="workspace-feature",
        request=WorkspaceCapabilityRolloutPreviewRequest(
            proposed_stage=WorkspaceCapabilityRolloutStage.SELECTED_WORKSPACES,
            selected_workspace_ids=(blocked_workspace_id,),
        ),
        conn=object(),
    )
    with pytest.raises(Conflict, match="WORKSPACE_CAPABILITY_ROLLOUT_SELECTED_WORKSPACE_INELIGIBLE"):
        await service.apply(
            principal=_principal(),
            request=WorkspaceCapabilityRolloutApplyRequest(
                preview_id=blocked_preview.id,
                idempotency_key="blocked",
                reason="Blocked selection",
            ),
            conn=object(),
        )


@pytest.mark.asyncio
async def test_all_eligible_preview_counts_current_eligibility_exclusions() -> None:
    snapshot, _, _ = _snapshot()
    service = _service(_Repository(), _Eligibility(snapshot), _Permission())

    preview = await service.create_preview(
        capability_id="workspace-feature",
        request=WorkspaceCapabilityRolloutPreviewRequest(proposed_stage=WorkspaceCapabilityRolloutStage.ALL_ELIGIBLE),
        conn=object(),
    )

    assert preview.summary.blocked_workspace_count == 1
    assert preview.summary.ineligible_workspace_count == 1
