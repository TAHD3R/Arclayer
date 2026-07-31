from __future__ import annotations

import hashlib
import json
from collections.abc import Awaitable, Mapping
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.schemas import BaseSchema
from src.config import Settings
from src.core.exceptions import APIError, BadRequest, Conflict, Forbidden
from src.core.i18n import t
from src.core.services import BaseService
from src.modules.commerce.feature_access.contracts import (
    FEATURE_ACCESS_MANAGE_PERMISSION,
    ActiveFeatureAccessMembership,
    AssignFeatureAccessCommand,
    FeatureAccessActor,
    FeatureAccessActorAuthority,
    FeatureAccessCapacity,
    FeatureAccessCommercialAuthority,
    FeatureAccessCommercialSnapshot,
    FeatureAccessMembershipAuthority,
    FeatureAccessMembershipRelease,
    FeatureAccessMutationResult,
    FeatureAccessPersistence,
    FeatureAccessWriteConflict,
    LimitedFeatureAccessCapacity,
    MoveFeatureAccessCommand,
    RevokeFeatureAccessCommand,
    UnlimitedFeatureAccessCapacity,
)

_WRITE_CONFLICT_ERRORS: Mapping[str, str] = {
    "revision_conflict": "FEATURE_ACCESS_REVISION_CONFLICT",
    "capacity_exhausted": "FEATURE_ACCESS_CAPACITY_EXHAUSTED",
    "idempotency_conflict": "IDEMPOTENCY_KEY_CONFLICT",
    "already_assigned": "FEATURE_ACCESS_ALREADY_ASSIGNED",
    "not_assigned": "FEATURE_ACCESS_NOT_ASSIGNED",
}


class FeatureAccessService(BaseService):
    def __init__(
        self,
        settings: Settings,
        *,
        persistence: FeatureAccessPersistence,
        commercial_authority: FeatureAccessCommercialAuthority,
        actor_authority: FeatureAccessActorAuthority,
        membership_authority: FeatureAccessMembershipAuthority,
    ) -> None:
        super().__init__(settings)
        self._persistence = persistence
        self._commercial_authority = commercial_authority
        self._actor_authority = actor_authority
        self._membership_authority = membership_authority

    async def assign(self, command: AssignFeatureAccessCommand) -> FeatureAccessMutationResult:
        async with self.tx() as conn:
            _, capacity = await self._authorize(command, conn=conn, allow_restricted=False)
            await self._require_active_membership(
                workspace_id=command.workspace_id,
                membership_id=command.membership_id,
                conn=conn,
            )
            return await self._persist(
                self._persistence.assign_serialized(
                    command=command,
                    capacity=capacity,
                    fingerprint=_fingerprint("assign", command),
                    conn=conn,
                )
            )

    async def revoke(self, command: RevokeFeatureAccessCommand) -> FeatureAccessMutationResult:
        async with self.tx() as conn:
            _, capacity = await self._authorize(command, conn=conn, allow_restricted=True)
            await self._require_active_membership(
                workspace_id=command.workspace_id,
                membership_id=command.membership_id,
                conn=conn,
            )
            return await self._persist(
                self._persistence.revoke_serialized(
                    command=command,
                    capacity=capacity,
                    fingerprint=_fingerprint("revoke", command),
                    conn=conn,
                )
            )

    async def move(self, command: MoveFeatureAccessCommand) -> FeatureAccessMutationResult:
        async with self.tx() as conn:
            _, capacity = await self._authorize(command, conn=conn, allow_restricted=False)
            await self._require_active_membership(
                workspace_id=command.workspace_id,
                membership_id=command.source_membership_id,
                conn=conn,
            )
            await self._require_active_membership(
                workspace_id=command.workspace_id,
                membership_id=command.target_membership_id,
                conn=conn,
            )
            return await self._persist(
                self._persistence.move_serialized(
                    command=command,
                    capacity=capacity,
                    fingerprint=_fingerprint("move", command),
                    conn=conn,
                )
            )

    async def _authorize(
        self,
        command: AssignFeatureAccessCommand | RevokeFeatureAccessCommand | MoveFeatureAccessCommand,
        *,
        conn: BaseDBAsyncClient,
        allow_restricted: bool,
    ) -> tuple[FeatureAccessCommercialSnapshot, FeatureAccessCapacity]:
        snapshot = await self._commercial_authority.resolve_feature_access(
            workspace_id=command.workspace_id,
            entitlement_key=command.entitlement_key,
            conn=conn,
        )
        snapshot, capacity = _require_commercial_contract(
            snapshot,
            command.workspace_id,
            command.entitlement_key,
            allow_inactive=allow_restricted,
        )
        actor = await self._actor_authority.resolve_actor(
            workspace_id=command.workspace_id,
            actor_user_id=command.actor_user_id,
            conn=conn,
        )
        _require_assignment_authority(actor, command.actor_user_id, snapshot.role_management_included)
        if snapshot.commercial_access_state == "payment_restricted" and not allow_restricted:
            raise APIError(
                message=t("errors", "BAD_REQUEST"),
                error="WORKSPACE_PAYMENT_RESTRICTED",
                status_code=402,
            )
        return snapshot, capacity

    async def _require_active_membership(
        self,
        *,
        workspace_id: UUID,
        membership_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> ActiveFeatureAccessMembership:
        membership = await self._membership_authority.require_active_membership(
            workspace_id=workspace_id,
            membership_id=membership_id,
            conn=conn,
        )
        if (
            not isinstance(membership, ActiveFeatureAccessMembership)
            or membership.workspace_id != workspace_id
            or membership.membership_id != membership_id
        ):
            raise BadRequest(
                message=t("errors", "BAD_REQUEST"),
                error="FEATURE_ACCESS_ACTIVE_MEMBERSHIP_REQUIRED",
            )
        return membership

    @staticmethod
    async def _persist(operation: Awaitable[FeatureAccessMutationResult]) -> FeatureAccessMutationResult:
        try:
            return await operation
        except FeatureAccessWriteConflict as exc:
            error = _WRITE_CONFLICT_ERRORS[exc.code]
            raise Conflict(
                message=t("errors", "BAD_REQUEST"),
                error=error,
                meta={
                    "revision": exc.state.revision,
                    "assignedMembershipIds": [str(value) for value in exc.state.assigned_membership_ids],
                    "capacity": exc.state.capacity.model_dump(mode="json"),
                },
            ) from exc


class FeatureAccessMembershipReleaseParticipant:
    """Release allocations inside the membership lifecycle caller's transaction."""

    def __init__(self, persistence: FeatureAccessPersistence) -> None:
        self._persistence = persistence

    async def release_for_membership_end(
        self,
        *,
        workspace_id: UUID,
        membership_id: UUID,
        lifecycle_idempotency_key: str,
        conn: BaseDBAsyncClient,
    ) -> FeatureAccessMembershipRelease:
        key = lifecycle_idempotency_key.strip()
        if not key:
            raise BadRequest(message=t("errors", "BAD_REQUEST"), error="IDEMPOTENCY_KEY_REQUIRED")
        return await self._persistence.release_membership_assignments(
            workspace_id=workspace_id,
            membership_id=membership_id,
            lifecycle_idempotency_key=key,
            conn=conn,
        )


def _require_commercial_contract(
    snapshot: FeatureAccessCommercialSnapshot | None,
    workspace_id: UUID,
    entitlement_key: str,
    *,
    allow_inactive: bool,
) -> tuple[FeatureAccessCommercialSnapshot, FeatureAccessCapacity]:
    if snapshot is None:
        raise Conflict(message=t("errors", "BAD_REQUEST"), error="WORKSPACE_SUBSCRIPTION_REQUIRED")
    if not isinstance(snapshot, FeatureAccessCommercialSnapshot):
        raise Conflict(message=t("errors", "BAD_REQUEST"), error="FEATURE_ACCESS_COMMERCIAL_CONTRACT_INVALID")
    if snapshot.subscription_revision is None:
        raise Conflict(message=t("errors", "BAD_REQUEST"), error="WORKSPACE_SUBSCRIPTION_REQUIRED")
    if not isinstance(snapshot.subscription_active, bool):
        raise Conflict(message=t("errors", "BAD_REQUEST"), error="FEATURE_ACCESS_COMMERCIAL_CONTRACT_INVALID")
    if not snapshot.subscription_active and not allow_inactive:
        raise Conflict(message=t("errors", "BAD_REQUEST"), error="WORKSPACE_SUBSCRIPTION_INACTIVE")
    if snapshot.workspace_id != workspace_id:
        raise Conflict(message=t("errors", "BAD_REQUEST"), error="FEATURE_ACCESS_COMMERCIAL_CONTRACT_INVALID")
    if not isinstance(snapshot.role_management_included, bool) or snapshot.commercial_access_state not in {
        "normal",
        "payment_grace",
        "payment_restricted",
    }:
        raise Conflict(message=t("errors", "BAD_REQUEST"), error="FEATURE_ACCESS_COMMERCIAL_CONTRACT_INVALID")
    entitlement = snapshot.entitlement
    if entitlement is None or not entitlement.included or entitlement.key != entitlement_key:
        raise Forbidden(message=t("errors", "PERMISSION_DENIED"), error="WORKSPACE_FEATURE_ENTITLEMENT_REQUIRED")
    if entitlement.allocation_mode != "member_seat":
        raise Conflict(message=t("errors", "BAD_REQUEST"), error="FEATURE_ACCESS_MEMBER_ALLOCATION_REQUIRED")
    capacity = entitlement.capacity
    if not isinstance(capacity, (LimitedFeatureAccessCapacity, UnlimitedFeatureAccessCapacity)):
        raise Conflict(message=t("errors", "BAD_REQUEST"), error="FEATURE_ACCESS_CAPACITY_INVALID")
    if isinstance(capacity, LimitedFeatureAccessCapacity) and capacity.limit <= 0:
        raise Conflict(message=t("errors", "BAD_REQUEST"), error="FEATURE_ACCESS_CAPACITY_INVALID")
    return snapshot, capacity


def _require_assignment_authority(
    actor: FeatureAccessActor | None,
    actor_user_id: UUID,
    role_management_included: bool,
) -> None:
    if not isinstance(actor, FeatureAccessActor) or actor.user_id != actor_user_id or not actor.active_member:
        raise Forbidden(message=t("errors", "PERMISSION_DENIED"), error="WORKSPACE_FEATURE_ACCESS_MANAGE_REQUIRED")
    if actor.is_workspace_owner:
        return
    if not role_management_included or FEATURE_ACCESS_MANAGE_PERMISSION not in actor.workspace_permissions:
        raise Forbidden(message=t("errors", "PERMISSION_DENIED"), error="WORKSPACE_FEATURE_ACCESS_MANAGE_REQUIRED")


def _fingerprint(operation: str, command: BaseSchema) -> str:
    payload = command.model_dump(mode="json", exclude={"idempotency_key"})
    payload["operation"] = operation
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
