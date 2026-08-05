from __future__ import annotations

import os
from pathlib import Path
from uuid import uuid4

import asyncpg
import pytest

from tests.migrations.test_upload_completion_migration_integration import (
    _connection_kwargs,
    _create_database,
    _drop_database,
    _run_upgrade,
)

MIGRATION_0126 = "0126_commerce_provider_payment_projections"
MIGRATION_0127 = "0127_top_up_checkout_snapshot_evidence"
MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "src" / "migrations"
pytestmark = pytest.mark.integration


async def _prepare_predecessor_schema(conn: asyncpg.Connection) -> tuple[object, object]:
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
        CREATE TABLE commerce_workspace_subscriptions (id UUID PRIMARY KEY);
        CREATE TABLE commerce_plan_revisions (id UUID PRIMARY KEY);
        CREATE TABLE commerce_credit_top_up_offers (
            id UUID PRIMARY KEY,
            revision BIGINT NOT NULL
        );
        CREATE TABLE commerce_checkout_sessions (
            id UUID PRIMARY KEY,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
            subscription_id UUID NULL REFERENCES commerce_workspace_subscriptions(id) ON DELETE RESTRICT,
            target_plan_revision_id UUID NULL REFERENCES commerce_plan_revisions(id) ON DELETE RESTRICT,
            top_up_offer_id UUID NULL REFERENCES commerce_credit_top_up_offers(id) ON DELETE RESTRICT,
            plan_code VARCHAR(48) NULL,
            provider VARCHAR(32) NOT NULL,
            provider_mode VARCHAR(8) NOT NULL,
            provider_account_id VARCHAR(255) NOT NULL,
            kind VARCHAR(16) NOT NULL,
            status VARCHAR(16) NOT NULL,
            billing_cycle VARCHAR(16) NULL,
            currency VARCHAR(3) NOT NULL,
            amount_micros BIGINT NOT NULL,
            credit_amount BIGINT NULL,
            external_price_id VARCHAR(255) NOT NULL,
            external_session_id VARCHAR(255) NOT NULL UNIQUE,
            checkout_url TEXT NOT NULL,
            idempotency_key VARCHAR(160) NOT NULL UNIQUE,
            request_fingerprint VARCHAR(64) NOT NULL,
            actor_user_id UUID NOT NULL,
            expires_at TIMESTAMPTZ NOT NULL,
            completed_at TIMESTAMPTZ NULL,
            revision BIGINT NOT NULL DEFAULT 1,
            CONSTRAINT commerce_checkout_session_target_check CHECK (
                (
                    kind = 'subscription'
                    AND target_plan_revision_id IS NOT NULL
                    AND top_up_offer_id IS NULL
                    AND plan_code IS NOT NULL
                )
                OR (
                    kind = 'top_up'
                    AND target_plan_revision_id IS NULL
                    AND top_up_offer_id IS NOT NULL
                    AND plan_code IS NULL
                    AND credit_amount IS NOT NULL
                )
            )
        );
        """
    )
    migration_names = sorted(
        path.stem for path in MIGRATIONS_DIR.glob("[0-9][0-9][0-9][0-9]_*.py") if path.stem <= MIGRATION_0126
    )
    await conn.executemany(
        "INSERT INTO tortoise_migrations (app, name, applied_at) VALUES ('models', $1, NOW())",
        [(name,) for name in migration_names],
    )
    workspace_id = uuid4()
    offer_id = uuid4()
    checkout_id = uuid4()
    await conn.execute("INSERT INTO workspaces (id) VALUES ($1)", workspace_id)
    await conn.execute(
        "INSERT INTO commerce_credit_top_up_offers (id, revision) VALUES ($1, 4)",
        offer_id,
    )
    await conn.execute(
        """
        INSERT INTO commerce_checkout_sessions (
            id, created_at, updated_at, workspace_id, top_up_offer_id, provider, provider_mode,
            provider_account_id, kind, status, currency, amount_micros, credit_amount,
            external_price_id, external_session_id, checkout_url, idempotency_key,
            request_fingerprint, actor_user_id, expires_at, revision
        ) VALUES (
            $1, NOW(), NOW(), $2, $3, 'simulated', 'test', 'platform', 'top_up', 'pending',
            'USD', 20000000, 2000, 'sim_price_top_up', 'sim_cs_top_up', 'https://example.test',
            'arclayer:top-up-checkout:test', $4, $5, NOW() + INTERVAL '30 minutes', 1
        )
        """,
        checkout_id,
        workspace_id,
        offer_id,
        "a" * 64,
        uuid4(),
    )
    return checkout_id, offer_id


@pytest.mark.asyncio
async def test_top_up_checkout_snapshot_migration_backfills_and_enforces_shape(integration_db_settings) -> None:
    _ = integration_db_settings
    database = f"arclayer_top_up_checkout_0127_{uuid4().hex[:10]}"
    admin_database = os.getenv("TEST_DATABASE__ADMIN_DB", "postgres")
    await _create_database(database, admin_database)
    try:
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            checkout_id, _ = await _prepare_predecessor_schema(conn)
        finally:
            await conn.close()

        await _run_upgrade(database, MIGRATION_0127)
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            revision = await conn.fetchval(
                "SELECT top_up_offer_revision FROM commerce_checkout_sessions WHERE id = $1",
                checkout_id,
            )
            assert revision == 4

            constraints = "\n".join(
                row["definition"]
                for row in await conn.fetch(
                    """
                    SELECT pg_get_constraintdef(oid) AS definition
                    FROM pg_constraint
                    WHERE conrelid = 'commerce_checkout_sessions'::regclass
                    """
                )
            )
            assert "top_up_offer_revision IS NOT NULL" in constraints
            assert "subscription_id IS NULL" in constraints
            assert "top_up_offer_revision >= 1" in constraints

            with pytest.raises(asyncpg.CheckViolationError):
                await conn.execute(
                    "UPDATE commerce_checkout_sessions SET billing_cycle = 'monthly' WHERE id = $1",
                    checkout_id,
                )
            with pytest.raises(asyncpg.CheckViolationError):
                await conn.execute(
                    "UPDATE commerce_checkout_sessions SET top_up_offer_revision = 0 WHERE id = $1",
                    checkout_id,
                )
        finally:
            await conn.close()
    finally:
        await _drop_database(database, admin_database)
