from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models.base import BaseModel
from src.models.commerce.billing import BillingProviderMode, ResourceLimitKind


class CreditGrantSource(StrEnum):
    PLAN_PERIOD = "plan_period"
    PROMOTIONAL = "promotional"
    TOP_UP = "top_up"
    ADJUSTMENT = "adjustment"
    LEGACY_UNATTRIBUTED = "legacy_unattributed"


class CreditLotAllocationStatus(StrEnum):
    RESERVED = "reserved"
    SETTLED = "settled"


class CreditUsageEventType(StrEnum):
    RESERVED = "reserved"
    COMMITTED = "committed"
    RELEASED = "released"


class CreditLotMutationKind(StrEnum):
    ADJUSTMENT = "adjustment"
    REFUND = "refund"
    EXPIRATION = "expiration"


class PlanPeriodGrantReason(StrEnum):
    ACTIVATION = "activation"
    RENEWAL = "renewal"
    RECOVERY = "recovery"


class MemberCreditCommandScopeKind(StrEnum):
    DEFAULT = "default"
    OVERRIDE = "override"


class MemberCreditCommandOperation(StrEnum):
    SET_DEFAULT = "set_default"
    SET_OVERRIDE = "set_override"
    CLEAR_OVERRIDE = "clear_override"


class WorkspaceCreditGrantLot(BaseModel):
    """Immutable-source Credit allocation with mutable remaining and reservation counters."""

    workspace = fields.ForeignKeyField("models.Workspace", related_name="credit_grant_lots", on_delete=fields.RESTRICT)
    account = fields.ForeignKeyField(
        "models.WorkspaceCreditAccount", related_name="grant_lots", on_delete=fields.RESTRICT
    )
    subscription = fields.ForeignKeyField(
        "models.WorkspaceSubscription", related_name="credit_grant_lots", on_delete=fields.RESTRICT
    )
    plan_revision = fields.ForeignKeyField(
        "models.CommercePlanRevision", related_name="credit_grant_lots", on_delete=fields.RESTRICT
    )
    source = fields.CharEnumField(CreditGrantSource, db_index=True)
    source_identity = fields.CharField(max_length=255, unique=True)
    granted_credits = fields.BigIntField()
    remaining_credits = fields.BigIntField()
    reserved_credits = fields.BigIntField(default=0)
    issued_at = fields.DatetimeField(db_index=True)
    expires_at = fields.DatetimeField(null=True, db_index=True)
    actor_user_id = fields.UUIDField(null=True, db_index=True)
    description_key = fields.CharField(max_length=128)

    if TYPE_CHECKING:
        workspace_id: UUID
        account_id: UUID
        subscription_id: UUID
        plan_revision_id: UUID

    class Meta(BaseModel.Meta):
        table = "commerce_workspace_credit_grant_lots"
        table_description = "Source-attributed Workspace Credit lots with deterministic depletion state."
        abstract = False
        indexes = (
            ("workspace_id", "source", "expires_at", "issued_at"),
            ("account_id", "expires_at", "issued_at"),
        )


class WorkspaceCreditLotAllocation(BaseModel):
    """Exact Credit-lot allocation for one AI budget reservation."""

    lot = fields.ForeignKeyField(
        "models.WorkspaceCreditGrantLot", related_name="allocations", on_delete=fields.RESTRICT
    )
    reservation = fields.ForeignKeyField(
        "models.AIBudgetReservation", related_name="credit_lot_allocations", on_delete=fields.RESTRICT
    )
    request_id = fields.UUIDField(db_index=True)
    reserved_credits = fields.BigIntField()
    committed_credits = fields.BigIntField(default=0)
    released_credits = fields.BigIntField(default=0)
    status = fields.CharEnumField(
        CreditLotAllocationStatus,
        default=CreditLotAllocationStatus.RESERVED,
        db_index=True,
    )

    if TYPE_CHECKING:
        lot_id: UUID
        reservation_id: UUID

    class Meta(BaseModel.Meta):
        table = "commerce_workspace_credit_lot_allocations"
        table_description = "Reservation-bound allocation of Credits across source lots."
        abstract = False
        unique_together = (("lot_id", "reservation_id"),)
        indexes = (
            ("request_id", "status"),
            ("reservation_id", "status"),
        )


class WorkspaceCreditLotMutation(BaseModel):
    """Append-only non-reservation mutation of one exact Credit lot."""

    lot = fields.ForeignKeyField("models.WorkspaceCreditGrantLot", related_name="mutations", on_delete=fields.RESTRICT)
    ledger_entry = fields.ForeignKeyField(
        "models.WorkspaceCreditLedger", related_name="lot_mutations", on_delete=fields.RESTRICT
    )
    kind = fields.CharEnumField(CreditLotMutationKind, db_index=True)
    delta_remaining_credits = fields.BigIntField()
    source_identity = fields.CharField(max_length=255, unique=True)
    actor_user_id = fields.UUIDField(null=True, db_index=True)
    reason = fields.TextField()
    evidence_reference = fields.CharField(max_length=255)
    occurred_at = fields.DatetimeField(db_index=True)

    if TYPE_CHECKING:
        lot_id: UUID
        ledger_entry_id: UUID

    class Meta(BaseModel.Meta):
        table = "commerce_workspace_credit_lot_mutations"
        table_description = "Append-only adjustment, refund, and expiry changes to exact Credit lots."
        abstract = False
        unique_together = (("lot_id", "ledger_entry_id"),)
        indexes = (("ledger_entry_id", "created_at"),)


class CommercePlanPeriodGrant(BaseModel):
    """Durable exact-once evidence for one Provider-earned Plan Credit grant."""

    workspace = fields.ForeignKeyField(
        "models.Workspace", related_name="commerce_plan_period_grants", on_delete=fields.RESTRICT
    )
    account = fields.ForeignKeyField(
        "models.WorkspaceCreditAccount", related_name="period_grants", on_delete=fields.RESTRICT
    )
    subscription = fields.ForeignKeyField(
        "models.WorkspaceSubscription", related_name="period_grants", on_delete=fields.RESTRICT
    )
    plan_revision = fields.ForeignKeyField(
        "models.CommercePlanRevision", related_name="period_grants", on_delete=fields.RESTRICT
    )
    application = fields.OneToOneField(
        "models.CommerceProviderEventApplication",
        related_name="period_credit_grant",
        on_delete=fields.RESTRICT,
    )
    ledger_entry = fields.OneToOneField(
        "models.WorkspaceCreditLedger",
        related_name="period_grant_receipt",
        on_delete=fields.RESTRICT,
    )
    grant_lot = fields.OneToOneField(
        "models.WorkspaceCreditGrantLot",
        related_name="period_grant_receipt",
        on_delete=fields.RESTRICT,
        null=True,
    )
    grant_identity = fields.CharField(max_length=160, unique=True)
    reason = fields.CharEnumField(PlanPeriodGrantReason)
    provider = fields.CharField(max_length=32)
    provider_mode = fields.CharEnumField(BillingProviderMode)
    provider_account_id = fields.CharField(max_length=255)
    provider_event_id = fields.CharField(max_length=255)
    provider_period_identity = fields.CharField(max_length=255)
    period_start = fields.DatetimeField()
    period_end = fields.DatetimeField()
    granted_credits = fields.BigIntField()

    if TYPE_CHECKING:
        workspace_id: UUID
        account_id: UUID
        subscription_id: UUID
        plan_revision_id: UUID
        application_id: UUID
        ledger_entry_id: UUID
        grant_lot_id: UUID | None

    class Meta(BaseModel.Meta):
        table = "commerce_plan_period_grants"
        table_description = "Exact Provider period and Revision evidence for Plan Credit grants."
        abstract = False
        indexes = (
            ("workspace_id", "period_start", "period_end"),
            ("provider", "provider_mode", "provider_account_id", "provider_period_identity"),
        )


class WorkspaceMemberCreditPolicy(BaseModel):
    """Workspace default monthly member Credit limit and revision authority."""

    workspace = fields.OneToOneField("models.Workspace", related_name="member_credit_policy", on_delete=fields.CASCADE)
    default_limit_kind = fields.CharEnumField(
        ResourceLimitKind,
        default=ResourceLimitKind.UNLIMITED,
    )
    default_limit_credits = fields.BigIntField(null=True)
    revision = fields.BigIntField(default=1)
    updated_by_user_id = fields.UUIDField(null=True, db_index=True)

    if TYPE_CHECKING:
        workspace_id: UUID

    class Meta(BaseModel.Meta):
        table = "commerce_workspace_member_credit_policies"
        table_description = "Workspace default member Credit limit policy."
        abstract = False


class WorkspaceMemberCreditLimitOverride(BaseModel):
    """Explicit active-membership override of the Workspace default Credit limit."""

    workspace = fields.ForeignKeyField(
        "models.Workspace", related_name="member_credit_limit_overrides", on_delete=fields.CASCADE
    )
    membership = fields.OneToOneField(
        "models.WorkspaceMembership",
        related_name="credit_limit_override",
        on_delete=fields.CASCADE,
    )
    limit_kind = fields.CharEnumField(ResourceLimitKind)
    limit_credits = fields.BigIntField(null=True)
    revision = fields.BigIntField(default=1)
    updated_by_user_id = fields.UUIDField(null=True, db_index=True)

    if TYPE_CHECKING:
        workspace_id: UUID
        membership_id: UUID

    class Meta(BaseModel.Meta):
        table = "commerce_workspace_member_credit_limit_overrides"
        table_description = "Explicit per-member monthly Credit limit overrides."
        abstract = False
        unique_together = (("workspace_id", "membership_id"),)


class WorkspaceMemberCreditCommandReceipt(BaseModel):
    """Immutable result for one Workspace-scoped member Credit configuration command."""

    workspace = fields.ForeignKeyField(
        "models.Workspace", related_name="member_credit_command_receipts", on_delete=fields.CASCADE
    )
    scope_kind = fields.CharEnumField(MemberCreditCommandScopeKind)
    membership_id = fields.UUIDField(null=True)
    idempotency_key_hash = fields.CharField(max_length=64)
    request_fingerprint = fields.CharField(max_length=64)
    operation = fields.CharEnumField(MemberCreditCommandOperation)
    result_revision = fields.BigIntField()
    result_snapshot = fields.JSONField()
    audit_event = fields.ForeignKeyField(
        "models.AuditEvent",
        source_field="audit_event_id",
        related_name="commerce_member_credit_command_receipts",
        on_delete=fields.RESTRICT,
    )

    if TYPE_CHECKING:
        workspace_id: UUID
        audit_event_id: UUID

    class Meta(BaseModel.Meta):
        table = "commerce_workspace_member_credit_command_receipts"
        table_description = "Durable idempotency receipts for member Credit configuration commands."
        abstract = False
        unique_together = (("workspace_id", "idempotency_key_hash"),)
        indexes = (
            ("workspace_id", "created_at"),
            ("membership_id", "created_at"),
        )


class WorkspaceMemberCreditUsagePeriod(BaseModel):
    """Serialized current-period member reservation and committed Credit counters."""

    workspace = fields.ForeignKeyField(
        "models.Workspace", related_name="member_credit_usage_periods", on_delete=fields.CASCADE
    )
    membership_id = fields.UUIDField(db_index=True)
    period_start = fields.DatetimeField(db_index=True)
    period_end = fields.DatetimeField(db_index=True)
    reserved_credits = fields.BigIntField(default=0)
    committed_credits = fields.BigIntField(default=0)
    revision = fields.BigIntField(default=1)

    if TYPE_CHECKING:
        workspace_id: UUID

    class Meta(BaseModel.Meta):
        table = "commerce_workspace_member_credit_usage_periods"
        table_description = "Current billing-period member Credit usage and reservations."
        abstract = False
        unique_together = (("workspace_id", "membership_id", "period_start", "period_end"),)
        indexes = (("workspace_id", "period_start", "period_end"),)


class WorkspaceCreditUsageEvent(BaseModel):
    """Append-only actor, Project, Agent, capability, and settlement attribution."""

    workspace = fields.ForeignKeyField(
        "models.Workspace", related_name="credit_usage_events", on_delete=fields.RESTRICT
    )
    membership_id = fields.UUIDField(db_index=True)
    actor_user_id = fields.UUIDField(db_index=True)
    account = fields.ForeignKeyField(
        "models.WorkspaceCreditAccount", related_name="usage_events", on_delete=fields.RESTRICT
    )
    reservation = fields.ForeignKeyField(
        "models.AIBudgetReservation", related_name="credit_usage_events", on_delete=fields.RESTRICT
    )
    request_id = fields.UUIDField(db_index=True)
    event_type = fields.CharEnumField(CreditUsageEventType, db_index=True)
    credits = fields.BigIntField()
    cost_micros = fields.BigIntField(null=True)
    project_id = fields.UUIDField(null=True, db_index=True)
    agent_run_id = fields.UUIDField(null=True, db_index=True)
    capability_key = fields.CharField(max_length=160, db_index=True)
    occurred_at = fields.DatetimeField(db_index=True)

    if TYPE_CHECKING:
        workspace_id: UUID
        account_id: UUID
        reservation_id: UUID

    class Meta(BaseModel.Meta):
        table = "commerce_workspace_credit_usage_events"
        table_description = "Append-only member and operation Credit attribution events."
        abstract = False
        unique_together = (("reservation_id", "event_type"),)
        indexes = (
            ("workspace_id", "occurred_at"),
            ("membership_id", "occurred_at"),
            ("project_id", "occurred_at"),
            ("agent_run_id", "occurred_at"),
        )
