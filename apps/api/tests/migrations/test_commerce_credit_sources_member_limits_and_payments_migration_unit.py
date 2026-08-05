from importlib import import_module

migration = import_module("src.migrations.0116_commerce_credit_sources_member_limits_and_payments")


def test_commerce_credit_and_payment_migration_depends_on_current_head() -> None:
    assert migration.Migration.dependencies == [("models", "0115_platform_builtin_role_catalog")]


def test_commerce_credit_and_payment_migration_creates_the_complete_schema() -> None:
    sql = migration.Migration.operations[0].sql

    for table in (
        "commerce_workspace_credit_grant_lots",
        "commerce_workspace_credit_lot_allocations",
        "commerce_workspace_credit_lot_mutations",
        "commerce_workspace_member_credit_policies",
        "commerce_workspace_member_credit_limit_overrides",
        "commerce_workspace_member_credit_usage_periods",
        "commerce_workspace_credit_usage_events",
        "commerce_credit_top_up_offers",
        "commerce_credit_top_up_offer_prices",
        "commerce_checkout_sessions",
        "commerce_invoices",
        "commerce_transactions",
        "commerce_refunds",
        "commerce_workspace_auto_refill_policies",
    ):
        assert f"CREATE TABLE {table}" in sql

    for column in (
        "workspace_membership_id",
        "actor_user_id",
        "project_id",
        "capability_key",
        "credit_attribution_version",
    ):
        assert f"ADD COLUMN {column}" in sql


def test_commerce_credit_and_payment_migration_preserves_credit_provenance() -> None:
    sql = migration.Migration.operations[0].sql

    assert "commerce_credit_grant_lots_source_check" in sql
    assert "commerce_credit_lot_allocation_amount_check" in sql
    assert "commerce_credit_lot_mutation_amount_check" in sql
    assert "commerce_member_credit_policy_shape_check" in sql
    assert "commerce_member_credit_limit_override_shape_check" in sql
    assert "commerce_credit_usage_event_identity_unique" in sql
    assert "commerce_workspace_credit_ledger_entry_type_check" in sql
    assert "ai_budget_reservation_credit_attribution_check" in sql
    assert "ai_budget_reservation_credit_attribution_version_check" in sql
    assert "credit_attribution_version = 0" in sql
    assert "legacy_unattributed" in sql
    assert "migration:unattributed-credit-account:" in sql
    assert "LEDGER_MIGRATION_UNATTRIBUTED" in sql
    assert "arclayer:commerce-credit-lot-allocation:migration:" in sql
    assert "reservation.status IN ('reserved', 'expired')" in sql
    assert "reserved credits to equal unreconciled reservation totals" in sql
    assert "unreconciled terminal reservation" in sql
    assert "positive Credits for every unreconciled reservation" in sql
    assert "positive balance from an expired legacy period" in sql


def test_commerce_credit_and_payment_migration_keeps_simulated_payments_provider_neutral() -> None:
    sql = migration.Migration.operations[0].sql

    assert "provider VARCHAR(32) NOT NULL" in sql
    assert "provider_mode IN ('test', 'live')" in sql
    assert "external_session_id" in sql
    assert "external_transaction_id" in sql
    assert "external_refund_id" in sql
    assert "stripe" not in sql.lower()
