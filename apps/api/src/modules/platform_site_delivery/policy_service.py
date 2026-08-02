from __future__ import annotations

import json
from datetime import UTC, datetime
from hashlib import sha256
from uuid import UUID, uuid4

from tortoise.exceptions import IntegrityError

from src.config import Settings
from src.core.exceptions import Conflict, NotFound
from src.core.services import BaseService
from src.models.hosting.commercial_access import (
    HostingCommercialAccessProjection,
    HostingCommercialAccessState,
    HostingContinuityPolicy,
    HostingContinuityPolicyPreview,
)
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.platform_site_delivery.schema import (
    PlatformDeliveryContinuityPolicyOut,
    PlatformDeliveryPolicyApplyIn,
    PlatformDeliveryPolicyApplyOut,
    PlatformDeliveryPolicyPreviewIn,
    PlatformDeliveryPolicyPreviewOut,
)


class PlatformSiteDeliveryPolicyService(BaseService):
    """Own the reviewed, versioned policy that governs future Hosting transitions."""

    def __init__(self, *, settings: Settings) -> None:
        super().__init__(settings)

    async def get_current(self) -> PlatformDeliveryContinuityPolicyOut:
        policy = await HostingContinuityPolicy.filter(is_active=True).order_by("-revision").first()
        if policy is None:
            latest = await HostingContinuityPolicy.all().order_by("-revision").first()
            return PlatformDeliveryContinuityPolicyOut(
                revision=int(latest.revision) if latest is not None else 0,
                continuity_window_seconds=None,
                is_active=False,
                affected_active_transition_count=await self._active_transition_count_without_lock(),
            )
        return PlatformDeliveryContinuityPolicyOut(
            revision=int(policy.revision),
            continuity_window_seconds=int(policy.continuity_window_seconds),
            is_active=True,
            affected_active_transition_count=await self._active_transition_count_without_lock(),
        )

    async def preview(self, *, payload: PlatformDeliveryPolicyPreviewIn) -> PlatformDeliveryPolicyPreviewOut:
        async with self.tx() as conn:
            _, current_revision = await self._policy_state_for_update(conn=conn)
            if payload.expected_revision != current_revision:
                raise Conflict(
                    error="HOSTING_CONTINUITY_POLICY_REVISION_STALE",
                    meta={"expectedRevision": payload.expected_revision, "currentRevision": current_revision},
                )
            affected = await self._active_transition_count(conn=conn)
            snapshot = {
                "expected_revision": current_revision,
                "continuity_window_seconds": payload.continuity_window_seconds,
                "affected_active_transition_count": affected,
            }
            preview = await HostingContinuityPolicyPreview.create(
                id=uuid4(),
                expected_revision=current_revision,
                proposed_continuity_window_seconds=payload.continuity_window_seconds,
                snapshot_hash=_snapshot_hash(snapshot),
                snapshot=snapshot,
                using_db=conn,
            )
        return PlatformDeliveryPolicyPreviewOut(
            id=preview.id,
            expected_revision=current_revision,
            proposed_revision=current_revision + 1,
            continuity_window_seconds=payload.continuity_window_seconds,
            affected_active_transition_count=affected,
        )

    async def apply(
        self,
        *,
        preview_id: UUID,
        payload: PlatformDeliveryPolicyApplyIn,
        actor_user_id: UUID,
    ) -> PlatformDeliveryPolicyApplyOut:
        try:
            async with self.tx() as conn:
                preview = await (
                    HostingContinuityPolicyPreview.filter(id=preview_id).using_db(conn).select_for_update().first()
                )
                if preview is None:
                    raise NotFound(error="HOSTING_CONTINUITY_POLICY_PREVIEW_NOT_FOUND")
                if _snapshot_hash(_validated_snapshot(preview.snapshot)) != preview.snapshot_hash:
                    raise Conflict(error="HOSTING_CONTINUITY_POLICY_PREVIEW_INVALID")
                if preview.applied_policy_revision is not None:
                    return self._replay_or_conflict(preview=preview, actor_user_id=actor_user_id, payload=payload)
                existing = await (
                    HostingContinuityPolicyPreview
                    .filter(
                        applied_actor_user_id=actor_user_id,
                        applied_idempotency_key=payload.idempotency_key,
                    )
                    .using_db(conn)
                    .select_for_update()
                    .first()
                )
                if existing is not None:
                    raise Conflict(error="HOSTING_CONTINUITY_POLICY_IDEMPOTENCY_KEY_REUSED")
                current, current_revision = await self._policy_state_for_update(conn=conn)
                if current_revision != int(preview.expected_revision):
                    raise Conflict(
                        error="HOSTING_CONTINUITY_POLICY_PREVIEW_STALE",
                        meta={"expectedRevision": int(preview.expected_revision), "currentRevision": current_revision},
                    )
                if current is not None:
                    current.is_active = False
                    await current.save(update_fields=["is_active", "updated_at"], using_db=conn)
                policy = await HostingContinuityPolicy.create(
                    revision=current_revision + 1,
                    is_active=True,
                    continuity_window_seconds=int(preview.proposed_continuity_window_seconds),
                    using_db=conn,
                )
                applied_at = datetime.now(UTC)
                preview.applied_policy_revision = policy.revision
                preview.applied_actor_user_id = actor_user_id
                preview.applied_idempotency_key = payload.idempotency_key
                preview.applied_at = applied_at
                await preview.save(
                    update_fields=[
                        "applied_policy_revision",
                        "applied_actor_user_id",
                        "applied_idempotency_key",
                        "applied_at",
                        "updated_at",
                    ],
                    using_db=conn,
                )
                affected = _snapshot_affected_count(preview.snapshot)
                await write_required_activity_event(
                    settings=self.settings,
                    conn=conn,
                    payload=ActivityAuditPayload(
                        event_name="platform.hosting.continuity_policy.applied",
                        actor_user_id=actor_user_id,
                        entity_type="hosting_continuity_policy",
                        entity_id=policy.id,
                        source="platform",
                        properties={
                            "reason": payload.reason,
                            "idempotency_key_hash": sha256(payload.idempotency_key.encode()).hexdigest(),
                            "preview_id": str(preview.id),
                            "expected_revision": int(preview.expected_revision),
                            "policy_revision": int(policy.revision),
                            "continuity_window_seconds": int(policy.continuity_window_seconds),
                            "affected_active_transition_count": affected,
                            "partial_failure": False,
                            "result": "applied",
                        },
                    ),
                )
                return PlatformDeliveryPolicyApplyOut(
                    policy_revision=int(policy.revision),
                    continuity_window_seconds=int(policy.continuity_window_seconds),
                    applied_at=applied_at,
                    affected_active_transition_count=affected,
                )
        except IntegrityError as exc:
            if "hosting_continuity_policy_previews_actor_key_unique" not in str(exc):
                raise
            raise Conflict(error="HOSTING_CONTINUITY_POLICY_IDEMPOTENCY_KEY_REUSED") from exc

    @staticmethod
    async def _policy_state_for_update(*, conn) -> tuple[HostingContinuityPolicy | None, int]:
        policies = await HostingContinuityPolicy.all().using_db(conn).select_for_update().order_by("-revision")
        active = [policy for policy in policies if policy.is_active]
        if len(active) > 1:
            raise Conflict(error="HOSTING_CONTINUITY_POLICY_ACTIVE_STATE_INVALID")
        return (active[0] if active else None, int(policies[0].revision) if policies else 0)

    @staticmethod
    async def _active_transition_count(*, conn) -> int:
        return (
            await HostingCommercialAccessProjection
            .filter(
                state__in=[
                    HostingCommercialAccessState.CONTINUITY_REQUIRED,
                    HostingCommercialAccessState.SUSPENDED,
                    HostingCommercialAccessState.RESTORATION_REQUIRED,
                    HostingCommercialAccessState.PARTIAL,
                ]
            )
            .using_db(conn)
            .count()
        )

    @staticmethod
    async def _active_transition_count_without_lock() -> int:
        return await HostingCommercialAccessProjection.filter(
            state__in=[
                HostingCommercialAccessState.CONTINUITY_REQUIRED,
                HostingCommercialAccessState.SUSPENDED,
                HostingCommercialAccessState.RESTORATION_REQUIRED,
                HostingCommercialAccessState.PARTIAL,
            ]
        ).count()

    @staticmethod
    def _replay_or_conflict(
        *,
        preview: HostingContinuityPolicyPreview,
        actor_user_id: UUID,
        payload: PlatformDeliveryPolicyApplyIn,
    ) -> PlatformDeliveryPolicyApplyOut:
        if preview.applied_actor_user_id != actor_user_id or preview.applied_idempotency_key != payload.idempotency_key:
            raise Conflict(error="HOSTING_CONTINUITY_POLICY_IDEMPOTENCY_MISMATCH")
        return PlatformDeliveryPolicyApplyOut(
            policy_revision=int(preview.applied_policy_revision),
            continuity_window_seconds=int(preview.proposed_continuity_window_seconds),
            applied_at=preview.applied_at or datetime.now(UTC),
            replayed=True,
            affected_active_transition_count=_snapshot_affected_count(preview.snapshot),
        )


def _snapshot_hash(snapshot: dict[str, int]) -> str:
    return sha256(json.dumps(snapshot, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def _snapshot_affected_count(snapshot: object) -> int:
    value = _validated_snapshot(snapshot)["affected_active_transition_count"]
    return value


def _validated_snapshot(snapshot: object) -> dict[str, int]:
    if not isinstance(snapshot, dict):
        raise Conflict(error="HOSTING_CONTINUITY_POLICY_PREVIEW_INVALID")
    value = snapshot.get("affected_active_transition_count")
    if not isinstance(value, int) or value < 0:
        raise Conflict(error="HOSTING_CONTINUITY_POLICY_PREVIEW_INVALID")
    expected_revision = snapshot.get("expected_revision")
    window = snapshot.get("continuity_window_seconds")
    if not isinstance(expected_revision, int) or expected_revision < 0 or not isinstance(window, int) or window < 1:
        raise Conflict(error="HOSTING_CONTINUITY_POLICY_PREVIEW_INVALID")
    return {
        "expected_revision": expected_revision,
        "continuity_window_seconds": window,
        "affected_active_transition_count": value,
    }
