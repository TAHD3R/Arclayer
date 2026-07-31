from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal, Protocol
from uuid import UUID

from pydantic import ConfigDict, Field, field_validator, model_validator
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.schemas import BaseSchema
from src.modules.commerce.convergence.schema import FeatureAccessConvergenceCommand

FEATURE_ACCESS_MANAGE_PERMISSION = "workspace:feature-seats:manage"

type CommercialAccessState = Literal["normal", "payment_grace", "payment_restricted"]
type FeatureAllocationMode = Literal["workspace", "member_seat"]
type FeatureAccessOperation = Literal["assign", "revoke", "move"]
type FeatureAccessWriteConflictCode = Literal[
    "revision_conflict",
    "capacity_exhausted",
    "idempotency_conflict",
    "already_assigned",
    "not_assigned",
]


class LimitedFeatureAccessCapacity(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    kind: Literal["limited"] = "limited"
    limit: int = Field(gt=0)


class UnlimitedFeatureAccessCapacity(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    kind: Literal["unlimited"] = "unlimited"


type FeatureAccessCapacity = Annotated[
    LimitedFeatureAccessCapacity | UnlimitedFeatureAccessCapacity,
    Field(discriminator="kind"),
]


class FeatureAccessEntitlement(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    key: str = Field(min_length=3, max_length=160, pattern=r"^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$")
    included: bool
    allocation_mode: FeatureAllocationMode
    capacity: FeatureAccessCapacity | None


class FeatureAccessCommercialSnapshot(BaseSchema):
    """Revision-bound commercial facts required for one allocation command."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    workspace_id: UUID
    subscription_revision: int | None = Field(default=None, ge=1)
    subscription_active: bool
    role_management_included: bool
    commercial_access_state: CommercialAccessState
    entitlement: FeatureAccessEntitlement | None


class FeatureAccessActor(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    user_id: UUID
    active_member: bool
    is_workspace_owner: bool
    workspace_permissions: tuple[str, ...]


class ActiveFeatureAccessMembership(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    workspace_id: UUID
    membership_id: UUID
    user_id: UUID


class _FeatureAccessCommand(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    workspace_id: UUID
    actor_user_id: UUID
    entitlement_key: str = Field(
        min_length=3,
        max_length=160,
        pattern=r"^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$",
    )
    expected_revision: int = Field(ge=0)
    idempotency_key: str = Field(min_length=1, max_length=255)

    @field_validator("idempotency_key", mode="after")
    @classmethod
    def normalize_idempotency_key(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("idempotency key must not be blank")
        return normalized


class AssignFeatureAccessCommand(_FeatureAccessCommand):
    membership_id: UUID


class RevokeFeatureAccessCommand(_FeatureAccessCommand):
    membership_id: UUID


class MoveFeatureAccessCommand(_FeatureAccessCommand):
    source_membership_id: UUID
    target_membership_id: UUID

    @model_validator(mode="after")
    def require_distinct_memberships(self) -> MoveFeatureAccessCommand:
        if self.source_membership_id == self.target_membership_id:
            raise ValueError("source and target memberships must be distinct")
        return self


class FeatureAccessAllocationState(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    workspace_id: UUID
    entitlement_key: str
    revision: int = Field(ge=0)
    capacity: FeatureAccessCapacity
    assigned_membership_ids: tuple[UUID, ...]


class FeatureAccessMutationResult(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    operation: FeatureAccessOperation
    state: FeatureAccessAllocationState
    replayed: bool


class FeatureAccessMembershipRelease(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    workspace_id: UUID
    membership_id: UUID
    released_assignment_count: int = Field(ge=0)


class FeatureAccessConvergenceScopeResult(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    entitlement_key: str
    expected_revision: int = Field(ge=0)
    result_revision: int = Field(ge=0)
    reviewed_assignment_ids: tuple[UUID, ...]
    retained_assignment_ids: tuple[UUID, ...]
    ended_assignment_ids: tuple[UUID, ...]


class FeatureAccessConvergenceResult(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    convergence_id: UUID
    workspace_id: UUID
    target_revision_id: UUID
    effective_at: datetime
    reviewed_assignment_ids: tuple[UUID, ...]
    retained_assignment_ids: tuple[UUID, ...]
    ended_assignment_ids: tuple[UUID, ...]
    scopes: tuple[FeatureAccessConvergenceScopeResult, ...]
    replayed: bool


class FeatureAccessWriteConflict(RuntimeError):
    def __init__(self, code: FeatureAccessWriteConflictCode, state: FeatureAccessAllocationState) -> None:
        self.code = code
        self.state = state
        super().__init__(code)


class FeatureAccessCommercialAuthority(Protocol):
    """Resolve a revision-bound snapshot that remains stable in the caller transaction."""

    async def resolve_feature_access(
        self,
        *,
        workspace_id: UUID,
        entitlement_key: str,
        conn: BaseDBAsyncClient,
    ) -> FeatureAccessCommercialSnapshot | None: ...


class FeatureAccessActorAuthority(Protocol):
    async def resolve_actor(
        self,
        *,
        workspace_id: UUID,
        actor_user_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> FeatureAccessActor | None: ...


class FeatureAccessMembershipAuthority(Protocol):
    async def require_active_membership(
        self,
        *,
        workspace_id: UUID,
        membership_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> ActiveFeatureAccessMembership | None: ...


class FeatureAccessPersistence(Protocol):
    """Atomic allocation persistence boundary.

    Implementations must lock the Workspace and Entitlement allocation scope before
    revision, idempotency, active-assignment uniqueness, and limited-capacity checks.
    The mutation and its audit/idempotency record commit through the caller's
    transaction. Membership release is idempotent and never restores ended records.
    """

    async def assign_serialized(
        self,
        *,
        command: AssignFeatureAccessCommand,
        capacity: FeatureAccessCapacity,
        fingerprint: str,
        conn: BaseDBAsyncClient,
    ) -> FeatureAccessMutationResult: ...

    async def revoke_serialized(
        self,
        *,
        command: RevokeFeatureAccessCommand,
        capacity: FeatureAccessCapacity,
        fingerprint: str,
        conn: BaseDBAsyncClient,
    ) -> FeatureAccessMutationResult: ...

    async def move_serialized(
        self,
        *,
        command: MoveFeatureAccessCommand,
        capacity: FeatureAccessCapacity,
        fingerprint: str,
        conn: BaseDBAsyncClient,
    ) -> FeatureAccessMutationResult: ...

    async def release_membership_assignments(
        self,
        *,
        workspace_id: UUID,
        membership_id: UUID,
        lifecycle_idempotency_key: str,
        conn: BaseDBAsyncClient,
    ) -> FeatureAccessMembershipRelease: ...


class FeatureAccessConvergenceOutbox(Protocol):
    """Append one immutable convergence result in the caller's transaction."""

    async def append_feature_access_convergence(
        self,
        *,
        result: FeatureAccessConvergenceResult,
        conn: BaseDBAsyncClient,
    ) -> None: ...


class FeatureAccessConvergencePersistence(Protocol):
    async def apply_convergence_serialized(
        self,
        *,
        command: FeatureAccessConvergenceCommand,
        conn: BaseDBAsyncClient,
    ) -> FeatureAccessConvergenceResult: ...
