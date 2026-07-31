from __future__ import annotations

from typing import Protocol, cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import Settings
from src.core.exceptions import Conflict
from src.core.i18n import t
from src.models.commerce.billing import (
    CommerceEntitlementDefinition,
    CommercePlanRevision,
    CommercePlanRevisionEntitlement,
    PlanRevisionStatus,
    ResourceLimitKind,
    SubscriptionStatus,
    WorkspaceCommercialAccess,
    WorkspaceSubscription,
)
from src.models.system.rbac import PermissionScope, SystemRole, SystemRolePermission
from src.models.workspaces.workspace import (
    Workspace,
    WorkspaceMembership,
    WorkspaceMembershipRole,
    WorkspaceMembershipStatus,
)
from src.modules.commerce.entitlement_schema import WORKSPACE_ROLES_MANAGE_ENTITLEMENT
from src.modules.commerce.feature_access.contracts import (
    FEATURE_ACCESS_MANAGE_PERMISSION,
    ActiveFeatureAccessMembership,
    CommercialAccessState,
    FeatureAccessActor,
    FeatureAccessActorAuthority,
    FeatureAccessCommercialAuthority,
    FeatureAccessCommercialSnapshot,
    FeatureAccessConvergenceOutbox,
    FeatureAccessConvergencePersistence,
    FeatureAccessEntitlement,
    FeatureAccessMembershipAuthority,
    FeatureAccessPersistence,
    LimitedFeatureAccessCapacity,
    UnlimitedFeatureAccessCapacity,
)
from src.modules.commerce.feature_access.convergence import FeatureAccessPlanConvergenceParticipant
from src.modules.commerce.feature_access.convergence_repository import TortoiseFeatureAccessConvergenceRepository
from src.modules.commerce.feature_access.repository import TortoiseFeatureAccessRepository
from src.modules.commerce.feature_access.service import FeatureAccessService
from src.modules.permissions import (
    PermissionConditionEvaluationContext,
    deserialize_condition_sets,
    evaluate_condition_sets,
)


class _HasSubscriptionId(Protocol):
    subscription_id: UUID


class _HasRoleId(Protocol):
    role_id: UUID


class TortoiseFeatureAccessCommercialAuthority(FeatureAccessCommercialAuthority):
    async def resolve_feature_access(
        self,
        *,
        workspace_id: UUID,
        entitlement_key: str,
        conn: BaseDBAsyncClient,
    ) -> FeatureAccessCommercialSnapshot | None:
        subscription = await self._lock_subscription(workspace_id=workspace_id, conn=conn)
        if subscription is None:
            return None
        revision = await self._lock_plan_revision(
            plan_revision_id=subscription.plan_revision_id,
            conn=conn,
        )
        if revision is None:
            raise _commercial_contract_invalid(workspace_id)
        if revision.status != PlanRevisionStatus.PUBLISHED or revision.published_at is None:
            raise _commercial_contract_invalid(workspace_id)
        access_state = await self._lock_access_state(
            workspace_id=workspace_id,
            subscription_id=subscription.id,
            conn=conn,
        )
        definitions = await self._lock_definitions(
            keys=(entitlement_key, WORKSPACE_ROLES_MANAGE_ENTITLEMENT),
            conn=conn,
        )
        decisions_by_definition_id = await self._lock_revision_decisions(
            plan_revision_id=subscription.plan_revision_id,
            definition_ids=tuple(definition.id for definition in definitions.values()),
            conn=conn,
        )
        decisions = {key: decisions_by_definition_id.get(definition.id) for key, definition in definitions.items()}
        role_management_included = _role_management_included(
            workspace_id=workspace_id,
            definition=definitions.get(WORKSPACE_ROLES_MANAGE_ENTITLEMENT),
            decision=decisions.get(WORKSPACE_ROLES_MANAGE_ENTITLEMENT),
        )
        entitlement = _member_entitlement(
            key=entitlement_key,
            definition=definitions.get(entitlement_key),
            decision=decisions.get(entitlement_key),
        )
        return FeatureAccessCommercialSnapshot(
            workspace_id=workspace_id,
            subscription_revision=subscription.revision,
            subscription_active=subscription.status in {SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE},
            role_management_included=role_management_included,
            commercial_access_state=cast(CommercialAccessState, str(access_state.state)),
            entitlement=entitlement,
        )

    @staticmethod
    async def _lock_subscription(*, workspace_id: UUID, conn: BaseDBAsyncClient) -> WorkspaceSubscription | None:
        return await WorkspaceSubscription.filter(workspace_id=workspace_id).using_db(conn).select_for_update().first()

    @staticmethod
    async def _lock_plan_revision(*, plan_revision_id: UUID, conn: BaseDBAsyncClient) -> CommercePlanRevision | None:
        return await CommercePlanRevision.filter(id=plan_revision_id).using_db(conn).select_for_update().first()

    @staticmethod
    async def _lock_access_state(
        *, workspace_id: UUID, subscription_id: UUID, conn: BaseDBAsyncClient
    ) -> WorkspaceCommercialAccess:
        access = await (
            WorkspaceCommercialAccess.filter(workspace_id=workspace_id).using_db(conn).select_for_update().first()
        )
        if access is None or UUID(str(cast(_HasSubscriptionId, access).subscription_id)) != subscription_id:
            raise _commercial_contract_invalid(workspace_id)
        state = str(access.state)
        if state not in {"normal", "payment_grace", "payment_restricted"}:
            raise _commercial_contract_invalid(workspace_id)
        return access

    @staticmethod
    async def _lock_definitions(
        *, keys: tuple[str, str], conn: BaseDBAsyncClient
    ) -> dict[str, CommerceEntitlementDefinition]:
        definitions = await CommerceEntitlementDefinition.filter(key__in=keys).using_db(conn).select_for_update().all()
        return {str(definition.key): definition for definition in definitions}

    @staticmethod
    async def _lock_revision_decisions(
        *,
        plan_revision_id: UUID,
        definition_ids: tuple[UUID, ...],
        conn: BaseDBAsyncClient,
    ) -> dict[UUID, CommercePlanRevisionEntitlement]:
        if not definition_ids:
            return {}
        decisions = await (
            CommercePlanRevisionEntitlement
            .filter(
                plan_revision_id=plan_revision_id,
                entitlement_id__in=definition_ids,
            )
            .using_db(conn)
            .select_for_update()
            .all()
        )
        return {decision.entitlement_id: decision for decision in decisions}


class TortoiseFeatureAccessActorAuthority(FeatureAccessActorAuthority):
    async def resolve_actor(
        self,
        *,
        workspace_id: UUID,
        actor_user_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> FeatureAccessActor | None:
        workspace = await (
            Workspace.filter(id=workspace_id, deleted_at__isnull=True).using_db(conn).select_for_update().first()
        )
        if workspace is None:
            return None
        membership = await (
            WorkspaceMembership
            .filter(workspace_id=workspace_id, user_id=actor_user_id)
            .using_db(conn)
            .select_for_update()
            .first()
        )
        if membership is None:
            return None
        active = membership.status == WorkspaceMembershipStatus.ACTIVE
        owner = UUID(str(workspace.owner_user_id)) == actor_user_id
        permissions = ()
        if active and not owner:
            permissions = await self._active_permissions(
                membership_id=membership.id,
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                conn=conn,
            )
        return FeatureAccessActor(
            user_id=actor_user_id,
            active_member=active,
            is_workspace_owner=owner,
            workspace_permissions=permissions,
        )

    @staticmethod
    async def _active_permissions(
        *,
        membership_id: UUID,
        workspace_id: UUID,
        actor_user_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> tuple[str, ...]:
        role_edges = await (
            WorkspaceMembershipRole
            .filter(membership_id=membership_id, ended_at=None)
            .using_db(conn)
            .select_for_update()
            .all()
        )
        role_ids = tuple(UUID(str(cast(_HasRoleId, edge).role_id)) for edge in role_edges)
        if not role_ids:
            return ()
        await (
            SystemRole
            .filter(id__in=role_ids, workspace_id=workspace_id, ended_at=None)
            .using_db(conn)
            .select_for_update()
            .all()
        )
        grants = await (
            SystemRolePermission
            .filter(
                role_id__in=role_ids,
                role__workspace_id=workspace_id,
                role__ended_at=None,
                permission__code=FEATURE_ACCESS_MANAGE_PERMISSION,
                permission__scope=PermissionScope.WORKSPACE,
            )
            .using_db(conn)
            .select_for_update()
            .values("conditions")
        )
        context = PermissionConditionEvaluationContext(
            user_id=actor_user_id,
            workspace_id=workspace_id,
            resource_attributes={"workspace_id": workspace_id},
        )
        try:
            granted = any(
                evaluate_condition_sets(deserialize_condition_sets(grant.get("conditions")), context=context)
                for grant in grants
            )
        except ValueError as exc:
            raise _commercial_contract_invalid(workspace_id) from exc
        return (FEATURE_ACCESS_MANAGE_PERMISSION,) if granted else ()


class TortoiseFeatureAccessMembershipAuthority(FeatureAccessMembershipAuthority):
    async def require_active_membership(
        self,
        *,
        workspace_id: UUID,
        membership_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> ActiveFeatureAccessMembership | None:
        membership = await (
            WorkspaceMembership
            .filter(
                id=membership_id,
                workspace_id=workspace_id,
                status=WorkspaceMembershipStatus.ACTIVE,
            )
            .using_db(conn)
            .select_for_update()
            .first()
        )
        if membership is None:
            return None
        return ActiveFeatureAccessMembership(
            workspace_id=workspace_id,
            membership_id=membership_id,
            user_id=UUID(str(membership.user_id)),
        )


def compose_feature_access_service(
    settings: Settings,
    *,
    persistence: FeatureAccessPersistence,
) -> FeatureAccessService:
    return FeatureAccessService(
        settings,
        persistence=persistence,
        commercial_authority=TortoiseFeatureAccessCommercialAuthority(),
        actor_authority=TortoiseFeatureAccessActorAuthority(),
        membership_authority=TortoiseFeatureAccessMembershipAuthority(),
    )


def build_feature_access_service(settings: Settings) -> FeatureAccessService:
    return compose_feature_access_service(
        settings,
        persistence=TortoiseFeatureAccessRepository(settings),
    )


def compose_feature_access_convergence_participant(
    *,
    persistence: FeatureAccessConvergencePersistence,
) -> FeatureAccessPlanConvergenceParticipant:
    return FeatureAccessPlanConvergenceParticipant(persistence)


def build_feature_access_convergence_participant(
    settings: Settings,
    *,
    outbox: FeatureAccessConvergenceOutbox,
) -> FeatureAccessPlanConvergenceParticipant:
    return compose_feature_access_convergence_participant(
        persistence=TortoiseFeatureAccessConvergenceRepository(settings, outbox=outbox),
    )


def _role_management_included(
    *,
    workspace_id: UUID,
    definition: CommerceEntitlementDefinition | None,
    decision: CommercePlanRevisionEntitlement | None,
) -> bool:
    if definition is None or decision is None or not definition.is_active:
        raise _commercial_contract_invalid(workspace_id)
    if not definition.supports_workspace_allocation:
        raise _commercial_contract_invalid(workspace_id)
    if not decision.is_included:
        if (
            decision.allocation_mode is not None
            or decision.seat_limit_kind is not None
            or decision.seat_limit_value is not None
        ):
            raise _commercial_contract_invalid(workspace_id)
        return False
    if str(decision.allocation_mode) != "workspace":
        raise _commercial_contract_invalid(workspace_id)
    if decision.seat_limit_kind is not None or decision.seat_limit_value is not None:
        raise _commercial_contract_invalid(workspace_id)
    return True


def _member_entitlement(
    *,
    key: str,
    definition: CommerceEntitlementDefinition | None,
    decision: CommercePlanRevisionEntitlement | None,
) -> FeatureAccessEntitlement | None:
    if definition is None or decision is None:
        return None
    capacity = None
    if decision.seat_limit_kind == ResourceLimitKind.LIMITED and decision.seat_limit_value is not None:
        if decision.seat_limit_value > 0:
            capacity = LimitedFeatureAccessCapacity(limit=decision.seat_limit_value)
    elif decision.seat_limit_kind == ResourceLimitKind.UNLIMITED and decision.seat_limit_value is None:
        capacity = UnlimitedFeatureAccessCapacity()
    return FeatureAccessEntitlement.model_construct(
        key=key,
        included=bool(decision.is_included and definition.is_active and definition.supports_member_seat_allocation),
        allocation_mode=str(decision.allocation_mode),
        capacity=capacity,
    )


def _commercial_contract_invalid(workspace_id: UUID) -> Conflict:
    return Conflict(
        message=t("errors", "BAD_REQUEST"),
        error="FEATURE_ACCESS_COMMERCIAL_CONTRACT_INVALID",
        meta={"workspaceId": str(workspace_id)},
    )
