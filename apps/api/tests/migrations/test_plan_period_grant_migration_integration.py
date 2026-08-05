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

MIGRATION_0124 = "0124_commercial_access_fact_immutability"
MIGRATION_0125 = "0125_commerce_plan_period_grants"
MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "src" / "migrations"
pytestmark = pytest.mark.integration


async def _prepare_predecessor_schema(conn: asyncpg.Connection) -> dict[str, UUID]:
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
        CREATE TABLE commerce_workspace_credit_accounts (id UUID PRIMARY KEY);
        CREATE TABLE commerce_workspace_subscriptions (id UUID PRIMARY KEY);
        CREATE TABLE commerce_plan_revisions (id UUID PRIMARY KEY);
        CREATE TABLE commerce_provider_event_applications (id UUID PRIMARY KEY);
        CREATE TABLE commerce_workspace_credit_ledger (id UUID PRIMARY KEY);
        CREATE TABLE commerce_workspace_credit_grant_lots (id UUID PRIMARY KEY);
        """
    )
    migration_names = sorted(
        path.stem for path in MIGRATIONS_DIR.glob("[0-9][0-9][0-9][0-9]_*.py") if path.stem <= MIGRATION_0124
    )
    await conn.executemany(
        "INSERT INTO tortoise_migrations (app, name, applied_at) VALUES ('models', $1, NOW())",
        [(name,) for name in migration_names],
    )
    identities = {
        "workspace": uuid4(),
        "account": uuid4(),
        "subscription": uuid4(),
        "revision": uuid4(),
        "application": uuid4(),
        "ledger": uuid4(),
        "lot": uuid4(),
    }
    for table, key in (
        ("workspaces", "workspace"),
        ("commerce_workspace_credit_accounts", "account"),
        ("commerce_workspace_subscriptions", "subscription"),
        ("commerce_plan_revisions", "revision"),
        ("commerce_provider_event_applications", "application"),
        ("commerce_workspace_credit_ledger", "ledger"),
        ("commerce_workspace_credit_grant_lots", "lot"),
    ):
        await conn.execute(f'INSERT INTO "{table}" (id) VALUES ($1)', identities[key])
    return identities


@pytest.mark.asyncio
async def test_plan_period_grant_migration_applies_exact_relations_and_indexes(integration_db_settings) -> None:
    _ = integration_db_settings
    database = f"arclayer_plan_grant_0125_{uuid4().hex[:10]}"
    admin_database = os.getenv("TEST_DATABASE__ADMIN_DB", "postgres")
    await _create_database(database, admin_database)
    try:
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            identities = await _prepare_predecessor_schema(conn)
        finally:
            await conn.close()

        await _run_upgrade(database, MIGRATION_0125)
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            assert (
                await conn.fetchval(
                    "SELECT COUNT(*) FROM tortoise_migrations WHERE app = 'models' AND name = $1",
                    MIGRATION_0125,
                )
                == 1
            )
            unique_columns = {
                row["column_name"]
                for row in await conn.fetch(
                    """
                    SELECT kcu.column_name
                    FROM information_schema.table_constraints AS tc
                    JOIN information_schema.key_column_usage AS kcu
                      ON tc.constraint_name = kcu.constraint_name
                     AND tc.constraint_schema = kcu.constraint_schema
                    WHERE tc.table_schema = 'public'
                      AND tc.table_name = 'commerce_plan_period_grants'
                      AND tc.constraint_type = 'UNIQUE'
                    """
                )
            }
            assert {"application_id", "ledger_entry_id", "grant_lot_id", "grant_identity"}.issubset(unique_columns)
            index_definitions = "\n".join(
                row["indexdef"]
                for row in await conn.fetch(
                    "SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = $1",
                    "commerce_plan_period_grants",
                )
            )
            assert "workspace_id, period_start, period_end" in index_definitions
            assert "provider, provider_mode, provider_account_id, provider_period_identity" in index_definitions

            grant_id = uuid4()
            await conn.execute(
                """
                INSERT INTO commerce_plan_period_grants (
                    id, created_at, updated_at, workspace_id, account_id, subscription_id,
                    plan_revision_id, application_id, ledger_entry_id, grant_lot_id,
                    grant_identity, reason, provider, provider_mode, provider_account_id,
                    provider_event_id, provider_period_identity, period_start, period_end, granted_credits
                ) VALUES (
                    $1, NOW(), NOW(), $2, $3, $4, $5, $6, $7, $8,
                    $9, 'recovery', 'simulated', 'test', 'platform',
                    'sim_evt_recovery', 'sim_period_recovery', NOW(), NOW() + interval '30 days', 100
                )
                """,
                grant_id,
                identities["workspace"],
                identities["account"],
                identities["subscription"],
                identities["revision"],
                identities["application"],
                identities["ledger"],
                identities["lot"],
                f"grant-{grant_id}",
            )
            with pytest.raises(asyncpg.ForeignKeyViolationError):
                await conn.execute(
                    "DELETE FROM commerce_provider_event_applications WHERE id = $1",
                    identities["application"],
                )
        finally:
            await conn.close()
    finally:
        await _drop_database(database, admin_database)
