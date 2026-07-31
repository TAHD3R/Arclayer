from __future__ import annotations

import os
from uuid import uuid4

import asyncpg
import pytest

from tests.migrations.commercialization_legacy_schema import prepare_commercialization_legacy_schema
from tests.migrations.test_upload_completion_migration_integration import (
    _connection_kwargs,
    _create_database,
    _drop_database,
    _run_upgrade,
)

MIGRATION_0079 = "0079_workspace_commercialization_persistence_hard_cut"


@pytest.mark.asyncio
async def test_commercialization_hard_cut_retires_legacy_rows_and_seeds_no_workspace_subscription(
    integration_db_settings,
) -> None:
    database = f"arclayer_commerce_hard_cut_{uuid4().hex[:18]}"
    admin_database = os.getenv("TEST_DATABASE__ADMIN_DB", "postgres")
    workspace_id = uuid4()
    legacy_plan_id = uuid4()
    try:
        await _create_database(database, admin_database)
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            await prepare_commercialization_legacy_schema(conn)
            await conn.execute("INSERT INTO workspaces (id) VALUES ($1)", workspace_id)
            await conn.execute(
                "INSERT INTO commerce_plans (id, code, tier, features) VALUES ($1, 'legacy', 'free', '[]'::jsonb)",
                legacy_plan_id,
            )
            await conn.execute(
                "INSERT INTO commerce_workspace_subscriptions (id, workspace_id, plan_id, status) VALUES ($1, $2, $3, 'trialing')",
                uuid4(),
                workspace_id,
                legacy_plan_id,
            )
            await conn.execute("INSERT INTO commerce_subscription_change_requests (id, status) VALUES ($1, 'pending')", uuid4())
            await conn.execute("INSERT INTO connector_event_inbox (id, connector_key) VALUES ($1, 'billing.stripe')", uuid4())
            await conn.execute("INSERT INTO connector_event_inbox (id, connector_key) VALUES ($1, 'other.connector')", uuid4())
        finally:
            await conn.close()

        await _run_upgrade(database, MIGRATION_0079)
        await _run_upgrade(database, MIGRATION_0079)

        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            plan_codes = set(await conn.fetchval("SELECT array_agg(code) FROM commerce_plans"))
            published_revisions = await conn.fetchval(
                "SELECT COUNT(*) FROM commerce_plan_revisions WHERE status = 'published' AND is_selling"
            )
            subscription_count = await conn.fetchval("SELECT COUNT(*) FROM commerce_workspace_subscriptions")
            billing_inbox_count = await conn.fetchval(
                "SELECT COUNT(*) FROM connector_event_inbox WHERE connector_key LIKE 'billing.%'"
            )
            other_inbox_count = await conn.fetchval(
                "SELECT COUNT(*) FROM connector_event_inbox WHERE connector_key = 'other.connector'"
            )
            has_legacy_features = await conn.fetchval(
                """
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'commerce_plans' AND column_name = 'features'
                )
                """
            )
            migration_count = await conn.fetchval(
                "SELECT COUNT(*) FROM tortoise_migrations WHERE app = 'models' AND name = $1", MIGRATION_0079
            )
        finally:
            await conn.close()

        assert plan_codes == {"free", "premium"}
        assert published_revisions == 2
        assert subscription_count == 0
        assert billing_inbox_count == 0
        assert other_inbox_count == 1
        assert not has_legacy_features
        assert migration_count == 1
    finally:
        await _drop_database(database, admin_database)


@pytest.mark.asyncio
async def test_commercialization_hard_cut_enforces_revision_seat_and_credit_invariants(integration_db_settings) -> None:
    database = f"arclayer_commerce_constraints_{uuid4().hex[:18]}"
    admin_database = os.getenv("TEST_DATABASE__ADMIN_DB", "postgres")
    try:
        await _create_database(database, admin_database)
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
                """
                SELECT revision.id FROM commerce_plan_revisions AS revision
                JOIN commerce_plans AS plan ON plan.id = revision.plan_id
                WHERE plan.code = 'free'
                """
            )
            with pytest.raises(asyncpg.UniqueViolationError):
                await conn.execute(
                    """
                    INSERT INTO commerce_plan_revisions (
                        id, created_at, updated_at, plan_id, sequence, status, name_i18n_key,
                        description_i18n_key, credit_grant_amount, credit_refresh_interval,
                        credit_value_micros, currency, content_hash, published_at, is_selling
                    ) VALUES ($1, NOW(), NOW(), $2, 2, 'published', 'name', 'description', 1, 'monthly', 1, 'USD', 'another-revision', NOW(), TRUE)
                    """,
                    uuid4(),
                    free_plan_id,
                )
            with pytest.raises(asyncpg.CheckViolationError):
                await conn.execute(
                    """
                    INSERT INTO commerce_plan_revision_resource_allowances (
                        id, created_at, updated_at, plan_revision_id, resource_id, limit_kind, limit_value
                    ) VALUES ($1, NOW(), NOW(), $2, (SELECT id FROM commerce_resource_definitions WHERE key = 'projects.active'), 'limited', 0)
                    """,
                    uuid4(),
                    free_revision_id,
                )
        finally:
            await conn.close()
    finally:
        await _drop_database(database, admin_database)


@pytest.mark.asyncio
async def test_commercialization_hard_cut_enforces_feature_command_and_access_deadline_invariants(
    integration_db_settings,
) -> None:
    database = f"arclayer_commerce_feature_scope_{uuid4().hex[:18]}"
    admin_database = os.getenv("TEST_DATABASE__ADMIN_DB", "postgres")
    try:
        await _create_database(database, admin_database)
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            await prepare_commercialization_legacy_schema(conn)
            workspace_id = uuid4()
            await conn.execute("INSERT INTO workspaces (id) VALUES ($1)", workspace_id)
        finally:
            await conn.close()

        await _run_upgrade(database, MIGRATION_0079)
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            entitlement_id = await conn.fetchval(
                "SELECT id FROM commerce_entitlement_definitions WHERE key = 'sites.generate'"
            )
            revision_id = await conn.fetchval(
                "SELECT id FROM commerce_plan_revisions WHERE is_selling AND status = 'published' LIMIT 1"
            )
            subscription_id = uuid4()
            await conn.execute(
                """
                INSERT INTO commerce_workspace_subscriptions (
                    id, created_at, updated_at, workspace_id, plan_revision_id, status, billing_cycle,
                    current_period_start, current_period_end, billing_provider
                ) VALUES ($1, NOW(), NOW(), $2, $3, 'active', 'monthly', NOW(), NOW() + INTERVAL '1 day', 'manual')
                """,
                subscription_id,
                workspace_id,
                revision_id,
            )
            scope_id = uuid4()
            await conn.execute(
                """
                INSERT INTO commerce_feature_access_allocation_scopes (
                    id, created_at, updated_at, workspace_id, entitlement_id, revision
                ) VALUES ($1, NOW(), NOW(), $2, $3, 1)
                """,
                scope_id,
                workspace_id,
                entitlement_id,
            )
            with pytest.raises(asyncpg.UniqueViolationError):
                await conn.execute(
                    """
                    INSERT INTO commerce_feature_access_allocation_scopes (
                        id, created_at, updated_at, workspace_id, entitlement_id, revision
                    ) VALUES ($1, NOW(), NOW(), $2, $3, 1)
                    """,
                    uuid4(),
                    workspace_id,
                    entitlement_id,
                )
            receipt_id = uuid4()
            key_hash = "a" * 64
            await conn.execute(
                """
                INSERT INTO commerce_feature_access_command_receipts (
                    id, created_at, updated_at, scope_id, idempotency_key_hash, fingerprint,
                    operation, result_revision, result_snapshot
                ) VALUES ($1, NOW(), NOW(), $2, $3, $4, 'assign', 2, '{}'::jsonb)
                """,
                receipt_id,
                scope_id,
                key_hash,
                "b" * 64,
            )
            with pytest.raises(asyncpg.UniqueViolationError):
                await conn.execute(
                    """
                    INSERT INTO commerce_feature_access_command_receipts (
                        id, created_at, updated_at, scope_id, idempotency_key_hash, fingerprint,
                        operation, result_revision, result_snapshot
                    ) VALUES ($1, NOW(), NOW(), $2, $3, $4, 'assign', 2, '{}'::jsonb)
                    """,
                    uuid4(),
                    scope_id,
                    key_hash,
                    "c" * 64,
                )
            await conn.execute(
                """
                INSERT INTO commerce_workspace_commercial_access (
                    id, created_at, updated_at, workspace_id, subscription_id, state, deadline_at, state_revision, source_identity
                ) VALUES ($1, NOW(), NOW(), $2, $3, 'payment_restricted', NULL, 1, 'restricted-without-deadline')
                """,
                uuid4(),
                workspace_id,
                subscription_id,
            )
            with pytest.raises(asyncpg.CheckViolationError):
                await conn.execute(
                    """
                    UPDATE commerce_workspace_commercial_access
                    SET state = 'payment_grace', deadline_at = NULL
                    WHERE workspace_id = $1
                    """,
                    workspace_id,
                )
        finally:
            await conn.close()
    finally:
        await _drop_database(database, admin_database)
