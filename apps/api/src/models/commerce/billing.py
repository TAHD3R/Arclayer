from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models.base import BaseModel


class PlanRevisionStatus(StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"
    RETIRED = "retired"


class BillingCycle(StrEnum):
    MONTHLY = "monthly"
    YEARLY = "yearly"


class BillingProviderMode(StrEnum):
    TEST = "test"
    LIVE = "live"


class SubscriptionStatus(StrEnum):
    ACTIVE = "active"
    PAST_DUE = "past_due"
    CANCELED = "canceled"


class CreditRefreshInterval(StrEnum):
    DAILY = "daily"
    MONTHLY = "monthly"
    YEARLY = "yearly"
    NONE = "none"


class ResourceLimitKind(StrEnum):
    LIMITED = "limited"
    UNLIMITED = "unlimited"


class EntitlementAllocationMode(StrEnum):
    WORKSPACE = "workspace"
    MEMBER_SEAT = "member_seat"


class CreditLedgerEntryType(StrEnum):
    PERIOD_GRANT = "period_grant"
    PROMOTIONAL_GRANT = "promotional_grant"
    TOP_UP = "top_up"
    RESERVATION = "reservation"
    COMMIT = "commit"
    RELEASE = "release"
    ADJUSTMENT = "adjustment"
    REFUND = "refund"
    EXPIRATION = "expiration"


class SubscriptionTransitionStatus(StrEnum):
    SCHEDULED = "scheduled"
    APPLIED = "applied"
    CANCELED = "canceled"
    FAILED = "failed"


class CommercialAccessState(StrEnum):
    NORMAL = "normal"
    PAYMENT_GRACE = "payment_grace"
    PAYMENT_RESTRICTED = "payment_restricted"


class CommerceCatalogCommandAction(StrEnum):
    """Catalog mutations that retain an exact idempotency result."""

    CREATE_PLAN = "create_plan"
    CREATE_DRAFT = "create_draft"
    UPDATE_DRAFT = "update_draft"
    PUBLISH_DRAFT = "publish_draft"


class CommercePlan(BaseModel):
    """Stable product-offer identity; commercial terms live only on revisions."""

    code = fields.CharField(max_length=48, unique=True, db_index=True)
    is_active = fields.BooleanField(default=True, db_index=True)
    sort_order = fields.IntField(default=100, db_index=True)

    class Meta(BaseModel.Meta):
        table = "commerce_plans"
        table_description = "Stable Workspace commercial offer identities."
        abstract = False


class CommercePlanRevision(BaseModel):
    """Draft or immutable published commercial terms for one Plan."""

    plan = fields.ForeignKeyField("models.CommercePlan", related_name="revisions", on_delete=fields.RESTRICT)
    sequence = fields.IntField()
    status = fields.CharEnumField(PlanRevisionStatus, default=PlanRevisionStatus.DRAFT, db_index=True)
    name_i18n_key = fields.CharField(max_length=128)
    description_i18n_key = fields.CharField(max_length=128)
    credit_grant_amount = fields.BigIntField()
    credit_refresh_interval = fields.CharEnumField(CreditRefreshInterval)
    credit_value_micros = fields.BigIntField()
    currency = fields.CharField(max_length=3)
    content_hash = fields.CharField(max_length=64, null=True, unique=True)
    published_at = fields.DatetimeField(null=True, db_index=True)
    is_selling = fields.BooleanField(default=False, db_index=True)
    revision = fields.BigIntField(default=1)

    if TYPE_CHECKING:
        plan_id: UUID

    class Meta(BaseModel.Meta):
        table = "commerce_plan_revisions"
        table_description = "Draft and immutable published Plan commercial terms."
        abstract = False
        unique_together = (("plan_id", "sequence"),)
        indexes = (("plan_id", "status", "sequence"),)


class CommerceCatalogCommandReceipt(BaseModel):
    """Immutable catalog command result and its required Activity evidence."""

    action = fields.CharEnumField(CommerceCatalogCommandAction, max_length=32)
    idempotency_key_hash = fields.CharField(max_length=64)
    request_fingerprint = fields.CharField(max_length=64)
    actor_user_id = fields.UUIDField(null=True)
    actor_session_id = fields.UUIDField(null=True)
    target_plan_code = fields.CharField(max_length=48)
    plan = fields.ForeignKeyField("models.CommercePlan", related_name="command_receipts", on_delete=fields.RESTRICT)
    plan_revision = fields.ForeignKeyField(
        "models.CommercePlanRevision",
        related_name="command_receipts",
        on_delete=fields.RESTRICT,
        null=True,
    )
    result_revision = fields.BigIntField()
    result_snapshot = fields.JSONField()
    audit_event = fields.ForeignKeyField(
        "models.AuditEvent",
        source_field="audit_event_id",
        related_name="commerce_catalog_command_receipts",
        on_delete=fields.RESTRICT,
    )

    if TYPE_CHECKING:
        plan_id: UUID
        plan_revision_id: UUID | None
        audit_event_id: UUID

    class Meta(BaseModel.Meta):
        table = "commerce_catalog_command_receipts"
        table_description = "Immutable exact results and Activity evidence for catalog commands."
        abstract = False
        unique_together = (("target_plan_code", "action", "idempotency_key_hash"),)
        indexes = (("plan_id", "created_at"), ("plan_revision_id", "created_at"))


class CommercePlanRevisionPrice(BaseModel):
    """Revision-scoped Provider Price mapping and exact price snapshot."""

    plan_revision = fields.ForeignKeyField(
        "models.CommercePlanRevision", related_name="prices", on_delete=fields.CASCADE
    )
    provider = fields.CharField(max_length=32)
    provider_mode = fields.CharEnumField(BillingProviderMode)
    billing_cycle = fields.CharEnumField(BillingCycle)
    currency = fields.CharField(max_length=3)
    amount_micros = fields.BigIntField()
    external_price_id = fields.CharField(max_length=255)

    if TYPE_CHECKING:
        plan_revision_id: UUID

    class Meta(BaseModel.Meta):
        table = "commerce_plan_revision_prices"
        table_description = "Provider Price mappings bound to immutable Plan Revisions."
        abstract = False
        unique_together = (("plan_revision_id", "provider", "provider_mode", "billing_cycle", "currency"),)
        indexes = (("provider", "provider_mode", "external_price_id"),)


class CommerceResourceDefinition(BaseModel):
    """Registered typed commercial resource allowance definition."""

    key = fields.CharField(max_length=128, unique=True, db_index=True)
    is_active = fields.BooleanField(default=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "commerce_resource_definitions"
        table_description = "Registered typed commercial resource allowance keys."
        abstract = False


class CommercePlanRevisionResourceAllowance(BaseModel):
    """One explicit resource allowance on one Plan Revision."""

    plan_revision = fields.ForeignKeyField(
        "models.CommercePlanRevision", related_name="resource_allowances", on_delete=fields.CASCADE
    )
    resource = fields.ForeignKeyField(
        "models.CommerceResourceDefinition", related_name="revision_allowances", on_delete=fields.RESTRICT
    )
    limit_kind = fields.CharEnumField(ResourceLimitKind)
    limit_value = fields.BigIntField(null=True)

    if TYPE_CHECKING:
        plan_revision_id: UUID
        resource_id: UUID

    class Meta(BaseModel.Meta):
        table = "commerce_plan_revision_resource_allowances"
        table_description = "Explicit typed resource allowances for a Plan Revision."
        abstract = False
        unique_together = (("plan_revision_id", "resource_id"),)


class CommerceEntitlementDefinition(BaseModel):
    """Registered authorization entitlement and its supported allocation modes."""

    key = fields.CharField(max_length=160, unique=True, db_index=True)
    supports_workspace_allocation = fields.BooleanField(default=True)
    supports_member_seat_allocation = fields.BooleanField(default=False)
    is_active = fields.BooleanField(default=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "commerce_entitlement_definitions"
        table_description = "Registered Workspace commercial entitlement definitions."
        abstract = False


class CommercePlanRevisionEntitlement(BaseModel):
    """One explicit included or excluded entitlement on a Plan Revision."""

    plan_revision = fields.ForeignKeyField(
        "models.CommercePlanRevision", related_name="entitlements", on_delete=fields.CASCADE
    )
    entitlement = fields.ForeignKeyField(
        "models.CommerceEntitlementDefinition", related_name="revision_entitlements", on_delete=fields.RESTRICT
    )
    is_included = fields.BooleanField()
    allocation_mode = fields.CharEnumField(EntitlementAllocationMode, null=True)
    seat_limit_kind = fields.CharEnumField(ResourceLimitKind, null=True)
    seat_limit_value = fields.BigIntField(null=True)

    if TYPE_CHECKING:
        plan_revision_id: UUID
        entitlement_id: UUID

    class Meta(BaseModel.Meta):
        table = "commerce_plan_revision_entitlements"
        table_description = "Explicit entitlement decisions and Feature Seat limits per Plan Revision."
        abstract = False
        unique_together = (("plan_revision_id", "entitlement_id"),)


class WorkspaceSubscription(BaseModel):
    """One Workspace commercial lifecycle bound to exactly one published Revision."""

    workspace = fields.OneToOneField("models.Workspace", related_name="commerce_subscription", on_delete=fields.CASCADE)
    plan_revision = fields.ForeignKeyField(
        "models.CommercePlanRevision", related_name="workspace_subscriptions", on_delete=fields.RESTRICT
    )
    status = fields.CharEnumField(SubscriptionStatus, default=SubscriptionStatus.ACTIVE, db_index=True)
    billing_cycle = fields.CharEnumField(BillingCycle)
    current_period_start = fields.DatetimeField()
    current_period_end = fields.DatetimeField(db_index=True)
    cancel_at_period_end = fields.BooleanField(default=False)
    billing_provider = fields.CharField(max_length=32)
    provider_mode = fields.CharEnumField(BillingProviderMode, null=True)
    external_customer_id = fields.CharField(max_length=128, null=True, db_index=True)
    external_subscription_id = fields.CharField(max_length=128, null=True, unique=True)
    revision = fields.BigIntField(default=1)

    if TYPE_CHECKING:
        workspace_id: UUID
        plan_revision_id: UUID

    class Meta(BaseModel.Meta):
        table = "commerce_workspace_subscriptions"
        table_description = "Workspace subscriptions bound to immutable Plan Revisions."
        abstract = False
        indexes = (("plan_revision_id", "status"),)


class WorkspaceCreditAccount(BaseModel):
    """Locked Workspace credit balance cache for one current Subscription."""

    workspace = fields.OneToOneField("models.Workspace", related_name="credit_account", on_delete=fields.CASCADE)
    subscription = fields.OneToOneField(
        "models.WorkspaceSubscription", related_name="credit_account", on_delete=fields.CASCADE
    )
    plan_revision = fields.ForeignKeyField(
        "models.CommercePlanRevision", related_name="credit_accounts", on_delete=fields.RESTRICT
    )
    balance_credits = fields.BigIntField(default=0)
    reserved_credits = fields.BigIntField(default=0)
    period_start = fields.DatetimeField()
    period_end = fields.DatetimeField(db_index=True)
    period_identity = fields.CharField(max_length=255, unique=True)
    revision = fields.BigIntField(default=1)

    if TYPE_CHECKING:
        workspace_id: UUID
        subscription_id: UUID
        plan_revision_id: UUID

    class Meta(BaseModel.Meta):
        table = "commerce_workspace_credit_accounts"
        table_description = "Revision-bound Workspace AI Credit balance and reservation counters."
        abstract = False


class WorkspaceCreditLedger(BaseModel):
    """Append-only, revision-bound Credit accounting evidence."""

    workspace = fields.ForeignKeyField(
        "models.Workspace", related_name="commerce_credit_ledger", on_delete=fields.RESTRICT
    )
    account = fields.ForeignKeyField(
        "models.WorkspaceCreditAccount", related_name="ledger_entries", on_delete=fields.RESTRICT
    )
    subscription = fields.ForeignKeyField(
        "models.WorkspaceSubscription", related_name="credit_ledger_entries", on_delete=fields.RESTRICT
    )
    plan_revision = fields.ForeignKeyField(
        "models.CommercePlanRevision", related_name="credit_ledger_entries", on_delete=fields.RESTRICT
    )
    entry_type = fields.CharEnumField(CreditLedgerEntryType, db_index=True)
    request_id = fields.UUIDField(null=True, db_index=True)
    provider_period_identity = fields.CharField(max_length=255, null=True, db_index=True)
    estimated_cost_micros = fields.BigIntField(null=True)
    actual_cost_micros = fields.BigIntField(null=True)
    applied_credit_value_micros = fields.BigIntField()
    reserved_credits = fields.BigIntField(default=0)
    committed_credits = fields.BigIntField(default=0)
    delta_balance_credits = fields.BigIntField()
    delta_reserved_credits = fields.BigIntField()
    balance_after_credits = fields.BigIntField()
    reserved_after_credits = fields.BigIntField()
    idempotency_key = fields.CharField(max_length=160)
    actor_user_id = fields.UUIDField(null=True, db_index=True)
    description_key = fields.CharField(max_length=128)

    if TYPE_CHECKING:
        workspace_id: UUID
        account_id: UUID
        subscription_id: UUID
        plan_revision_id: UUID

    class Meta(BaseModel.Meta):
        table = "commerce_workspace_credit_ledger"
        table_description = "Immutable revision-bound Workspace Credit ledger."
        abstract = False
        unique_together = (("workspace_id", "idempotency_key"),)
        indexes = (
            ("workspace_id", "created_at"),
            ("account_id", "created_at"),
            ("provider_period_identity", "created_at"),
        )


class FeatureAccessAllocationScope(BaseModel):
    """Serialized Workspace Feature Seat allocation authority for one Entitlement."""

    workspace = fields.ForeignKeyField(
        "models.Workspace", related_name="feature_access_allocation_scopes", on_delete=fields.CASCADE
    )
    entitlement = fields.ForeignKeyField(
        "models.CommerceEntitlementDefinition",
        related_name="feature_access_allocation_scopes",
        on_delete=fields.RESTRICT,
    )
    revision = fields.BigIntField(default=1)

    if TYPE_CHECKING:
        workspace_id: UUID
        entitlement_id: UUID

    class Meta(BaseModel.Meta):
        table = "commerce_feature_access_allocation_scopes"
        table_description = "Serialized Workspace Feature Seat allocation scopes."
        abstract = False
        unique_together = (("workspace_id", "entitlement_id"),)


class FeatureAccessCommandReceipt(BaseModel):
    """Immutable idempotency result for one serialized Feature Seat command."""

    scope = fields.ForeignKeyField(
        "models.FeatureAccessAllocationScope", related_name="command_receipts", on_delete=fields.CASCADE
    )
    idempotency_key_hash = fields.CharField(max_length=64, unique=True)
    fingerprint = fields.CharField(max_length=64)
    operation = fields.CharField(max_length=16)
    result_revision = fields.BigIntField()
    result_snapshot = fields.JSONField()

    if TYPE_CHECKING:
        scope_id: UUID

    class Meta(BaseModel.Meta):
        table = "commerce_feature_access_command_receipts"
        table_description = "Immutable Feature Seat command idempotency receipts."
        abstract = False
        indexes = (("scope_id", "created_at"),)


class FeatureAccessAssignment(BaseModel):
    """One revocable Workspace Feature Seat allocation to an active membership."""

    workspace = fields.ForeignKeyField(
        "models.Workspace", related_name="feature_access_assignments", on_delete=fields.CASCADE
    )
    entitlement = fields.ForeignKeyField(
        "models.CommerceEntitlementDefinition", related_name="feature_access_assignments", on_delete=fields.RESTRICT
    )
    membership_id = fields.UUIDField(db_index=True)
    assigned_by_user_id = fields.UUIDField(null=True, db_index=True)
    started_at = fields.DatetimeField(db_index=True)
    ended_at = fields.DatetimeField(null=True, db_index=True)
    ended_reason = fields.CharField(max_length=64, null=True)
    revision = fields.BigIntField(default=1)
    idempotency_key = fields.CharField(max_length=128)

    if TYPE_CHECKING:
        workspace_id: UUID
        entitlement_id: UUID

    class Meta(BaseModel.Meta):
        table = "commerce_feature_access_assignments"
        table_description = "Workspace-owned, member-assigned commercial Feature Seats."
        abstract = False
        indexes = (("workspace_id", "entitlement_id", "ended_at"), ("membership_id", "ended_at"))


class SubscriptionRevisionTransition(BaseModel):
    """Idempotent, preview-bound Renewal Transition or local Free/manual transition."""

    source_plan_revision = fields.ForeignKeyField(
        "models.CommercePlanRevision", related_name="transition_sources", on_delete=fields.RESTRICT
    )
    target_plan_revision = fields.ForeignKeyField(
        "models.CommercePlanRevision", related_name="transition_targets", on_delete=fields.RESTRICT
    )
    actor_user_id = fields.UUIDField(null=True, db_index=True)
    reason = fields.TextField()
    preview_token_hash = fields.CharField(max_length=128, unique=True)
    idempotency_key = fields.CharField(max_length=128, unique=True)
    requested_at = fields.DatetimeField()
    status = fields.CharEnumField(
        SubscriptionTransitionStatus, default=SubscriptionTransitionStatus.SCHEDULED, db_index=True
    )
    revision = fields.BigIntField(default=1)
    correlation_id = fields.UUIDField(unique=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "commerce_subscription_revision_transitions"
        table_description = "Preview-bound Subscription Plan Revision transition authority."
        abstract = False


class SubscriptionRevisionTransitionItem(BaseModel):
    """Per-Workspace result and Provider scheduling identity for a transition."""

    transition = fields.ForeignKeyField(
        "models.SubscriptionRevisionTransition", related_name="items", on_delete=fields.CASCADE
    )
    subscription = fields.ForeignKeyField(
        "models.WorkspaceSubscription", related_name="revision_transition_items", on_delete=fields.RESTRICT
    )
    convergence = fields.ForeignKeyField(
        "models.PlanAccessConvergence",
        related_name="transition_items",
        on_delete=fields.RESTRICT,
        null=True,
    )
    requires_convergence = fields.BooleanField(default=False)
    effective_at = fields.DatetimeField(db_index=True)
    provider_schedule_id = fields.CharField(max_length=255, null=True, unique=True)
    status = fields.CharEnumField(
        SubscriptionTransitionStatus, default=SubscriptionTransitionStatus.SCHEDULED, db_index=True
    )
    result_code = fields.CharField(max_length=96, null=True)

    class Meta(BaseModel.Meta):
        table = "commerce_subscription_revision_transition_items"
        table_description = "Per-Subscription Revision transition execution results."
        abstract = False
        unique_together = (("transition_id", "subscription_id"),)


class PlanAccessConvergence(BaseModel):
    """Server-reviewed access-retirement outcome for one access-reducing transition."""

    workspace = fields.ForeignKeyField(
        "models.Workspace", related_name="plan_access_convergences", on_delete=fields.CASCADE
    )
    source_plan_revision = fields.ForeignKeyField(
        "models.CommercePlanRevision", related_name="convergence_sources", on_delete=fields.RESTRICT
    )
    target_plan_revision = fields.ForeignKeyField(
        "models.CommercePlanRevision", related_name="convergence_targets", on_delete=fields.RESTRICT
    )
    preview_token_hash = fields.CharField(max_length=128, unique=True)
    effective_at = fields.DatetimeField(db_index=True)
    status = fields.CharEnumField(
        SubscriptionTransitionStatus, default=SubscriptionTransitionStatus.SCHEDULED, db_index=True
    )
    revision = fields.BigIntField(default=1)

    class Meta(BaseModel.Meta):
        table = "commerce_plan_access_convergences"
        table_description = "Reviewed access convergence for a Workspace Plan Revision change."
        abstract = False


class PlanAccessConvergenceFeatureOutcome(BaseModel):
    """Explicit retained or end-dated Feature Seat outcome; never auto-selected."""

    convergence = fields.ForeignKeyField(
        "models.PlanAccessConvergence", related_name="feature_outcomes", on_delete=fields.CASCADE
    )
    assignment = fields.ForeignKeyField(
        "models.FeatureAccessAssignment", related_name="convergence_outcomes", on_delete=fields.RESTRICT
    )
    is_retained = fields.BooleanField()

    class Meta(BaseModel.Meta):
        table = "commerce_plan_access_convergence_feature_outcomes"
        table_description = "Explicit reviewed Feature Seat outcomes for Plan Access Convergence."
        abstract = False
        unique_together = (("convergence_id", "assignment_id"),)


class CommerceProviderEventApplication(BaseModel):
    """Exact revision-aware local application of one signed Provider event."""

    provider = fields.CharField(max_length=32)
    provider_mode = fields.CharEnumField(BillingProviderMode)
    provider_account_id = fields.CharField(max_length=255)
    provider_event_id = fields.CharField(max_length=255)
    workspace = fields.ForeignKeyField(
        "models.Workspace", related_name="commerce_provider_event_applications", on_delete=fields.RESTRICT
    )
    subscription = fields.ForeignKeyField(
        "models.WorkspaceSubscription", related_name="provider_event_applications", on_delete=fields.RESTRICT
    )
    plan_revision = fields.ForeignKeyField(
        "models.CommercePlanRevision", related_name="provider_event_applications", on_delete=fields.RESTRICT
    )
    checkout_session = fields.ForeignKeyField(
        "models.CommerceCheckoutSession",
        related_name="subscription_event_applications",
        on_delete=fields.RESTRICT,
        null=True,
    )
    checkout_outcome_command = fields.ForeignKeyField(
        "models.CommerceCheckoutOutcomeCommand",
        related_name="subscription_event_applications",
        on_delete=fields.RESTRICT,
        null=True,
    )
    provider_period_identity = fields.CharField(max_length=255, null=True)
    applied_at = fields.DatetimeField(null=True)
    result_code = fields.CharField(max_length=96, null=True)

    if TYPE_CHECKING:
        workspace_id: UUID
        subscription_id: UUID
        plan_revision_id: UUID
        checkout_session_id: UUID | None
        checkout_outcome_command_id: UUID | None

    class Meta(BaseModel.Meta):
        table = "commerce_provider_event_applications"
        table_description = "Revision-aware idempotent applications of signed billing Provider events."
        abstract = False
        unique_together = (("provider", "provider_mode", "provider_account_id", "provider_event_id"),)
        indexes = (("workspace_id", "created_at"), ("provider_period_identity", "created_at"))


class CommerceDunningPolicy(BaseModel):
    """Versioned Provider-aware recovery policy; no hidden grace duration."""

    provider = fields.CharField(max_length=32)
    provider_mode = fields.CharEnumField(BillingProviderMode)
    revision = fields.BigIntField(default=1)
    is_active = fields.BooleanField(default=True, db_index=True)
    policy = fields.JSONField()

    class Meta(BaseModel.Meta):
        table = "commerce_dunning_policies"
        table_description = "Versioned Provider-aware Commerce dunning policies."
        abstract = False
        unique_together = (("provider", "provider_mode", "revision"),)


class CommerceDunningPolicyCommandReceipt(BaseModel):
    """Exact idempotency result for one Provider-aware Dunning Policy write."""

    provider = fields.CharField(max_length=32)
    provider_mode = fields.CharEnumField(BillingProviderMode)
    idempotency_key_hash = fields.CharField(max_length=64)
    request_fingerprint = fields.CharField(max_length=64)
    policy = fields.ForeignKeyField(
        "models.CommerceDunningPolicy", related_name="command_receipts", on_delete=fields.RESTRICT
    )
    audit_event = fields.ForeignKeyField(
        "models.AuditEvent", related_name="commerce_dunning_policy_command_receipts", on_delete=fields.RESTRICT
    )

    if TYPE_CHECKING:
        policy_id: UUID
        audit_event_id: UUID

    class Meta(BaseModel.Meta):
        table = "commerce_dunning_policy_command_receipts"
        table_description = "Immutable idempotency and audit evidence for Commerce Dunning Policy writes."
        abstract = False
        unique_together = (("provider", "provider_mode", "idempotency_key_hash"),)


class CommerceCreditAdjustmentReceipt(BaseModel):
    """Exact idempotency result for an audited Platform Credit adjustment."""

    workspace = fields.ForeignKeyField(
        "models.Workspace", related_name="commerce_credit_adjustment_receipts", on_delete=fields.RESTRICT
    )
    idempotency_key_hash = fields.CharField(max_length=64)
    request_fingerprint = fields.CharField(max_length=64)
    result_snapshot = fields.JSONField()
    ledger_entry = fields.ForeignKeyField(
        "models.WorkspaceCreditLedger", related_name="adjustment_receipts", on_delete=fields.RESTRICT
    )
    audit_event = fields.ForeignKeyField(
        "models.AuditEvent", related_name="commerce_credit_adjustment_receipts", on_delete=fields.RESTRICT
    )

    if TYPE_CHECKING:
        workspace_id: UUID
        ledger_entry_id: UUID
        audit_event_id: UUID

    class Meta(BaseModel.Meta):
        table = "commerce_credit_adjustment_receipts"
        table_description = "Immutable idempotency and audit evidence for Platform Credit adjustments."
        abstract = False
        unique_together = (("workspace_id", "idempotency_key_hash"),)


class WorkspaceCommercialAccess(BaseModel):
    """Current server-authoritative commercial access projection for one Workspace."""

    workspace = fields.OneToOneField("models.Workspace", related_name="commercial_access", on_delete=fields.CASCADE)
    subscription = fields.ForeignKeyField(
        "models.WorkspaceSubscription", related_name="commercial_access_projections", on_delete=fields.RESTRICT
    )
    state = fields.CharEnumField(CommercialAccessState, default=CommercialAccessState.NORMAL, db_index=True)
    deadline_at = fields.DatetimeField(null=True, db_index=True)
    provider_period_identity = fields.CharField(max_length=255, null=True)
    provider_period_start = fields.DatetimeField(null=True)
    provider_period_end = fields.DatetimeField(null=True)
    source_occurred_at = fields.DatetimeField(null=True, db_index=True)
    dunning_policy = fields.ForeignKeyField(
        "models.CommerceDunningPolicy",
        related_name="current_access_projections",
        on_delete=fields.RESTRICT,
        null=True,
    )
    state_revision = fields.BigIntField(default=1)
    source_identity = fields.CharField(max_length=255, unique=True)

    if TYPE_CHECKING:
        workspace_id: UUID
        subscription_id: UUID
        dunning_policy_id: UUID | None

    class Meta(BaseModel.Meta):
        table = "commerce_workspace_commercial_access"
        table_description = "Current Workspace commercial access state and anchored deadline."
        abstract = False
        indexes = (("state", "deadline_at"),)


class CommercialAccessTransition(BaseModel):
    """Append-only Commerce state transition evidence."""

    access = fields.ForeignKeyField(
        "models.WorkspaceCommercialAccess", related_name="transitions", on_delete=fields.CASCADE
    )
    from_state = fields.CharEnumField(CommercialAccessState)
    to_state = fields.CharEnumField(CommercialAccessState)
    deadline_at = fields.DatetimeField(null=True)
    provider = fields.CharField(max_length=32)
    provider_mode = fields.CharField(max_length=16)
    provider_account_id = fields.CharField(max_length=255)
    provider_event_id = fields.CharField(max_length=255)
    subscription_revision_identity = fields.UUIDField()
    provider_period_identity = fields.CharField(max_length=255)
    provider_period_start = fields.DatetimeField()
    provider_period_end = fields.DatetimeField()
    source_occurred_at = fields.DatetimeField(null=True, db_index=True)
    resulting_state_revision = fields.BigIntField()
    dunning_policy_revision = fields.BigIntField(null=True)
    dunning_policy = fields.ForeignKeyField(
        "models.CommerceDunningPolicy",
        related_name="access_transitions",
        on_delete=fields.RESTRICT,
        null=True,
    )
    source_identity = fields.CharField(max_length=255, unique=True)
    correlation_id = fields.UUIDField(unique=True, db_index=True)

    if TYPE_CHECKING:
        access_id: UUID
        dunning_policy_id: UUID | None

    class Meta(BaseModel.Meta):
        table = "commerce_commercial_access_transitions"
        table_description = "Immutable Commerce Payment Grace and Restricted transition history."
        abstract = False
        indexes = (("access_id", "created_at"),)
        unique_together = (("provider", "provider_mode", "provider_account_id", "provider_event_id"),)


class CommercePolicyException(BaseModel):
    """Time-bounded, single-Workspace Dunning deadline exception."""

    access = fields.ForeignKeyField(
        "models.WorkspaceCommercialAccess", related_name="policy_exceptions", on_delete=fields.RESTRICT
    )
    expected_state_revision = fields.BigIntField()
    original_deadline_at = fields.DatetimeField()
    replacement_deadline_at = fields.DatetimeField()
    reason = fields.TextField()
    evidence_reference = fields.CharField(max_length=255)
    actor_user_id = fields.UUIDField(db_index=True)
    idempotency_key = fields.CharField(max_length=128, unique=True)
    correlation_id = fields.UUIDField(unique=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "commerce_policy_exceptions"
        table_description = "Explicit single-Workspace Commerce Dunning Policy deadline exceptions."
        abstract = False


class CommerceStateCorrection(BaseModel):
    """Append-only exceptional commercial-access correction, never Provider payment proof."""

    access = fields.ForeignKeyField(
        "models.WorkspaceCommercialAccess", related_name="state_corrections", on_delete=fields.RESTRICT
    )
    expected_state_revision = fields.BigIntField()
    from_state = fields.CharEnumField(CommercialAccessState)
    to_state = fields.CharEnumField(CommercialAccessState)
    replacement_deadline_at = fields.DatetimeField(null=True)
    reason = fields.TextField()
    evidence_reference = fields.CharField(max_length=255)
    actor_user_id = fields.UUIDField(db_index=True)
    idempotency_key = fields.CharField(max_length=128, unique=True)
    correlation_id = fields.UUIDField(unique=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "commerce_state_corrections"
        table_description = "Append-only exceptional Commerce state correction evidence."
        abstract = False
