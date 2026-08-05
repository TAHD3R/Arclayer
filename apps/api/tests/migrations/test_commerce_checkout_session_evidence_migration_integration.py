from __future__ import annotations

import os
from pathlib import Path
from uuid import UUID, uuid4

import asyncpg
import pytest

from tests.migrations.test_upload_completion_migration_integration import (
    _connection_kwargs,
    _create_database,
    _drop_database,
    _run_upgrade,
)

MIGRATION_0118 = "0118_ai_thread_pinning"
MIGRATION_0119 = "0119_commerce_checkout_session_evidence"
MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "src" / "migrations"
pytestmark = pytest.mark.integration


async def _prepare_predecessor_schema(conn: asyncpg.Connection) -> None:
    await conn.execute(
        """
        CREATE TABLE tortoise_migrations (
            id SERIAL PRIMARY KEY,
            app VARCHAR(255) NOT NULL,
            name VARCHAR(255) NOT NULL,
            applied_at TIMESTAMPTZ NOT NULL,
            UNIQUE (app, name)
        );
        CREATE TABLE workspaces (id UUID PRIMARY KEY);
        CREATE TABLE commerce_plans (id UUID PRIMARY KEY, code VARCHAR(48) NOT NULL UNIQUE);
        CREATE TABLE commerce_plan_revisions (
            id UUID PRIMARY KEY,
            plan_id UUID NOT NULL REFERENCES commerce_plans(id) ON DELETE RESTRICT
        );
        CREATE TABLE commerce_workspace_subscriptions (id UUID PRIMARY KEY);
        CREATE TABLE commerce_credit_top_up_offers (id UUID PRIMARY KEY);
        CREATE TABLE commerce_plan_revision_prices (
            id UUID PRIMARY KEY,
            plan_revision_id UUID NOT NULL REFERENCES commerce_plan_revisions(id) ON DELETE CASCADE,
            provider VARCHAR(32) NOT NULL,
            provider_mode VARCHAR(8) NOT NULL,
            billing_cycle VARCHAR(16) NOT NULL,
            currency VARCHAR(3) NOT NULL,
            external_price_id VARCHAR(255) NOT NULL
        );
        CREATE TABLE commerce_credit_top_up_offer_prices (
            id UUID PRIMARY KEY,
            offer_id UUID NOT NULL REFERENCES commerce_credit_top_up_offers(id) ON DELETE CASCADE,
            provider VARCHAR(32) NOT NULL,
            provider_mode VARCHAR(8) NOT NULL,
            currency VARCHAR(3) NOT NULL,
            external_price_id VARCHAR(255) NOT NULL
        );
        CREATE TABLE commerce_checkout_sessions (
            id UUID PRIMARY KEY,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
            subscription_id UUID NULL REFERENCES commerce_workspace_subscriptions(id) ON DELETE RESTRICT,
            target_plan_revision_id UUID NULL REFERENCES commerce_plan_revisions(id) ON DELETE RESTRICT,
            top_up_offer_id UUID NULL REFERENCES commerce_credit_top_up_offers(id) ON DELETE RESTRICT,
            provider VARCHAR(32) NOT NULL,
            provider_mode VARCHAR(8) NOT NULL,
            kind VARCHAR(16) NOT NULL,
            status VARCHAR(16) NOT NULL DEFAULT 'pending',
            billing_cycle VARCHAR(16) NULL,
            currency VARCHAR(3) NOT NULL,
            amount_micros BIGINT NOT NULL,
            credit_amount BIGINT NULL,
            external_session_id VARCHAR(255) NOT NULL UNIQUE,
            checkout_url TEXT NOT NULL,
            idempotency_key VARCHAR(160) NOT NULL UNIQUE,
            actor_user_id UUID NOT NULL,
            expires_at TIMESTAMPTZ NOT NULL,
            completed_at TIMESTAMPTZ NULL,
            CONSTRAINT commerce_checkout_session_target_check CHECK (
                (kind = 'subscription' AND target_plan_revision_id IS NOT NULL AND top_up_offer_id IS NULL)
                OR (
                    kind = 'top_up' AND target_plan_revision_id IS NULL
                    AND top_up_offer_id IS NOT NULL AND credit_amount IS NOT NULL
                )
            )
        );
        CREATE INDEX commerce_checkout_session_provider_status_idx
            ON commerce_checkout_sessions (provider, provider_mode, status);
        """
    )
    migration_names = sorted(
        path.stem for path in MIGRATIONS_DIR.glob("[0-9][0-9][0-9][0-9]_*.py") if path.stem <= MIGRATION_0118
    )
    await conn.executemany(
        "INSERT INTO tortoise_migrations (app, name, applied_at) VALUES ('models', $1, NOW())",
        [(name,) for name in migration_names],
    )


async def _seed_checkout_rows(conn: asyncpg.Connection) -> tuple[UUID, UUID]:
    workspace_id, subscription_id, plan_id, revision_id, offer_id = (uuid4() for _ in range(5))
    subscription_checkout_id, top_up_checkout_id = uuid4(), uuid4()
    await conn.execute("INSERT INTO workspaces (id) VALUES ($1)", workspace_id)
    await conn.execute("INSERT INTO commerce_workspace_subscriptions (id) VALUES ($1)", subscription_id)
    await conn.execute("INSERT INTO commerce_plans (id, code) VALUES ($1, 'premium')", plan_id)
    await conn.execute(
        "INSERT INTO commerce_plan_revisions (id, plan_id) VALUES ($1, $2)",
        revision_id,
        plan_id,
    )
    await conn.execute(
        """
        INSERT INTO commerce_plan_revision_prices (
            id, plan_revision_id, provider, provider_mode, billing_cycle, currency, external_price_id
        ) VALUES ($1, $2, 'simulated', 'test', 'monthly', 'USD', 'sim_price_subscription')
        """,
        uuid4(),
        revision_id,
    )
    await conn.execute("INSERT INTO commerce_credit_top_up_offers (id) VALUES ($1)", offer_id)
    await conn.execute(
        """
        INSERT INTO commerce_credit_top_up_offer_prices (
            id, offer_id, provider, provider_mode, currency, external_price_id
        ) VALUES ($1, $2, 'simulated', 'test', 'USD', 'sim_price_top_up')
        """,
        uuid4(),
        offer_id,
    )
    await conn.execute(
        """
        INSERT INTO commerce_checkout_sessions (
            id, created_at, updated_at, workspace_id, subscription_id, target_plan_revision_id,
            top_up_offer_id, provider, provider_mode, kind, status, billing_cycle, currency,
            amount_micros, credit_amount, external_session_id, checkout_url, idempotency_key,
            actor_user_id, expires_at, completed_at
        ) VALUES (
            $1, NOW(), NOW(), $2, $3, $4, NULL, 'simulated', 'test', 'subscription', 'pending',
            'monthly', 'USD', 99000000, NULL, 'sim_cs_subscription', 'https://app.test/checkout',
            'checkout-subscription-key', $5, NOW() + INTERVAL '30 minutes', NULL
        )
        """,
        subscription_checkout_id,
        workspace_id,
        subscription_id,
        revision_id,
        uuid4(),
    )
    await conn.execute(
        """
        INSERT INTO commerce_checkout_sessions (
            id, created_at, updated_at, workspace_id, subscription_id, target_plan_revision_id,
            top_up_offer_id, provider, provider_mode, kind, status, billing_cycle, currency,
            amount_micros, credit_amount, external_session_id, checkout_url, idempotency_key,
            actor_user_id, expires_at, completed_at
        ) VALUES (
            $1, NOW(), NOW(), $2, NULL, NULL, $3, 'simulated', 'test', 'top_up', 'pending',
            NULL, 'USD', 25000000, 5000, 'sim_cs_top_up', 'https://app.test/top-up',
            'checkout-top-up-key', $4, NOW() + INTERVAL '30 minutes', NULL
        )
        """,
        top_up_checkout_id,
        workspace_id,
        offer_id,
        uuid4(),
    )
    return subscription_checkout_id, top_up_checkout_id


@pytest.mark.asyncio
async def test_checkout_session_evidence_migration_backfills_exact_price_and_constraints(
    integration_db_settings,
) -> None:
    _ = integration_db_settings
    database = f"arclayer_checkout_0119_{uuid4().hex[:14]}"
    admin_database = os.getenv("TEST_DATABASE__ADMIN_DB", "postgres")
    await _create_database(database, admin_database)
    try:
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            await _prepare_predecessor_schema(conn)
            subscription_checkout_id, top_up_checkout_id = await _seed_checkout_rows(conn)
        finally:
            await conn.close()

        await _run_upgrade(database, MIGRATION_0119)
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            subscription_row = await conn.fetchrow(
                "SELECT * FROM commerce_checkout_sessions WHERE id = $1",
                subscription_checkout_id,
            )
            top_up_row = await conn.fetchrow(
                "SELECT * FROM commerce_checkout_sessions WHERE id = $1",
                top_up_checkout_id,
            )
            assert subscription_row is not None
            assert subscription_row["plan_code"] == "premium"
            assert subscription_row["provider_account_id"] == "platform"
            assert subscription_row["external_price_id"] == "sim_price_subscription"
            assert len(subscription_row["request_fingerprint"]) == 64
            assert subscription_row["revision"] == 1
            assert top_up_row is not None
            assert top_up_row["plan_code"] is None
            assert top_up_row["external_price_id"] == "sim_price_top_up"

            with pytest.raises(asyncpg.CheckViolationError):
                await conn.execute(
                    "UPDATE commerce_checkout_sessions SET request_fingerprint = 'invalid' WHERE id = $1",
                    subscription_checkout_id,
                )
            with pytest.raises(asyncpg.CheckViolationError):
                await conn.execute(
                    "UPDATE commerce_checkout_sessions SET revision = 0 WHERE id = $1",
                    subscription_checkout_id,
                )

            indexes = {
                row["indexname"]
                for row in await conn.fetch(
                    "SELECT indexname FROM pg_indexes WHERE tablename = 'commerce_checkout_sessions'"
                )
            }
            assert "commerce_checkout_session_provider_status_idx" in indexes
            assert "commerce_checkout_session_price_idx" in indexes
            assert (
                await conn.fetchval(
                    "SELECT COUNT(*) FROM tortoise_migrations WHERE app = 'models' AND name = $1",
                    MIGRATION_0119,
                )
                == 1
            )
        finally:
            await conn.close()
    finally:
        await _drop_database(database, admin_database)
