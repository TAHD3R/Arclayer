from __future__ import annotations

from uuid import UUID

from src.config import Settings
from src.core.exceptions import Forbidden
from src.core.i18n import t
from src.core.services import BaseService
from src.modules.commerce.feature_access.contracts import (
    FEATURE_ACCESS_MANAGE_PERMISSION,
    FeatureAccessActor,
    FeatureAccessActorAuthority,
    LimitedFeatureAccessCapacity,
)
from src.modules.commerce.feature_access.read_contracts import (
    FeatureAccessCapabilityState,
    FeatureAccessReadPersistence,
    FeatureAccessReadResult,
    ManagerFeatureAccessCapability,
    MemberFeatureAccessCapability,
)


class FeatureAccessReadService(BaseService):
    def __init__(
        self,
        settings: Settings,
        *,
        persistence: FeatureAccessReadPersistence,
        actor_authority: FeatureAccessActorAuthority,
    ) -> None:
        super().__init__(settings)
        self._persistence = persistence
        self._actor_authority = actor_authority

    async def read(self, *, workspace_id: UUID, actor_user_id: UUID) -> FeatureAccessReadResult:
        async with self.tx() as conn:
            actor = await self._actor_authority.resolve_actor(
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                conn=conn,
            )
            snapshot = await self._persistence.read_workspace_feature_access(
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                conn=conn,
            )
        if (
            not isinstance(actor, FeatureAccessActor)
            or actor.user_id != actor_user_id
            or not actor.active_member
            or snapshot is None
            or snapshot.workspace_id != workspace_id
        ):
            raise Forbidden(message=t("errors", "PERMISSION_DENIED"), error="WORKSPACE_MEMBERSHIP_REQUIRED")
        manager = actor.is_workspace_owner or (
            snapshot.role_management_included and FEATURE_ACCESS_MANAGE_PERMISSION in actor.workspace_permissions
        )
        capabilities = tuple(
            _manager_projection(capability) if manager else _member_projection(capability, snapshot.actor_membership_id)
            for capability in snapshot.capabilities
        )
        return FeatureAccessReadResult(workspace_id=workspace_id, capabilities=capabilities)


def _available_count(capability: FeatureAccessCapabilityState) -> int | None:
    if not isinstance(capability.capacity, LimitedFeatureAccessCapacity):
        return None
    return max(capability.capacity.limit - len(capability.assigned_membership_ids), 0)


def _member_projection(
    capability: FeatureAccessCapabilityState,
    actor_membership_id: UUID,
) -> MemberFeatureAccessCapability:
    return MemberFeatureAccessCapability(
        entitlement_key=capability.entitlement_key,
        metadata=capability.metadata,
        capacity=capability.capacity,
        revision=capability.revision,
        assigned_count=len(capability.assigned_membership_ids),
        available_count=_available_count(capability),
        current_membership_assigned=actor_membership_id in capability.assigned_membership_ids,
    )


def _manager_projection(capability: FeatureAccessCapabilityState) -> ManagerFeatureAccessCapability:
    return ManagerFeatureAccessCapability(
        entitlement_key=capability.entitlement_key,
        metadata=capability.metadata,
        capacity=capability.capacity,
        revision=capability.revision,
        assigned_count=len(capability.assigned_membership_ids),
        available_count=_available_count(capability),
        assigned_membership_ids=capability.assigned_membership_ids,
    )
