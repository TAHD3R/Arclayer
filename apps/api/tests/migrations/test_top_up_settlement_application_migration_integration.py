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

MIGRATION_0127 = "0127_top_up_checkout_snapshot_evidence"
MIGRATION_0128 = "0128_top_up_settlement_applications"
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
        CREATE TABLE commerce_checkout_outcome_commands (id UUID PRIMARY KEY);
        CREATE TABLE commerce_transactions (id UUID PRIMARY KEY);
        CREATE TABLE commerce_invoices (id UUID PRIMARY KEY);
        CREATE TABLE commerce_workspace_credit_ledger (id UUID PRIMARY KEY);
        CREATE TABLE commerce_workspace_credit_grant_lots (id UUID PRIMARY KEY);
        """
    )
    migration_names = sorted(
        path.stem for path in MIGRATIONS_DIR.glob("[0-9][0-9][0-9][0-9]_*.py") if path.stem <= MIGRATION_0127
    )
    await conn.executemany(
        "INSERT INTO tortoise_migrations (app, name, applied_at) VALUES ('models', $1, NOW())",
        [(name,) for name in migration_names],
    )


@pytest.mark.asyncio
async def test_top_up_settlement_application_migration_applies_exact_once_relations(integration_db_settings) -> None:
    _ = integration_db_settings
    database = f"arclayer_top_up_settlement_0128_{uuid4().hex[:10]}"
    admin_database = os.getenv("TEST_DATABASE__ADMIN_DB", "postgres")
    await _create_database(database, admin_database)
    try:
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            await _prepare_predecessor_schema(conn)
        finally:
            await conn.close()

        await _run_upgrade(database, MIGRATION_0128)
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            nullable_columns = {
                row["column_name"]: row["is_nullable"] == "YES"
                for row in await conn.fetch(
                    """
                    SELECT column_name, is_nullable
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'commerce_top_up_settlement_applications'
                    """
                )
            }
            assert nullable_columns["workspace_id"] is False
            assert nullable_columns["checkout_session_id"] is False
            for column in (
                "granted_checkout_session_id",
                "outcome_command_id",
                "transaction_id",
                "invoice_id",
                "ledger_entry_id",
                "grant_lot_id",
                "external_invoice_id",
            ):
                assert nullable_columns[column] is True

            unique_columns = {
                tuple(row["columns"])
                for row in await conn.fetch(
                    """
                    SELECT array_agg(kcu.column_name ORDER BY kcu.ordinal_position) AS columns
                    FROM information_schema.table_constraints AS tc
                    JOIN information_schema.key_column_usage AS kcu
                      ON tc.constraint_catalog = kcu.constraint_catalog
                     AND tc.constraint_schema = kcu.constraint_schema
                     AND tc.constraint_name = kcu.constraint_name
                    WHERE tc.table_schema = 'public'
                      AND tc.table_name = 'commerce_top_up_settlement_applications'
                      AND tc.constraint_type = 'UNIQUE'
                    GROUP BY tc.constraint_name
                    """
                )
            }
            assert (
                "provider",
                "provider_mode",
                "provider_account_id",
                "provider_event_id",
            ) in unique_columns
            for column in (
                "granted_checkout_session_id",
                "outcome_command_id",
                "transaction_id",
                "invoice_id",
                "ledger_entry_id",
                "grant_lot_id",
            ):
                assert (column,) in unique_columns

            indexes = "\n".join(
                row["indexdef"]
                for row in await conn.fetch(
                    """
                    SELECT indexdef
                    FROM pg_indexes
                    WHERE schemaname = 'public'
                      AND tablename = 'commerce_top_up_settlement_applications'
                    """
                )
            )
            assert "workspace_id, provider_event_occurred_at" in indexes
            assert "checkout_session_id, provider_event_occurred_at" in indexes
        finally:
            await conn.close()
    finally:
        await _drop_database(database, admin_database)
