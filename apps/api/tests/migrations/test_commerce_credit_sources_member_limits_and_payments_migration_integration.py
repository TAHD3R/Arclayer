from __future__ import annotations

import os
from dataclasses import dataclass
from uuid import UUID, uuid4

import asyncpg
import pytest

from tests.migrations.test_upload_completion_migration_integration import (
    _connection_kwargs,
    _create_database,
    _drop_database,
    _run_upgrade,
)

MIGRATION_0115 = "0115_platform_builtin_role_catalog"
MIGRATION_0116 = "0116_commerce_credit_sources_member_limits_and_payments"


@dataclass(frozen=True, slots=True)
class _LegacyCommerceIds:
    workspace_id: UUID
    account_id: UUID
    reservation_id: UUID
    ledger_id: UUID


async def _seed_legacy_commerce(
    conn: asyncpg.Connection,
    *,
    account_reserved_credits: int = 5,
    reservation_reserved_credits: int = 5,
) -> _LegacyCommerceIds:
    user_id, organization_id, workspace_id = uuid4(), uuid4(), uuid4()
    plan_id, plan_revision_id, subscription_id, account_id = (uuid4() for _ in range(4))
    budget_id, reservation_id, request_id, ledger_id = (uuid4() for _ in range(4))
    suffix = uuid4().hex[:12]
    await conn.execute(
        """
        INSERT INTO users (id, created_at, updated_at, username, status, token_version)
        VALUES ($1, NOW(), NOW(), $2, 'active', 0)
        """,
        user_id,
        f"commerce-migration-{suffix}",
    )
    await conn.execute(
        """
        INSERT INTO organizations (
            id, created_at, updated_at, slug, name, owner_user_id, is_active
        ) VALUES ($1, NOW(), NOW(), $2, 'Commerce migration', $3, TRUE)
        """,
        organization_id,
        f"commerce-migration-{suffix}",
        user_id,
    )
    await conn.execute(
        """
        INSERT INTO workspaces (
            id, created_at, updated_at, organization_id, name, owner_user_id,
            icon_mode, icon_color, is_active, created_by_user_id, extension_revision
        ) VALUES (
            $1, NOW(), NOW(), $2, 'Commerce migration', $3,
            'initials', '#337ea9', TRUE, $3, 1
        )
        """,
        workspace_id,
        organization_id,
        user_id,
    )
    await conn.execute(
        """
        INSERT INTO commerce_plans (id, created_at, updated_at, code, is_active, sort_order)
        VALUES ($1, NOW(), NOW(), $2, TRUE, 10)
        """,
        plan_id,
        f"migration-{suffix}",
    )
    await conn.execute(
        """
        INSERT INTO commerce_plan_revisions (
            id, created_at, updated_at, plan_id, sequence, status, name_i18n_key,
            description_i18n_key, credit_grant_amount, credit_refresh_interval,
            credit_value_micros, currency, content_hash, published_at, is_selling
        ) VALUES (
            $1, NOW(), NOW(), $2, 1, 'published', 'migration.plan.name',
            'migration.plan.description', 100, 'monthly', 1000, 'USD', $3, NOW(), TRUE
        )
        """,
        plan_revision_id,
        plan_id,
        uuid4().hex,
    )
    await conn.execute(
        """
        INSERT INTO commerce_workspace_subscriptions (
            id, created_at, updated_at, workspace_id, plan_revision_id, status,
            billing_cycle, current_period_start, current_period_end,
            cancel_at_period_end, billing_provider, provider_mode, revision
        ) VALUES (
            $1, NOW(), NOW(), $2, $3, 'active', 'monthly',
            NOW() - INTERVAL '1 day', NOW() + INTERVAL '29 days',
            FALSE, 'manual', NULL, 1
        )
        """,
        subscription_id,
        workspace_id,
        plan_revision_id,
    )
    await conn.execute(
        """
        INSERT INTO commerce_workspace_credit_accounts (
            id, created_at, updated_at, workspace_id, subscription_id, plan_revision_id,
            balance_credits, reserved_credits, period_start, period_end,
            period_identity, revision
        ) VALUES (
            $1, NOW(), NOW(), $2, $3, $4, 85, $5,
            NOW() - INTERVAL '1 day', NOW() + INTERVAL '29 days', $6, 3
        )
        """,
        account_id,
        workspace_id,
        subscription_id,
        plan_revision_id,
        account_reserved_credits,
        f"migration-period:{account_id}",
    )
    await conn.execute(
        """
        INSERT INTO ai_budgets (
            id, created_at, updated_at, source_type, source_id, limit_micros,
            spent_micros, reserved_micros, period_start
        ) VALUES ($1, NOW(), NOW(), 'workspace', $2, 1000000, 0, 5000, CURRENT_DATE)
        """,
        budget_id,
        workspace_id,
    )
    await conn.execute(
        """
        INSERT INTO ai_budget_reservations (
            id, created_at, updated_at, budget_id, request_id, estimated_cost_micros,
            reserved_cost_micros, credit_account_id, credit_value_micros,
            reserved_credits, status, expires_at
        ) VALUES (
            $1, NOW(), NOW(), $2, $3, 5000, 5000, $4, 1000, $5,
            'reserved', NOW() + INTERVAL '5 minutes'
        )
        """,
        reservation_id,
        budget_id,
        request_id,
        account_id,
        reservation_reserved_credits,
    )
    await conn.execute(
        """
        INSERT INTO commerce_workspace_credit_ledger (
            id, created_at, updated_at, workspace_id, account_id, subscription_id,
            plan_revision_id, entry_type, request_id, estimated_cost_micros,
            applied_credit_value_micros, reserved_credits, committed_credits,
            delta_balance_credits, delta_reserved_credits, balance_after_credits,
            reserved_after_credits, idempotency_key, description_key
        ) VALUES (
            $1, NOW(), NOW(), $2, $3, $4, $5, 'reservation', $6, 5000,
            1000, $7, 0, 0, $7, 85, $7, $8, 'LEDGER_AI_RESERVATION'
        )
        """,
        ledger_id,
        workspace_id,
        account_id,
        subscription_id,
        plan_revision_id,
        request_id,
        reservation_reserved_credits,
        f"migration-reservation:{request_id}",
    )
    return _LegacyCommerceIds(
        workspace_id=workspace_id,
        account_id=account_id,
        reservation_id=reservation_id,
        ledger_id=ledger_id,
    )


@pytest.mark.asyncio
async def test_commerce_credit_source_migration_preserves_legacy_balance_without_inventing_provenance(
    integration_db_settings,
) -> None:
    _ = integration_db_settings
    database = f"arclayer_commerce_0116_{uuid4().hex[:18]}"
    admin_database = os.getenv("TEST_DATABASE__ADMIN_DB", "postgres")
    await _create_database(database, admin_database)
    try:
        await _run_upgrade(database, MIGRATION_0115)
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            ids = await _seed_legacy_commerce(conn)
        finally:
            await conn.close()

        await _run_upgrade(database, MIGRATION_0116)
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            account = await conn.fetchrow(
                "SELECT balance_credits, reserved_credits, revision FROM commerce_workspace_credit_accounts WHERE id = $1",
                ids.account_id,
            )
            lot = await conn.fetchrow(
                """
                SELECT source, source_identity, granted_credits, remaining_credits,
                       reserved_credits, expires_at, description_key
                FROM commerce_workspace_credit_grant_lots
                WHERE account_id = $1
                """,
                ids.account_id,
            )
            allocation = await conn.fetchrow(
                """
                SELECT reservation_id, reserved_credits, committed_credits,
                       released_credits, status
                FROM commerce_workspace_credit_lot_allocations
                WHERE reservation_id = $1
                """,
                ids.reservation_id,
            )
            reservation = await conn.fetchrow(
                """
                SELECT workspace_membership_id, actor_user_id, project_id, capability_key,
                       credit_attribution_version
                FROM ai_budget_reservations
                WHERE id = $1
                """,
                ids.reservation_id,
            )
            policy = await conn.fetchrow(
                """
                SELECT default_limit_kind, default_limit_credits, revision
                FROM commerce_workspace_member_credit_policies
                WHERE workspace_id = $1
                """,
                ids.workspace_id,
            )
            attribution_constraint = await conn.fetchval(
                """
                SELECT convalidated FROM pg_constraint
                WHERE conname = 'ai_budget_reservation_credit_attribution_check'
                """
            )
            indexes = {
                row["indexname"]
                for row in await conn.fetch(
                    """
                    SELECT indexname FROM pg_indexes
                    WHERE schemaname = 'public'
                      AND indexname = ANY($1::text[])
                    """,
                    [
                        "commerce_credit_lot_allocation_reservation_status_idx",
                        "commerce_top_up_offer_active_idx",
                        "commerce_refund_actor_idx",
                        "commerce_workspace_auto_refill_updated_by_idx",
                    ],
                )
            }
            ledger_count = await conn.fetchval(
                "SELECT COUNT(*) FROM commerce_workspace_credit_ledger WHERE id = $1",
                ids.ledger_id,
            )
            await conn.execute(
                """
                UPDATE ai_budget_reservations
                SET credits_reconciled_at = NOW(), updated_at = NOW()
                WHERE id = $1
                """,
                ids.reservation_id,
            )
            with pytest.raises(asyncpg.CheckViolationError):
                await conn.execute(
                    """
                    INSERT INTO ai_budget_reservations (
                        id, created_at, updated_at, budget_id, request_id,
                        estimated_cost_micros, reserved_cost_micros, credit_account_id,
                        credit_attribution_version, credit_value_micros, reserved_credits,
                        status, expires_at
                    )
                    SELECT $1, NOW(), NOW(), budget_id, $2, 1000, 1000, $3,
                           1, 1000, 1, 'reserved', NOW() + INTERVAL '5 minutes'
                    FROM ai_budget_reservations WHERE id = $4
                    """,
                    uuid4(),
                    uuid4(),
                    ids.account_id,
                    ids.reservation_id,
                )
        finally:
            await conn.close()

        assert dict(account) == {"balance_credits": 85, "reserved_credits": 5, "revision": 3}
        assert dict(lot) == {
            "source": "legacy_unattributed",
            "source_identity": f"migration:unattributed-credit-account:{ids.account_id}",
            "granted_credits": 85,
            "remaining_credits": 85,
            "reserved_credits": 5,
            "expires_at": None,
            "description_key": "LEDGER_MIGRATION_UNATTRIBUTED",
        }
        assert dict(allocation) == {
            "reservation_id": ids.reservation_id,
            "reserved_credits": 5,
            "committed_credits": 0,
            "released_credits": 0,
            "status": "reserved",
        }
        assert dict(reservation) == {
            "workspace_membership_id": None,
            "actor_user_id": None,
            "project_id": None,
            "capability_key": None,
            "credit_attribution_version": 0,
        }
        assert dict(policy) == {"default_limit_kind": "unlimited", "default_limit_credits": None, "revision": 1}
        assert attribution_constraint is True
        assert indexes == {
            "commerce_credit_lot_allocation_reservation_status_idx",
            "commerce_top_up_offer_active_idx",
            "commerce_refund_actor_idx",
            "commerce_workspace_auto_refill_updated_by_idx",
        }
        assert ledger_count == 1
    finally:
        await _drop_database(database, admin_database)


@pytest.mark.asyncio
async def test_commerce_credit_source_migration_rejects_inconsistent_legacy_reservations(
    integration_db_settings,
) -> None:
    _ = integration_db_settings
    database = f"arclayer_commerce_0116_bad_{uuid4().hex[:14]}"
    admin_database = os.getenv("TEST_DATABASE__ADMIN_DB", "postgres")
    await _create_database(database, admin_database)
    try:
        await _run_upgrade(database, MIGRATION_0115)
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            await _seed_legacy_commerce(
                conn,
                account_reserved_credits=5,
                reservation_reserved_credits=4,
            )
        finally:
            await conn.close()

        with pytest.raises(AssertionError, match="reserved credits to equal unreconciled reservation totals"):
            await _run_upgrade(database, MIGRATION_0116)

        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            grant_table = await conn.fetchval("SELECT to_regclass('commerce_workspace_credit_grant_lots')")
            attribution_column = await conn.fetchval(
                """
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'ai_budget_reservations'
                  AND column_name = 'credit_attribution_version'
                """
            )
        finally:
            await conn.close()
        assert grant_table is None
        assert attribution_column is None
    finally:
        await _drop_database(database, admin_database)
