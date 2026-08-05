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

MIGRATION_0119 = "0119_commerce_checkout_session_evidence"
MIGRATION_0120 = "0120_migration_state_reconciliation"
MIGRATION_0121 = "0121_simulated_checkout_outcome_commands"
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
        CREATE TABLE commerce_checkout_sessions (id UUID PRIMARY KEY);
        """
    )
    migration_names = sorted(
        path.stem for path in MIGRATIONS_DIR.glob("[0-9][0-9][0-9][0-9]_*.py") if path.stem <= MIGRATION_0119
    )
    await conn.executemany(
        "INSERT INTO tortoise_migrations (app, name, applied_at) VALUES ('models', $1, NOW())",
        [(name,) for name in migration_names],
    )


@pytest.mark.asyncio
async def test_state_reconciliation_and_outcome_command_upgrade_create_only_command_table(
    integration_db_settings,
) -> None:
    _ = integration_db_settings
    database = f"arclayer_checkout_outcome_0121_{uuid4().hex[:10]}"
    admin_database = os.getenv("TEST_DATABASE__ADMIN_DB", "postgres")
    await _create_database(database, admin_database)
    try:
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            await _prepare_predecessor_schema(conn)
        finally:
            await conn.close()

        await _run_upgrade(database, MIGRATION_0121)
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            columns = {
                row["column_name"]
                for row in await conn.fetch(
                    """
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'commerce_checkout_outcome_commands'
                    """
                )
            }
            assert {
                "checkout_session_id",
                "workspace_id",
                "actor_user_id",
                "outcome",
                "expected_revision",
                "idempotency_key",
                "request_fingerprint",
                "provider_event_id",
                "accepted_inbox_id",
                "accepted_job_id",
                "processed_at",
                "result_status",
                "result_revision",
                "revision",
            }.issubset(columns)
            assert await conn.fetchval("SELECT to_regclass('public.commerce_checkout_outcome_commands')") is not None
            assert (
                await conn.fetchval(
                    "SELECT COUNT(*) FROM tortoise_migrations WHERE app = 'models' AND name IN ($1, $2)",
                    MIGRATION_0120,
                    MIGRATION_0121,
                )
                == 2
            )
        finally:
            await conn.close()
    finally:
        await _drop_database(database, admin_database)
