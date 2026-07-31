from __future__ import annotations

from typing import cast
from uuid import UUID, uuid4

from src.modules.commerce.feature_access.contracts import (
    AssignFeatureAccessCommand,
    FeatureAccessAllocationState,
    FeatureAccessMutationResult,
    LimitedFeatureAccessCapacity,
    MoveFeatureAccessCommand,
    RevokeFeatureAccessCommand,
)
from src.modules.commerce.feature_access.read_contracts import (
    FeatureAccessCapabilityMetadata,
    FeatureAccessReadResult,
    ManagerFeatureAccessCapability,
    MemberFeatureAccessCapability,
)
from src.modules.commerce.feature_access.read_service import FeatureAccessReadService
from src.modules.commerce.feature_access.router import (
    assign_feature_access,
    move_feature_access,
    read_feature_access,
    revoke_feature_access,
)
from src.modules.commerce.feature_access.schema import (
    FeatureAccessAssignRequest,
    FeatureAccessMoveRequest,
)
from src.modules.commerce.feature_access.service import FeatureAccessService


class _Service:
    def __init__(self) -> None:
        self.commands: list[AssignFeatureAccessCommand | MoveFeatureAccessCommand | RevokeFeatureAccessCommand] = []

    async def assign(self, command: AssignFeatureAccessCommand) -> FeatureAccessMutationResult:
        self.commands.append(command)
        return _result("assign", command.workspace_id, command.entitlement_key, (command.membership_id,))

    async def move(self, command: MoveFeatureAccessCommand) -> FeatureAccessMutationResult:
        self.commands.append(command)
        return _result("move", command.workspace_id, command.entitlement_key, (command.target_membership_id,))

    async def revoke(self, command: RevokeFeatureAccessCommand) -> FeatureAccessMutationResult:
        self.commands.append(command)
        return _result("revoke", command.workspace_id, command.entitlement_key, ())


class _ReadService:
    def __init__(self, result: FeatureAccessReadResult) -> None:
        self.result = result
        self.calls: list[tuple[UUID, UUID]] = []

    async def read(self, *, workspace_id: UUID, actor_user_id: UUID) -> FeatureAccessReadResult:
        self.calls.append((workspace_id, actor_user_id))
        return self.result


class _CommercialPolicy:
    def __init__(self) -> None:
        self.calls: list[tuple[UUID, set[str]]] = []

    async def authorize(self, *, workspace_id: UUID, effects) -> None:
        self.calls.append((workspace_id, {effect.value for effect in effects}))


def _result(
    operation: str,
    workspace_id: UUID,
    feature_key: str,
    memberships: tuple[UUID, ...],
) -> FeatureAccessMutationResult:
    return FeatureAccessMutationResult.model_construct(
        operation=operation,
        state=FeatureAccessAllocationState(
            workspace_id=workspace_id,
            entitlement_key=feature_key,
            revision=2,
            capacity=LimitedFeatureAccessCapacity(limit=3),
            assigned_membership_ids=memberships,
        ),
        replayed=False,
    )


async def test_router_builds_typed_commands_and_returns_plain_access_capacity() -> None:
    workspace_id = uuid4()
    actor_user_id = uuid4()
    source_membership_id = uuid4()
    target_membership_id = uuid4()
    service = _Service()
    dependency = cast(FeatureAccessService, service)
    commercial_policy = _CommercialPolicy()

    assigned = await assign_feature_access(
        workspace_id=workspace_id,
        entitlement_key="agents.member-access",
        payload=FeatureAccessAssignRequest(membership_id=source_membership_id, expected_revision=0),
        actor_user_id=actor_user_id,
        idempotency_key="assign-key",
        service=dependency,
        commercial_policy=cast(object, commercial_policy),
    )
    moved = await move_feature_access(
        workspace_id=workspace_id,
        entitlement_key="agents.member-access",
        payload=FeatureAccessMoveRequest(
            source_membership_id=source_membership_id,
            target_membership_id=target_membership_id,
            expected_revision=1,
        ),
        actor_user_id=actor_user_id,
        idempotency_key="move-key",
        service=dependency,
        commercial_policy=cast(object, commercial_policy),
    )
    revoked = await revoke_feature_access(
        workspace_id=workspace_id,
        entitlement_key="agents.member-access",
        membership_id=target_membership_id,
        expected_revision=2,
        actor_user_id=actor_user_id,
        idempotency_key="revoke-key",
        service=dependency,
        commercial_policy=cast(object, commercial_policy),
    )

    assert [type(command) for command in service.commands] == [
        AssignFeatureAccessCommand,
        MoveFeatureAccessCommand,
        RevokeFeatureAccessCommand,
    ]
    assert assigned.data is not None
    assert assigned.data.allocation.assigned_count == 1
    assert assigned.data.allocation.available_count == 2
    assert assigned.data.model_dump(by_alias=True)["allocation"]["featureKey"] == "agents.member-access"
    assert moved.data is not None and moved.data.operation == "move"
    assert revoked.data is not None and revoked.data.allocation.assigned_membership_ids == ()
    assert commercial_policy.calls == [
        (workspace_id, {"assign_feature_seat"}),
        (workspace_id, {"assign_feature_seat"}),
        (workspace_id, {"revoke_feature_seat"}),
    ]


async def test_read_router_preserves_discriminated_member_and_manager_projections() -> None:
    workspace_id = uuid4()
    actor_user_id = uuid4()
    membership_id = uuid4()
    metadata = FeatureAccessCapabilityMetadata(
        entitlement_key="agents.member-access",
        name_i18n_key="featureAccess:AGENT_ACCESS_NAME",
        description_i18n_key="featureAccess:AGENT_ACCESS_DESCRIPTION",
    )
    service = _ReadService(
        FeatureAccessReadResult(
            workspace_id=workspace_id,
            capabilities=(
                MemberFeatureAccessCapability(
                    entitlement_key="agents.member-access",
                    metadata=metadata,
                    capacity=LimitedFeatureAccessCapacity(limit=3),
                    revision=2,
                    assigned_count=1,
                    available_count=2,
                    current_membership_assigned=False,
                ),
                ManagerFeatureAccessCapability(
                    entitlement_key="agents.member-access",
                    metadata=metadata,
                    capacity=LimitedFeatureAccessCapacity(limit=3),
                    revision=2,
                    assigned_count=1,
                    available_count=2,
                    assigned_membership_ids=(membership_id,),
                ),
            ),
        )
    )

    response = await read_feature_access(
        workspace_id=workspace_id,
        actor_user_id=actor_user_id,
        service=cast(FeatureAccessReadService, service),
    )

    assert service.calls == [(workspace_id, actor_user_id)]
    assert response.data is not None
    payload = response.data.model_dump(by_alias=True)
    assert payload["capabilities"][0]["projection"] == "member"
    assert "assignedMembershipIds" not in payload["capabilities"][0]
    assert payload["capabilities"][1]["projection"] == "manager"
    assert payload["capabilities"][1]["assignedMembershipIds"] == (membership_id,)
