from __future__ import annotations

from typing import Annotated, Literal
from uuid import UUID

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.modules.commerce.feature_access.contracts import (
    FeatureAccessMutationResult,
    LimitedFeatureAccessCapacity,
)


class FeatureAccessAssignRequest(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    membership_id: UUID
    expected_revision: int = Field(ge=0)


class FeatureAccessMoveRequest(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    source_membership_id: UUID
    target_membership_id: UUID
    expected_revision: int = Field(ge=0)


class LimitedFeatureAccessCapacityOut(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    kind: Literal["limited"] = "limited"
    limit: int = Field(gt=0)


class UnlimitedFeatureAccessCapacityOut(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    kind: Literal["unlimited"] = "unlimited"


type FeatureAccessCapacityOut = Annotated[
    LimitedFeatureAccessCapacityOut | UnlimitedFeatureAccessCapacityOut,
    Field(discriminator="kind"),
]


class FeatureAccessAllocationOut(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    workspace_id: UUID
    feature_key: str
    revision: int = Field(ge=0)
    capacity: FeatureAccessCapacityOut
    assigned_count: int = Field(ge=0)
    available_count: int | None = Field(default=None, ge=0)
    assigned_membership_ids: tuple[UUID, ...]


class FeatureAccessMutationOut(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    operation: Literal["assign", "revoke", "move"]
    allocation: FeatureAccessAllocationOut
    replayed: bool


def feature_access_mutation_out(result: FeatureAccessMutationResult) -> FeatureAccessMutationOut:
    state = result.state
    capacity = state.capacity
    assigned_count = len(state.assigned_membership_ids)
    if isinstance(capacity, LimitedFeatureAccessCapacity):
        capacity_out: FeatureAccessCapacityOut = LimitedFeatureAccessCapacityOut(limit=capacity.limit)
        available_count = max(capacity.limit - assigned_count, 0)
    else:
        capacity_out = UnlimitedFeatureAccessCapacityOut()
        available_count = None
    return FeatureAccessMutationOut(
        operation=result.operation,
        allocation=FeatureAccessAllocationOut(
            workspace_id=state.workspace_id,
            feature_key=state.entitlement_key,
            revision=state.revision,
            capacity=capacity_out,
            assigned_count=assigned_count,
            available_count=available_count,
            assigned_membership_ids=state.assigned_membership_ids,
        ),
        replayed=result.replayed,
    )
