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

MIGRATION_0125 = "0125_commerce_plan_period_grants"
MIGRATION_0126 = "0126_commerce_provider_payment_projections"
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
        CREATE TABLE commerce_workspace_subscriptions (id UUID PRIMARY KEY);
        CREATE TABLE commerce_plan_revisions (id UUID PRIMARY KEY);
        CREATE TABLE commerce_provider_event_applications (id UUID PRIMARY KEY);
        CREATE TABLE commerce_invoices (id UUID PRIMARY KEY);
        CREATE TABLE commerce_transactions (id UUID PRIMARY KEY);
        """
    )
    migration_names = sorted(
        path.stem for path in MIGRATIONS_DIR.glob("[0-9][0-9][0-9][0-9]_*.py") if path.stem <= MIGRATION_0125
    )
    await conn.executemany(
        "INSERT INTO tortoise_migrations (app, name, applied_at) VALUES ('models', $1, NOW())",
        [(name,) for name in migration_names],
    )


@pytest.mark.asyncio
async def test_provider_payment_projection_migration_applies_relations_and_indexes(integration_db_settings) -> None:
    _ = integration_db_settings
    database = f"arclayer_provider_payment_0126_{uuid4().hex[:10]}"
    admin_database = os.getenv("TEST_DATABASE__ADMIN_DB", "postgres")
    await _create_database(database, admin_database)
    try:
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            await _prepare_predecessor_schema(conn)
        finally:
            await conn.close()

        await _run_upgrade(database, MIGRATION_0126)
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            tables = {
                row["tablename"]
                for row in await conn.fetch(
                    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE $1",
                    "commerce_provider_payment%",
                )
            }
            assert tables == {
                "commerce_provider_payment_projections",
                "commerce_provider_payment_transaction_projections",
            }

            payment_indexes = "\n".join(
                row["indexdef"]
                for row in await conn.fetch(
                    "SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = $1",
                    "commerce_provider_payment_projections",
                )
            )
            assert "workspace_id, provider_event_occurred_at" in payment_indexes
            assert "invoice_id, provider_event_occurred_at" in payment_indexes
            assert "provider, provider_mode, provider_account_id, provider_event_id" in payment_indexes

            transaction_indexes = "\n".join(
                row["indexdef"]
                for row in await conn.fetch(
                    "SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = $1",
                    "commerce_provider_payment_transaction_projections",
                )
            )
            assert "transaction_id, provider_event_occurred_at" in transaction_indexes

            columns = {
                row["column_name"]
                for row in await conn.fetch(
                    """
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'commerce_provider_payment_projections'
                    """
                )
            }
            assert {"payload_sha256", "signature_reference", "payment_fingerprint"}.issubset(columns)
        finally:
            await conn.close()
    finally:
        await _drop_database(database, admin_database)
