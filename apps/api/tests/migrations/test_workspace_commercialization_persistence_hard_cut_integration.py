from __future__ import annotations

import os
from uuid import UUID, uuid4

import asyncpg
import pytest

from tests.migrations.commercialization_legacy_schema import (
    MIGRATIONS_DIR,
    prepare_commercialization_legacy_schema,
)
from tests.migrations.test_upload_completion_migration_integration import (
    _connection_kwargs,
    _create_database,
    _drop_database,
    _run_upgrade,
)

MIGRATION_0079 = "0079_workspace_commercialization_persistence_hard_cut"


async def _seed_valid_legacy_commerce(conn: asyncpg.Connection) -> dict[str, UUID]:
    workspace_id, plan_id, subscription_id, account_id, ledger_id = (uuid4() for _ in range(5))
    request_id, receipt_id = uuid4(), uuid4()
    await conn.execute("INSERT INTO workspaces (id) VALUES ($1)", workspace_id)
    await conn.execute(
        """
        INSERT INTO commerce_plans (
            id, created_at, updated_at, code, tier, name, description, name_i18n_key,
            description_i18n_key, credit_grant_amount, credit_refresh_interval,
            credit_value_micros, price_monthly_micros, price_yearly_micros, currency,
            features, is_active, is_default, sort_order
        ) VALUES (
            $1, NOW(), NOW(), 'free', 'free', 'Free', 'Legacy Free', 'legacy.free.name', 'legacy.free.description',
            70, 'daily', 1000, 0, 0, 'USD', '["sites.generate"]'::jsonb, TRUE, TRUE, 10
        )
        """,
        plan_id,
    )
    await conn.execute(
        """
        INSERT INTO commerce_workspace_subscriptions (
            id, created_at, updated_at, workspace_id, plan_id, status, billing_cycle,
            current_period_start, current_period_end, cancel_at_period_end, billing_provider,
            external_customer_id, external_subscription_id
        ) VALUES ($1, NOW(), NOW(), $2, $3, 'active', 'monthly', NOW(),
            NOW() + INTERVAL '31 days', FALSE, 'manual', NULL, NULL)
        """,
        subscription_id,
        workspace_id,
        plan_id,
    )
    await conn.execute(
        """
        INSERT INTO commerce_workspace_credit_accounts (
            id, created_at, updated_at, workspace_id, subscription_id, balance_credits,
            reserved_credits, lifetime_granted_credits, lifetime_spent_credits,
            period_granted_credits, period_spent_credits, period_start, period_end
        ) VALUES ($1, NOW(), NOW(), $2, $3, 85, 5, 100, 15, 100, 15, NOW(),
            NOW() + INTERVAL '31 days')
        """,
        account_id,
        workspace_id,
        subscription_id,
    )
    await conn.execute(
        """
        INSERT INTO commerce_workspace_credit_ledger (
            id, created_at, updated_at, workspace_id, account_id, entry_type,
            delta_balance_credits, delta_reserved_credits, balance_after_credits,
            reserved_after_credits, reference_type, reference_id, idempotency_key,
            actor_user_id, description_key, details
        ) VALUES ($1, NOW(), NOW(), $2, $3, 'reservation', -5, 5, 85, 5,
            'ai_budget_reservation', $4, 'legacy-reservation-1', NULL,
            'commerce.credit.reserved', '{"legacy":"keep"}'::jsonb)
        """,
        ledger_id,
        workspace_id,
        account_id,
        uuid4(),
    )
    await conn.execute(
        """
        INSERT INTO commerce_subscription_change_requests (
            id, created_at, updated_at, workspace_id, requested_plan_id, requested_by_user_id,
            billing_cycle, reason, status, reviewed_by_user_id, reviewed_at, review_note
        ) VALUES ($1, NOW(), NOW(), $2, $3, $4, 'monthly', 'historical request',
            'rejected', $4, NOW(), 'not eligible')
        """,
        request_id,
        workspace_id,
        plan_id,
        uuid4(),
    )
    await conn.execute(
        """
        INSERT INTO commerce_billing_provider_event_receipts (
            id, created_at, updated_at, provider, event_id, workspace_id
        ) VALUES ($1, NOW(), NOW(), 'stripe', 'evt_legacy_001', $2)
        """,
        receipt_id,
        workspace_id,
    )
    await conn.execute("INSERT INTO connector_event_inbox (id, connector_key) VALUES ($1, 'billing.stripe')", uuid4())
    await conn.execute("INSERT INTO connector_event_inbox (id, connector_key) VALUES ($1, 'other.connector')", uuid4())
    return {
        "workspace": workspace_id,
        "plan": plan_id,
        "subscription": subscription_id,
        "account": account_id,
        "ledger": ledger_id,
        "request": request_id,
        "receipt": receipt_id,
    }


async def _new_database(prefix: str) -> tuple[str, str]:
    database = f"arclayer_{prefix}_{uuid4().hex[:18]}"
    admin_database = os.getenv("TEST_DATABASE__ADMIN_DB", "postgres")
    await _create_database(database, admin_database)
    return database, admin_database


def test_commercialization_hard_cut_sql_orders_preflight_before_schema_mutation() -> None:
    source = (MIGRATIONS_DIR / f"{MIGRATION_0079}.py").read_text()

    assert "DELETE FROM connector_event_inbox" not in source
    assert source.index("DO $$") < source.index("ALTER TABLE commerce_subscription_change_requests RENAME")
    assert source.index("ALTER TABLE commerce_plans RENAME") < source.index("CREATE TABLE commerce_plans")
    assert source.index("CREATE TABLE commerce_legacy_data_retirements") < source.index(
        "DROP TABLE commerce_workspace_credit_ledger_legacy_0079"
    )
    assert "credit_grant_amount < 0 OR credit_value_micros <= 0" in source
    assert "billing_cycle NOT IN ('monthly', 'yearly')" in source
    assert "CREATE TRIGGER commerce_legacy_data_retirements_immutable" in source


@pytest.mark.asyncio
async def test_commercialization_hard_cut_preserves_manual_subscription_credits_and_retirement_evidence(
    integration_db_settings,
) -> None:
    database, admin_database = await _new_database("commerce_hard_cut")
    try:
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            await prepare_commercialization_legacy_schema(conn)
            ids = await _seed_valid_legacy_commerce(conn)
        finally:
            await conn.close()

        await _run_upgrade(database, MIGRATION_0079)
        await _run_upgrade(database, MIGRATION_0079)

        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            subscription = await conn.fetchrow(
                """
                SELECT subscription.id, subscription.status, subscription.billing_provider,
                       subscription.plan_revision_id, plan.code, revision.name_i18n_key,
                       revision.description_i18n_key
                FROM commerce_workspace_subscriptions AS subscription
                JOIN commerce_plan_revisions AS revision ON revision.id = subscription.plan_revision_id
                JOIN commerce_plans AS plan ON plan.id = revision.plan_id
                WHERE subscription.id = $1
                """,
                ids["subscription"],
            )
            account = await conn.fetchrow(
                """
                SELECT id, balance_credits, reserved_credits, subscription_id, plan_revision_id
                FROM commerce_workspace_credit_accounts WHERE id = $1
                """,
                ids["account"],
            )
            ledger = await conn.fetchrow(
                """
                SELECT id, account_id, subscription_id, plan_revision_id, idempotency_key,
                       delta_balance_credits, delta_reserved_credits
                FROM commerce_workspace_credit_ledger WHERE id = $1
                """,
                ids["ledger"],
            )
            evidence_kinds = set(
                await conn.fetchval(
                    "SELECT array_agg(evidence_kind) FROM commerce_legacy_data_retirements"
                )
            )
            ledger_evidence = await conn.fetchval(
                """
                SELECT payload->'details'->>'legacy'
                FROM commerce_legacy_data_retirements
                WHERE legacy_id = $1 AND evidence_kind = 'legacy_ledger_details'
                """,
                ids["ledger"],
            )
            terminal_request_status = await conn.fetchval(
                """
                SELECT payload->>'status' FROM commerce_legacy_data_retirements
                WHERE legacy_id = $1 AND evidence_kind = 'terminal_change_request'
                """,
                ids["request"],
            )
            receipt_event_id = await conn.fetchval(
                """
                SELECT payload->>'event_id' FROM commerce_legacy_data_retirements
                WHERE legacy_id = $1 AND evidence_kind = 'provider_event_receipt'
                """,
                ids["receipt"],
            )
            billing_inbox_rows = await conn.fetchval(
                "SELECT COUNT(*) FROM connector_event_inbox WHERE connector_key LIKE 'billing.%'"
            )
            other_inbox_rows = await conn.fetchval(
                "SELECT COUNT(*) FROM connector_event_inbox WHERE connector_key = 'other.connector'"
            )
            plan_codes = set(await conn.fetchval("SELECT array_agg(code) FROM commerce_plans"))
            project_allowance = await conn.fetchval(
                """
                SELECT allowance.limit_kind
                FROM commerce_plan_revision_resource_allowances AS allowance
                JOIN commerce_resource_definitions AS resource ON resource.id = allowance.resource_id
                WHERE allowance.plan_revision_id = $1 AND resource.key = 'projects.active'
                """,
                subscription["plan_revision_id"],
            )
            entitlement_states = {
                row["key"]: row["is_included"]
                for row in await conn.fetch(
                    """
                    SELECT definition.key, entitlement.is_included
                    FROM commerce_plan_revision_entitlements AS entitlement
                    JOIN commerce_entitlement_definitions AS definition ON definition.id = entitlement.entitlement_id
                    WHERE entitlement.plan_revision_id = $1
                    """,
                    subscription["plan_revision_id"],
                )
            }
            old_table_exists = await conn.fetchval("SELECT to_regclass('commerce_plans_legacy_0079') IS NOT NULL")
            migration_count = await conn.fetchval(
                "SELECT COUNT(*) FROM tortoise_migrations WHERE app = 'models' AND name = $1", MIGRATION_0079
            )
            with pytest.raises(asyncpg.RaiseError, match="immutable"):
                await conn.execute("UPDATE commerce_legacy_data_retirements SET evidence_kind = 'tampered'")
            with pytest.raises(asyncpg.RaiseError, match="immutable"):
                await conn.execute("DELETE FROM commerce_legacy_data_retirements")
        finally:
            await conn.close()

        assert subscription["id"] == ids["subscription"]
        assert subscription["status"] == "active"
        assert subscription["billing_provider"] == "manual"
        assert subscription["code"] == "free"
        assert subscription["name_i18n_key"] == "legacy.free.name"
        assert subscription["description_i18n_key"] == "legacy.free.description"
        assert account["subscription_id"] == ids["subscription"]
        assert account["plan_revision_id"] == subscription["plan_revision_id"]
        assert (account["balance_credits"], account["reserved_credits"]) == (85, 5)
        assert ledger["account_id"] == ids["account"]
        assert ledger["subscription_id"] == ids["subscription"]
        assert ledger["plan_revision_id"] == subscription["plan_revision_id"]
        assert ledger["idempotency_key"] == "legacy-reservation-1"
        assert (ledger["delta_balance_credits"], ledger["delta_reserved_credits"]) == (-5, 5)
        assert {
            "raw_plan",
            "legacy_credit_account_counters",
            "legacy_ledger_details",
            "terminal_change_request",
            "provider_event_receipt",
        } <= evidence_kinds
        assert ledger_evidence == "keep"
        assert terminal_request_status == "rejected"
        assert receipt_event_id == "evt_legacy_001"
        assert billing_inbox_rows == 1
        assert other_inbox_rows == 1
        assert plan_codes == {"free", "premium"}
        assert project_allowance == "unlimited"
        assert entitlement_states == {"sites.generate": True, "workspace.roles.manage": False}
        assert not old_table_exists
        assert migration_count == 1
    finally:
        await _drop_database(database, admin_database)


@pytest.mark.asyncio
async def test_commercialization_hard_cut_normalizes_0077_free_period_without_changing_non_free_period(
    integration_db_settings,
) -> None:
    database, admin_database = await _new_database("commerce_free_period")
    paid_workspace_id, paid_plan_id, paid_subscription_id = uuid4(), uuid4(), uuid4()
    try:
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            await prepare_commercialization_legacy_schema(conn)
            ids = await _seed_valid_legacy_commerce(conn)
            await conn.execute(
                """
                UPDATE commerce_workspace_subscriptions
                SET current_period_end = current_period_start + INTERVAL '1 month'
                WHERE id = $1
                """,
                ids["subscription"],
            )
            await conn.execute("INSERT INTO workspaces (id) VALUES ($1)", paid_workspace_id)
            await conn.execute(
                """
                INSERT INTO commerce_plans (
                    id, created_at, updated_at, code, tier, name, description, name_i18n_key,
                    description_i18n_key, credit_grant_amount, credit_refresh_interval,
                    credit_value_micros, price_monthly_micros, price_yearly_micros, currency,
                    features, is_active, is_default, sort_order
                ) VALUES (
                    $1, NOW(), NOW(), 'premium', 'premium', 'Premium', 'Legacy Premium',
                    'legacy.premium.name', 'legacy.premium.description', 100, 'monthly',
                    1000, 0, 0, 'USD', '["sites.generate", "workspace.roles.manage"]'::jsonb,
                    TRUE, FALSE, 20
                )
                """,
                paid_plan_id,
            )
            await conn.execute(
                """
                INSERT INTO commerce_workspace_subscriptions (
                    id, created_at, updated_at, workspace_id, plan_id, status, billing_cycle,
                    current_period_start, current_period_end, cancel_at_period_end, billing_provider,
                    external_customer_id, external_subscription_id
                ) VALUES (
                    $1, NOW(), NOW(), $2, $3, 'active', 'monthly',
                    TIMESTAMPTZ '2038-05-01 00:00:00+00', TIMESTAMPTZ '2038-06-01 00:00:00+00',
                    FALSE, 'manual', NULL, NULL
                )
                """,
                paid_subscription_id,
                paid_workspace_id,
                paid_plan_id,
            )
        finally:
            await conn.close()

        await _run_upgrade(database, MIGRATION_0079)

        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            free_period_is_non_expiring = await conn.fetchval(
                """
                SELECT current_period_end = 'infinity'::TIMESTAMPTZ
                FROM commerce_workspace_subscriptions
                WHERE id = $1
                """,
                ids["subscription"],
            )
            paid_period_is_preserved = await conn.fetchval(
                """
                SELECT current_period_end = TIMESTAMPTZ '2038-06-01 00:00:00+00'
                FROM commerce_workspace_subscriptions
                WHERE id = $1
                """,
                paid_subscription_id,
            )
        finally:
            await conn.close()

        assert free_period_is_non_expiring is True
        assert paid_period_is_preserved is True
    finally:
        await _drop_database(database, admin_database)


@pytest.mark.asyncio
async def test_commercialization_hard_cut_rejects_ambiguous_legacy_free_plan_identity(integration_db_settings) -> None:
    database, admin_database = await _new_database("commerce_ambiguous_free")
    try:
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            await prepare_commercialization_legacy_schema(conn)
            await _seed_valid_legacy_commerce(conn)
            await conn.execute("UPDATE commerce_plans SET tier = 'premium' WHERE code = 'free'")
        finally:
            await conn.close()

        with pytest.raises(AssertionError, match="legacy Free Plan identity is ambiguous"):
            await _run_upgrade(database, MIGRATION_0079)

        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            assert await conn.fetchval("SELECT to_regclass('commerce_plan_revisions') IS NULL")
            assert await conn.fetchval("SELECT to_regclass('commerce_plans_legacy_0079') IS NULL")
        finally:
            await conn.close()
    finally:
        await _drop_database(database, admin_database)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("case", "message"),
    [
        ("pending", "unresolved subscription change requests"),
        ("trialing", "trialing or illegal subscription status"),
        ("invalid_cycle", "subscription billing cycle or period invariant"),
        ("invalid_credit_terms", "plan credit grant or credit value invariant"),
        ("unmapped_price", "nonzero legacy price"),
        ("external", "external subscription lacks provider_mode"),
        ("unknown_i18n", "unknown plan lacks required i18n keys"),
        ("invalid_features", "features are not an explicit supported entitlement array"),
        ("invalid_balance", "credit account balance or period invariant"),
    ],
)
async def test_commercialization_hard_cut_rejects_unresolved_or_ambiguous_legacy_state_before_ddl(
    integration_db_settings,
    case: str,
    message: str,
) -> None:
    database, admin_database = await _new_database(f"commerce_preflight_{case}")
    try:
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            await prepare_commercialization_legacy_schema(conn)
            ids = await _seed_valid_legacy_commerce(conn)
            if case == "pending":
                await conn.execute("UPDATE commerce_subscription_change_requests SET status = 'pending'")
            elif case == "trialing":
                await conn.execute("UPDATE commerce_workspace_subscriptions SET status = 'trialing'")
            elif case == "invalid_cycle":
                await conn.execute("UPDATE commerce_workspace_subscriptions SET billing_cycle = 'weekly'")
            elif case == "invalid_credit_terms":
                await conn.execute("UPDATE commerce_plans SET credit_value_micros = 0")
            elif case == "unmapped_price":
                await conn.execute("UPDATE commerce_plans SET price_monthly_micros = 1000000")
            elif case == "external":
                await conn.execute("UPDATE commerce_workspace_subscriptions SET billing_provider = 'stripe'")
            elif case == "unknown_i18n":
                await conn.execute(
                    "UPDATE commerce_plans SET code = 'custom', name_i18n_key = NULL, description_i18n_key = NULL"
                )
            elif case == "invalid_features":
                await conn.execute("UPDATE commerce_plans SET features = '{}'::jsonb")
            else:
                await conn.execute("UPDATE commerce_workspace_credit_accounts SET balance_credits = -1")
        finally:
            await conn.close()

        with pytest.raises(AssertionError, match=message):
            await _run_upgrade(database, MIGRATION_0079)

        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            assert await conn.fetchval("SELECT to_regclass('commerce_plan_revisions') IS NULL")
            assert await conn.fetchval("SELECT COUNT(*) FROM commerce_plans") == 1
            assert await conn.fetchval("SELECT COUNT(*) FROM commerce_workspace_subscriptions") == 1
            assert await conn.fetchval(
                "SELECT COUNT(*) FROM connector_event_inbox WHERE connector_key = 'billing.stripe'"
            ) == 1
            assert await conn.fetchval(
                "SELECT COUNT(*) FROM tortoise_migrations WHERE app = 'models' AND name = $1", MIGRATION_0079
            ) == 0
            assert ids["plan"] is not None
        finally:
            await conn.close()
    finally:
        await _drop_database(database, admin_database)


@pytest.mark.asyncio
async def test_commercialization_hard_cut_rolls_back_renames_and_new_tables_after_late_ddl_failure(
    integration_db_settings,
) -> None:
    database, admin_database = await _new_database("commerce_late_rollback")
    try:
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            await prepare_commercialization_legacy_schema(conn)
            await _seed_valid_legacy_commerce(conn)
            await conn.execute("CREATE TABLE commerce_0079_late_failure_probe (id UUID PRIMARY KEY)")
            await conn.execute(
                """
                CREATE INDEX commerce_workspace_commercial_access_state_deadline_idx
                ON commerce_0079_late_failure_probe (id)
                """
            )
        finally:
            await conn.close()

        with pytest.raises(AssertionError, match="commerce_workspace_commercial_access_state_deadline_idx"):
            await _run_upgrade(database, MIGRATION_0079)

        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            assert await conn.fetchval("SELECT to_regclass('commerce_plans') IS NOT NULL")
            assert await conn.fetchval("SELECT to_regclass('commerce_plans_legacy_0079') IS NULL")
            assert await conn.fetchval("SELECT to_regclass('commerce_plan_revisions') IS NULL")
            assert await conn.fetchval("SELECT COUNT(*) FROM commerce_plans") == 1
            assert await conn.fetchval("SELECT COUNT(*) FROM commerce_workspace_subscriptions") == 1
            assert await conn.fetchval(
                """
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'commerce_plans' AND column_name = 'features'
                )
                """
            )
            assert await conn.fetchval(
                "SELECT COUNT(*) FROM tortoise_migrations WHERE app = 'models' AND name = $1", MIGRATION_0079
            ) == 0
        finally:
            await conn.close()
    finally:
        await _drop_database(database, admin_database)


@pytest.mark.asyncio
async def test_commercialization_hard_cut_enforces_revision_and_credit_invariants(integration_db_settings) -> None:
    database, admin_database = await _new_database("commerce_constraints")
    try:
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            await prepare_commercialization_legacy_schema(conn)
        finally:
            await conn.close()

        await _run_upgrade(database, MIGRATION_0079)
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            free_plan_id = await conn.fetchval("SELECT id FROM commerce_plans WHERE code = 'free'")
            free_revision_id = await conn.fetchval(
                "SELECT id FROM commerce_plan_revisions WHERE plan_id = $1", free_plan_id
            )
            with pytest.raises(asyncpg.UniqueViolationError):
                await conn.execute(
                    """
                    INSERT INTO commerce_plan_revisions (
                        id, created_at, updated_at, plan_id, sequence, status, name_i18n_key,
                        description_i18n_key, credit_grant_amount, credit_refresh_interval,
                        credit_value_micros, currency, content_hash, published_at, is_selling
                    ) VALUES ($1, NOW(), NOW(), $2, 2, 'published', 'name', 'description',
                        1, 'monthly', 1, 'USD', 'another-revision', NOW(), TRUE)
                    """,
                    uuid4(),
                    free_plan_id,
                )
            with pytest.raises(asyncpg.CheckViolationError):
                await conn.execute(
                    """
                    INSERT INTO commerce_plan_revision_resource_allowances (
                        id, created_at, updated_at, plan_revision_id, resource_id, limit_kind, limit_value
                    ) VALUES ($1, NOW(), NOW(), $2,
                        (SELECT id FROM commerce_resource_definitions WHERE key = 'projects.active'),
                        'limited', 0)
                    """,
                    uuid4(),
                    free_revision_id,
                )
        finally:
            await conn.close()
    finally:
        await _drop_database(database, admin_database)
