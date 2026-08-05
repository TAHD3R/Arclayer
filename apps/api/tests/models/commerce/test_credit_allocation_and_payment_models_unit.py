from src.models.ai.ai_budget_reservation import AIBudgetReservation
from src.models.commerce.credit_allocation import (
    CreditGrantSource,
    CreditLotAllocationStatus,
    CreditLotMutationKind,
    CreditUsageEventType,
    WorkspaceCreditGrantLot,
    WorkspaceCreditLotAllocation,
    WorkspaceCreditLotMutation,
    WorkspaceCreditUsageEvent,
    WorkspaceMemberCreditLimitOverride,
    WorkspaceMemberCreditPolicy,
    WorkspaceMemberCreditUsagePeriod,
)
from src.models.commerce.payments import (
    CommerceCheckoutKind,
    CommerceCheckoutOutcome,
    CommerceCheckoutOutcomeCommand,
    CommerceCheckoutSession,
    CommerceCheckoutStatus,
    CommerceCreditTopUpOffer,
    CommerceCreditTopUpOfferPrice,
    CommerceInvoice,
    CommerceRefund,
    CommerceTransaction,
    WorkspaceAutoRefillPolicy,
)


def test_credit_models_expose_source_lots_and_exact_reservation_allocations() -> None:
    assert {source.value for source in CreditGrantSource} == {
        "plan_period",
        "promotional",
        "top_up",
        "adjustment",
        "legacy_unattributed",
    }
    assert {status.value for status in CreditLotAllocationStatus} == {"reserved", "settled"}
    assert WorkspaceCreditGrantLot._meta.db_table == "commerce_workspace_credit_grant_lots"
    assert WorkspaceCreditLotAllocation._meta.db_table == "commerce_workspace_credit_lot_allocations"
    assert WorkspaceCreditLotMutation._meta.db_table == "commerce_workspace_credit_lot_mutations"
    assert {kind.value for kind in CreditLotMutationKind} == {"adjustment", "refund", "expiration"}
    assert {"lot", "reservation", "reserved_credits", "committed_credits", "released_credits"}.issubset(
        WorkspaceCreditLotAllocation._meta.fields_map
    )


def test_member_credit_models_keep_current_period_limits_separate_from_append_only_usage() -> None:
    assert WorkspaceMemberCreditPolicy._meta.db_table == "commerce_workspace_member_credit_policies"
    assert WorkspaceMemberCreditLimitOverride._meta.db_table == "commerce_workspace_member_credit_limit_overrides"
    assert WorkspaceMemberCreditUsagePeriod._meta.db_table == "commerce_workspace_member_credit_usage_periods"
    assert {
        "workspace",
        "membership_id",
        "period_start",
        "period_end",
        "reserved_credits",
        "committed_credits",
    }.issubset(WorkspaceMemberCreditUsagePeriod._meta.fields_map)
    assert {event.value for event in CreditUsageEventType} == {"reserved", "committed", "released"}
    assert {"membership_id", "actor_user_id", "reservation", "capability_key"}.issubset(
        WorkspaceCreditUsageEvent._meta.fields_map
    )


def test_budget_reservation_snapshots_commercial_attribution() -> None:
    assert {
        "workspace_membership_id",
        "actor_user_id",
        "project_id",
        "capability_key",
        "credit_attribution_version",
        "credit_account_id",
        "reserved_credits",
        "actual_credits",
    }.issubset(AIBudgetReservation._meta.fields_map)


def test_payment_models_keep_provider_projections_and_workspace_automation_distinct() -> None:
    assert {kind.value for kind in CommerceCheckoutKind} == {"subscription", "top_up"}
    assert {status.value for status in CommerceCheckoutStatus} == {
        "pending",
        "completed",
        "failed",
        "canceled",
        "expired",
    }
    assert {outcome.value for outcome in CommerceCheckoutOutcome} == {
        "pending",
        "succeeded",
        "failed",
        "canceled",
    }
    expected_tables = {
        CommerceCreditTopUpOffer: "commerce_credit_top_up_offers",
        CommerceCreditTopUpOfferPrice: "commerce_credit_top_up_offer_prices",
        CommerceCheckoutSession: "commerce_checkout_sessions",
        CommerceCheckoutOutcomeCommand: "commerce_checkout_outcome_commands",
        CommerceInvoice: "commerce_invoices",
        CommerceTransaction: "commerce_transactions",
        CommerceRefund: "commerce_refunds",
        WorkspaceAutoRefillPolicy: "commerce_workspace_auto_refill_policies",
    }
    for model, table in expected_tables.items():
        assert model._meta.db_table == table
    assert {
        "plan_code",
        "provider_account_id",
        "external_price_id",
        "request_fingerprint",
        "revision",
    }.issubset(CommerceCheckoutSession._meta.fields_map)
