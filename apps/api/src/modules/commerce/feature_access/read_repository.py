from __future__ import annotations

from typing import Protocol, cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.exceptions import Conflict, ServiceUnavailable
from src.core.i18n import t
from src.models.commerce.billing import (
    CommerceEntitlementDefinition,
    CommercePlanRevision,
    CommercePlanRevisionEntitlement,
    FeatureAccessAllocationScope,
    FeatureAccessAssignment,
    PlanRevisionStatus,
    ResourceLimitKind,
    WorkspaceSubscription,
)
from src.models.workspaces.workspace import WorkspaceMembership, WorkspaceMembershipStatus
from src.modules.commerce.entitlement_schema import WORKSPACE_ROLES_MANAGE_ENTITLEMENT
from src.modules.commerce.feature_access.contracts import (
    LimitedFeatureAccessCapacity,
    UnlimitedFeatureAccessCapacity,
)
from src.modules.commerce.feature_access.read_contracts import (
    FeatureAccessCapabilityState,
    FeatureAccessMetadataRegistry,
    FeatureAccessReadSnapshot,
)


class _HasPlanRevisionId(Protocol):
    plan_revision_id: UUID


class TortoiseFeatureAccessReadRepository:
    def __init__(self, metadata_registry: FeatureAccessMetadataRegistry) -> None:
        self._metadata_registry = metadata_registry

    async def read_workspace_feature_access(
        self,
        *,
        workspace_id: UUID,
        actor_user_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> FeatureAccessReadSnapshot | None:
        membership = (
            await WorkspaceMembership
            .filter(
                workspace_id=workspace_id,
                user_id=actor_user_id,
                status=WorkspaceMembershipStatus.ACTIVE,
            )
            .using_db(conn)
            .first()
        )
        if membership is None:
            return None
        subscription = await WorkspaceSubscription.filter(workspace_id=workspace_id).using_db(conn).first()
        if subscription is None:
            raise _read_contract_invalid(workspace_id)
        revision_id = UUID(str(cast(_HasPlanRevisionId, subscription).plan_revision_id))
        revision = await CommercePlanRevision.filter(id=revision_id).using_db(conn).first()
        if revision is None or revision.status != PlanRevisionStatus.PUBLISHED or revision.published_at is None:
            raise _read_contract_invalid(workspace_id)
        definitions = await CommerceEntitlementDefinition.all().using_db(conn)
        definitions_by_id = {UUID(str(definition.id)): definition for definition in definitions}
        decisions = await CommercePlanRevisionEntitlement.filter(plan_revision_id=revision_id).using_db(conn).all()
        role_management_included = _role_management_included(decisions, definitions_by_id, workspace_id)
        member_decisions = tuple(
            decision
            for decision in decisions
            if decision.is_included and str(decision.allocation_mode) == "member_seat"
        )
        capabilities = await self._capabilities(
            workspace_id=workspace_id,
            decisions=member_decisions,
            definitions_by_id=definitions_by_id,
            conn=conn,
        )
        return FeatureAccessReadSnapshot(
            workspace_id=workspace_id,
            actor_membership_id=UUID(str(membership.id)),
            role_management_included=role_management_included,
            capabilities=capabilities,
        )

    async def _capabilities(
        self,
        *,
        workspace_id: UUID,
        decisions: tuple[CommercePlanRevisionEntitlement, ...],
        definitions_by_id: dict[UUID, CommerceEntitlementDefinition],
        conn: BaseDBAsyncClient,
    ) -> tuple[FeatureAccessCapabilityState, ...]:
        if not decisions:
            return ()
        definition_ids = tuple(UUID(str(decision.entitlement_id)) for decision in decisions)
        scopes = (
            await FeatureAccessAllocationScope
            .filter(
                workspace_id=workspace_id,
                entitlement_id__in=definition_ids,
            )
            .using_db(conn)
            .all()
        )
        scopes_by_definition_id = {UUID(str(scope.entitlement_id)): scope for scope in scopes}
        if set(scopes_by_definition_id) != set(definition_ids):
            raise _read_contract_invalid(workspace_id)
        assignments = (
            await FeatureAccessAssignment
            .filter(
                workspace_id=workspace_id,
                entitlement_id__in=definition_ids,
                ended_at=None,
            )
            .using_db(conn)
            .order_by("membership_id")
            .all()
        )
        assignments_by_definition_id: dict[UUID, list[UUID]] = {definition_id: [] for definition_id in definition_ids}
        for assignment in assignments:
            assignments_by_definition_id[UUID(str(assignment.entitlement_id))].append(
                UUID(str(assignment.membership_id))
            )
        states = [
            self._capability_state(
                workspace_id=workspace_id,
                decision=decision,
                definition=definitions_by_id.get(UUID(str(decision.entitlement_id))),
                scope=scopes_by_definition_id[UUID(str(decision.entitlement_id))],
                assigned_membership_ids=tuple(assignments_by_definition_id[UUID(str(decision.entitlement_id))]),
            )
            for decision in decisions
        ]
        return tuple(sorted(states, key=lambda item: item.entitlement_key))

    def _capability_state(
        self,
        *,
        workspace_id: UUID,
        decision: CommercePlanRevisionEntitlement,
        definition: CommerceEntitlementDefinition | None,
        scope: FeatureAccessAllocationScope,
        assigned_membership_ids: tuple[UUID, ...],
    ) -> FeatureAccessCapabilityState:
        if definition is None or not definition.is_active or not definition.supports_member_seat_allocation:
            raise _read_contract_invalid(workspace_id)
        entitlement_key = str(definition.key)
        try:
            metadata = self._metadata_registry.require(entitlement_key)
        except KeyError as exc:
            raise ServiceUnavailable(
                message=t("errors", "BAD_REQUEST"),
                error="FEATURE_ACCESS_METADATA_NOT_REGISTERED",
                meta={"entitlementKey": entitlement_key},
            ) from exc
        if decision.seat_limit_kind == ResourceLimitKind.LIMITED:
            if decision.seat_limit_value is None or decision.seat_limit_value <= 0:
                raise _read_contract_invalid(workspace_id)
            capacity = LimitedFeatureAccessCapacity(limit=decision.seat_limit_value)
        elif decision.seat_limit_kind == ResourceLimitKind.UNLIMITED and decision.seat_limit_value is None:
            capacity = UnlimitedFeatureAccessCapacity()
        else:
            raise _read_contract_invalid(workspace_id)
        return FeatureAccessCapabilityState(
            entitlement_key=entitlement_key,
            metadata=metadata,
            capacity=capacity,
            revision=scope.revision,
            assigned_membership_ids=assigned_membership_ids,
        )


def _role_management_included(
    decisions: list[CommercePlanRevisionEntitlement],
    definitions_by_id: dict[UUID, CommerceEntitlementDefinition],
    workspace_id: UUID,
) -> bool:
    matches = [
        decision
        for decision in decisions
        if (
            (definition := definitions_by_id.get(UUID(str(decision.entitlement_id)))) is not None
            and str(definition.key) == WORKSPACE_ROLES_MANAGE_ENTITLEMENT
        )
    ]
    if len(matches) != 1:
        raise _read_contract_invalid(workspace_id)
    decision = matches[0]
    definition = definitions_by_id[UUID(str(decision.entitlement_id))]
    if not definition.is_active or not definition.supports_workspace_allocation:
        raise _read_contract_invalid(workspace_id)
    if decision.is_included:
        if str(decision.allocation_mode) != "workspace":
            raise _read_contract_invalid(workspace_id)
        return True
    if decision.allocation_mode is not None:
        raise _read_contract_invalid(workspace_id)
    return False


def _read_contract_invalid(workspace_id: UUID) -> Conflict:
    return Conflict(
        message=t("errors", "BAD_REQUEST"),
        error="FEATURE_ACCESS_READ_CONTRACT_INVALID",
        meta={"workspaceId": str(workspace_id)},
    )
