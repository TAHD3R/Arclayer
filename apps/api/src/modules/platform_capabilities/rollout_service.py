from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from datetime import UTC, datetime, timedelta
from typing import Protocol
from uuid import UUID, uuid4

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.exceptions import IntegrityError

from src.config import Settings
from src.core.exceptions import Conflict, Forbidden, NotFound, ServiceUnavailable
from src.core.services import BaseService
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.platform_capabilities.rollout_schema import (
    WorkspaceCapabilityEligibilityDecision,
    WorkspaceCapabilityEligibilitySnapshot,
    WorkspaceCapabilityRolloutApplyReceipt,
    WorkspaceCapabilityRolloutApplyRequest,
    WorkspaceCapabilityRolloutImpactSummary,
    WorkspaceCapabilityRolloutPolicy,
    WorkspaceCapabilityRolloutPreview,
    WorkspaceCapabilityRolloutPreviewRequest,
    WorkspaceCapabilityRolloutStage,
    WorkspaceCapabilityRolloutWorkspaceImpact,
)
from src.modules.platform_identity.repository import PlatformIdentityRepository
from src.modules.platform_identity.session_schema import PlatformSessionPrincipal

WORKSPACE_CAPABILITY_ROLLOUT_APPLY_PERMISSION = "platform:workspace-capability-rollout:apply"
WORKSPACE_CAPABILITY_ROLLOUT_CAPABILITY_IDS = frozenset({
    "commerce",
    "communications",
    "extensions",
    "site-delivery",
})
# Reviewed rollout previews are intentionally short-lived to make drift explicit.
WORKSPACE_CAPABILITY_ROLLOUT_PREVIEW_TTL = timedelta(minutes=15)


class WorkspaceCapabilityEligibilityPort(Protocol):
    """Owning domains supply only their revisioned Workspace eligibility predicate."""

    async def capture_eligibility(
        self, *, capability_id: str, conn: BaseDBAsyncClient
    ) -> WorkspaceCapabilityEligibilitySnapshot: ...

    async def evaluate_workspace_eligibility(
        self, *, capability_id: str, workspace_id: UUID, conn: BaseDBAsyncClient
    ) -> WorkspaceCapabilityEligibilityDecision: ...


class WorkspaceCapabilityRolloutRepository(Protocol):
    async def load_policy_for_update(
        self, *, capability_id: str, conn: BaseDBAsyncClient
    ) -> WorkspaceCapabilityRolloutPolicy: ...

    async def save_preview(self, *, preview: WorkspaceCapabilityRolloutPreview, conn: BaseDBAsyncClient) -> None: ...

    async def load_preview_for_update(
        self, *, preview_id: UUID, conn: BaseDBAsyncClient
    ) -> WorkspaceCapabilityRolloutPreview: ...

    async def apply_preview(
        self,
        *,
        preview: WorkspaceCapabilityRolloutPreview,
        actor_user_id: UUID,
        idempotency_key: str,
        applied_at: datetime,
        conn: BaseDBAsyncClient,
    ) -> WorkspaceCapabilityRolloutApplyReceipt: ...


class WorkspaceCapabilityRolloutPermissionPort(Protocol):
    async def assert_can_apply(self, *, principal: PlatformSessionPrincipal, conn: BaseDBAsyncClient) -> None: ...


class UnregisteredWorkspaceCapabilityEligibilityPort:
    """Fails explicitly until an owning domain provides its capability eligibility predicate."""

    async def capture_eligibility(
        self, *, capability_id: str, conn: BaseDBAsyncClient
    ) -> WorkspaceCapabilityEligibilitySnapshot:
        _ = (capability_id, conn)
        raise ServiceUnavailable(error="WORKSPACE_CAPABILITY_ELIGIBILITY_UNREGISTERED")

    async def evaluate_workspace_eligibility(
        self, *, capability_id: str, workspace_id: UUID, conn: BaseDBAsyncClient
    ) -> WorkspaceCapabilityEligibilityDecision:
        _ = (capability_id, workspace_id, conn)
        raise ServiceUnavailable(error="WORKSPACE_CAPABILITY_ELIGIBILITY_UNREGISTERED")


class WorkspaceCapabilityEligibilityRegistry:
    """Dispatches rollout eligibility to the capability's owning domain."""

    def __init__(self, registrations: Mapping[str, WorkspaceCapabilityEligibilityPort]) -> None:
        self._registrations = dict(registrations)

    def _registered(self, capability_id: str) -> WorkspaceCapabilityEligibilityPort:
        eligibility = self._registrations.get(capability_id)
        if eligibility is None:
            raise ServiceUnavailable(error="WORKSPACE_CAPABILITY_ELIGIBILITY_UNREGISTERED")
        return eligibility

    async def capture_eligibility(
        self, *, capability_id: str, conn: BaseDBAsyncClient
    ) -> WorkspaceCapabilityEligibilitySnapshot:
        return await self._registered(capability_id).capture_eligibility(
            capability_id=capability_id,
            conn=conn,
        )

    async def evaluate_workspace_eligibility(
        self, *, capability_id: str, workspace_id: UUID, conn: BaseDBAsyncClient
    ) -> WorkspaceCapabilityEligibilityDecision:
        return await self._registered(capability_id).evaluate_workspace_eligibility(
            capability_id=capability_id,
            workspace_id=workspace_id,
            conn=conn,
        )


class PlatformIdentityWorkspaceCapabilityRolloutPermission:
    """Current-request permission adapter; Platform role changes apply immediately."""

    def __init__(self, repository: PlatformIdentityRepository) -> None:
        self._repository = repository

    async def assert_can_apply(self, *, principal: PlatformSessionPrincipal, conn: BaseDBAsyncClient) -> None:
        if principal.is_instance_owner:
            return
        if principal.operator_id is None or not await self._repository.operator_has_permission(
            operator_id=UUID(str(principal.operator_id)),
            permission_code=WORKSPACE_CAPABILITY_ROLLOUT_APPLY_PERMISSION,
            at=datetime.now(UTC),
            conn=conn,
        ):
            raise Forbidden(error="PLATFORM_PERMISSION_DENIED")


class WorkspaceCapabilityRolloutService(BaseService):
    """Preview/apply authority for Workspace-only capability adoption scope."""

    def __init__(
        self,
        *,
        repository: WorkspaceCapabilityRolloutRepository,
        eligibility: WorkspaceCapabilityEligibilityPort,
        permission: WorkspaceCapabilityRolloutPermissionPort,
        settings: Settings,
        rollout_capability_ids: frozenset[str] = WORKSPACE_CAPABILITY_ROLLOUT_CAPABILITY_IDS,
        preview_ttl: timedelta = WORKSPACE_CAPABILITY_ROLLOUT_PREVIEW_TTL,
    ) -> None:
        super().__init__(settings)
        self._repository = repository
        self._eligibility = eligibility
        self._permission = permission
        self._rollout_capability_ids = rollout_capability_ids
        self._preview_ttl = preview_ttl

    async def create_preview(
        self,
        *,
        capability_id: str,
        request: WorkspaceCapabilityRolloutPreviewRequest,
        conn: BaseDBAsyncClient | None = None,
    ) -> WorkspaceCapabilityRolloutPreview:
        self._assert_rollout_capability(capability_id)
        async with self.tx(conn=conn) as tx_conn:
            source_policy = await self._repository.load_policy_for_update(capability_id=capability_id, conn=tx_conn)
            eligibility = await self._eligibility.capture_eligibility(capability_id=capability_id, conn=tx_conn)
            preview = self._build_preview(
                capability_id=capability_id,
                source_policy=source_policy,
                request=request,
                eligibility=eligibility,
                expires_at=datetime.now(UTC) + self._preview_ttl,
            )
            await self._repository.save_preview(preview=preview, conn=tx_conn)
            return preview

    async def apply(
        self,
        *,
        principal: PlatformSessionPrincipal,
        request: WorkspaceCapabilityRolloutApplyRequest,
        conn: BaseDBAsyncClient | None = None,
    ) -> WorkspaceCapabilityRolloutApplyReceipt:
        try:
            async with self.tx(conn=conn) as tx_conn:
                await self._permission.assert_can_apply(principal=principal, conn=tx_conn)
                preview = await self._repository.load_preview_for_update(preview_id=request.preview_id, conn=tx_conn)
                if preview.applied_rollout_revision is not None:
                    return await self._repository.apply_preview(
                        preview=preview,
                        actor_user_id=UUID(str(principal.actor_id)),
                        idempotency_key=request.idempotency_key,
                        applied_at=datetime.now(UTC),
                        conn=tx_conn,
                    )
                if preview.expires_at <= datetime.now(UTC):
                    raise Conflict(error="WORKSPACE_CAPABILITY_ROLLOUT_PREVIEW_EXPIRED")
                source_policy = await self._repository.load_policy_for_update(
                    capability_id=preview.capability_id,
                    conn=tx_conn,
                )
                eligibility = await self._eligibility.capture_eligibility(
                    capability_id=preview.capability_id,
                    conn=tx_conn,
                )
                self._assert_preview_is_current(preview=preview, source_policy=source_policy, eligibility=eligibility)
                self._assert_selected_workspaces_eligible(preview=preview)
                receipt = await self._repository.apply_preview(
                    preview=preview,
                    actor_user_id=UUID(str(principal.actor_id)),
                    idempotency_key=request.idempotency_key,
                    applied_at=datetime.now(UTC),
                    conn=tx_conn,
                )
                if not receipt.replayed:
                    await self._write_apply_audit(
                        principal=principal,
                        request=request,
                        preview=preview,
                        receipt=receipt,
                        conn=tx_conn,
                    )
                return receipt
        except IntegrityError as exc:
            if "platform_workspace_capability_rollout_previews_actor_idempotency_unique" not in str(exc):
                raise
            raise Conflict(error="WORKSPACE_CAPABILITY_ROLLOUT_IDEMPOTENCY_KEY_REUSED") from exc

    async def _write_apply_audit(
        self,
        *,
        principal: PlatformSessionPrincipal,
        request: WorkspaceCapabilityRolloutApplyRequest,
        preview: WorkspaceCapabilityRolloutPreview,
        receipt: WorkspaceCapabilityRolloutApplyReceipt,
        conn: BaseDBAsyncClient,
    ) -> None:
        await write_required_activity_event(
            settings=self.settings,
            conn=conn,
            payload=ActivityAuditPayload(
                event_name="platform.workspace_capability_rollout.applied",
                actor_user_id=UUID(str(principal.actor_id)),
                entity_type="workspace_capability_rollout",
                entity_id=preview.id,
                source="platform",
                properties={
                    "permission": WORKSPACE_CAPABILITY_ROLLOUT_APPLY_PERMISSION,
                    "reason": request.reason,
                    "idempotency_key_hash": hashlib.sha256(request.idempotency_key.encode()).hexdigest(),
                    "reviewed_preview_id": str(preview.id),
                    "reviewed_scope_hash": _reviewed_scope_hash(preview),
                    "reviewed_scope_count": len(preview.workspaces),
                    "reviewed_policy_revision": preview.source_policy.revision,
                    "reviewed_selection_revision": preview.source_policy.selection_revision,
                    "reviewed_capability_revision": preview.capability_revision,
                    "reviewed_eligibility_revision": preview.eligibility_revision,
                    "before_stage": str(preview.source_policy.stage),
                    "before_selected_workspace_count": len(preview.source_policy.selected_workspace_ids),
                    "after_stage": str(preview.proposed_stage),
                    "after_selected_workspace_count": len(preview.proposed_selected_workspace_ids),
                    "after_rollout_revision": receipt.rollout_revision,
                    "after_selection_revision": receipt.selection_revision,
                    "affected_workspace_count": preview.summary.affected_workspace_count,
                    "eligible_workspace_count": preview.summary.eligible_workspace_count,
                    "ineligible_workspace_count": preview.summary.ineligible_workspace_count,
                    "selected_workspace_count": preview.summary.selected_workspace_count,
                    "newly_available_count": len(preview.summary.newly_available_workspace_ids),
                    "no_longer_available_count": len(preview.summary.no_longer_available_workspace_ids),
                    "result": "applied",
                },
            ),
        )

    @staticmethod
    def _build_preview(
        *,
        capability_id: str,
        source_policy: WorkspaceCapabilityRolloutPolicy,
        request: WorkspaceCapabilityRolloutPreviewRequest,
        eligibility: WorkspaceCapabilityEligibilitySnapshot,
        expires_at: datetime,
    ) -> WorkspaceCapabilityRolloutPreview:
        evaluations = {item.workspace_id: item for item in eligibility.workspaces}
        requested_scope: frozenset[UUID] = frozenset(
            UUID(str(workspace_id)) for workspace_id in request.selected_workspace_ids
        )
        missing_workspace_ids = requested_scope.difference(evaluations)
        if missing_workspace_ids:
            raise NotFound(
                error="WORKSPACE_CAPABILITY_ROLLOUT_WORKSPACE_NOT_FOUND",
                meta={"workspace_ids": sorted(str(item) for item in missing_workspace_ids)},
            )
        workspaces = tuple(
            WorkspaceCapabilityRolloutWorkspaceImpact(
                workspace_id=item.workspace_id,
                selected=item.workspace_id in requested_scope,
                is_eligible=item.is_eligible,
                ineligibility_reasons=item.ineligibility_reasons,
                currently_available=_is_available(
                    stage=source_policy.stage,
                    selected_workspace_ids=frozenset(source_policy.selected_workspace_ids),
                    workspace_id=item.workspace_id,
                    is_eligible=item.is_eligible,
                ),
                proposed_available=_is_available(
                    stage=request.proposed_stage,
                    selected_workspace_ids=requested_scope,
                    workspace_id=item.workspace_id,
                    is_eligible=item.is_eligible,
                ),
            )
            for item in sorted(eligibility.workspaces, key=lambda evaluation: str(evaluation.workspace_id))
        )
        newly_available = tuple(
            item.workspace_id for item in workspaces if not item.currently_available and item.proposed_available
        )
        no_longer_available = tuple(
            item.workspace_id for item in workspaces if item.currently_available and not item.proposed_available
        )
        return WorkspaceCapabilityRolloutPreview(
            id=uuid4(),
            capability_id=capability_id,
            source_policy=source_policy,
            proposed_stage=request.proposed_stage,
            proposed_selected_workspace_ids=tuple(sorted(requested_scope, key=lambda workspace_id: str(workspace_id))),
            capability_revision=eligibility.capability_revision,
            eligibility_revision=eligibility.eligibility_revision,
            eligibility_snapshot_hash=_eligibility_snapshot_hash(eligibility),
            operational_consequences=eligibility.operational_consequences,
            workspaces=workspaces,
            summary=WorkspaceCapabilityRolloutImpactSummary(
                affected_workspace_count=len(newly_available) + len(no_longer_available),
                eligible_workspace_count=sum(item.is_eligible for item in workspaces),
                ineligible_workspace_count=sum(not item.is_eligible for item in workspaces),
                selected_workspace_count=sum(item.selected for item in workspaces),
                newly_available_workspace_ids=newly_available,
                no_longer_available_workspace_ids=no_longer_available,
                blocked_workspace_count=_blocked_workspace_count(
                    stage=request.proposed_stage,
                    workspaces=workspaces,
                ),
            ),
            expires_at=expires_at,
        )

    @staticmethod
    def _assert_preview_is_current(
        *,
        preview: WorkspaceCapabilityRolloutPreview,
        source_policy: WorkspaceCapabilityRolloutPolicy,
        eligibility: WorkspaceCapabilityEligibilitySnapshot,
    ) -> None:
        if source_policy != preview.source_policy:
            raise Conflict(error="WORKSPACE_CAPABILITY_ROLLOUT_POLICY_STALE")
        if eligibility.capability_revision != preview.capability_revision:
            raise Conflict(error="WORKSPACE_CAPABILITY_ROLLOUT_CAPABILITY_STALE")
        if eligibility.eligibility_revision != preview.eligibility_revision:
            raise Conflict(error="WORKSPACE_CAPABILITY_ROLLOUT_ELIGIBILITY_STALE")
        if _eligibility_snapshot_hash(eligibility) != preview.eligibility_snapshot_hash:
            raise Conflict(error="WORKSPACE_CAPABILITY_ROLLOUT_ELIGIBILITY_SCOPE_STALE")

    def _assert_rollout_capability(self, capability_id: str) -> None:
        if capability_id not in self._rollout_capability_ids:
            raise NotFound(error="WORKSPACE_CAPABILITY_ROLLOUT_UNSUPPORTED")

    @staticmethod
    def _assert_selected_workspaces_eligible(*, preview: WorkspaceCapabilityRolloutPreview) -> None:
        if preview.proposed_stage != WorkspaceCapabilityRolloutStage.SELECTED_WORKSPACES:
            return
        if any(item.selected and not item.is_eligible for item in preview.workspaces):
            raise Conflict(error="WORKSPACE_CAPABILITY_ROLLOUT_SELECTED_WORKSPACE_INELIGIBLE")


def _is_available(
    *,
    stage: WorkspaceCapabilityRolloutStage,
    selected_workspace_ids: frozenset[UUID],
    workspace_id: UUID,
    is_eligible: bool,
) -> bool:
    if stage == WorkspaceCapabilityRolloutStage.NOT_AVAILABLE:
        return False
    if stage == WorkspaceCapabilityRolloutStage.ALL_ELIGIBLE:
        return is_eligible
    return is_eligible and workspace_id in selected_workspace_ids


def _eligibility_snapshot_hash(snapshot: WorkspaceCapabilityEligibilitySnapshot) -> str:
    payload = snapshot.model_dump(mode="json")
    serialized = json.dumps(payload, ensure_ascii=True, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode()).hexdigest()


def _blocked_workspace_count(
    *,
    stage: WorkspaceCapabilityRolloutStage,
    workspaces: tuple[WorkspaceCapabilityRolloutWorkspaceImpact, ...],
) -> int:
    if stage == WorkspaceCapabilityRolloutStage.ALL_ELIGIBLE:
        return sum(not item.is_eligible for item in workspaces)
    if stage == WorkspaceCapabilityRolloutStage.SELECTED_WORKSPACES:
        return sum(item.selected and not item.is_eligible for item in workspaces)
    return 0


def _reviewed_scope_hash(preview: WorkspaceCapabilityRolloutPreview) -> str:
    serialized = preview.model_dump_json(exclude={"created_at", "applied_rollout_revision"})
    return hashlib.sha256(serialized.encode()).hexdigest()
