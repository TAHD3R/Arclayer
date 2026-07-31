from __future__ import annotations

from pathlib import Path

import asyncpg

MIGRATION_0078 = "0078_platform_identity_security_hard_cut"
MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "src" / "migrations"


def _migration_names_through_0078() -> list[str]:
    return sorted(
        path.stem
        for path in MIGRATIONS_DIR.glob("[0-9][0-9][0-9][0-9]_*.py")
        if path.stem <= MIGRATION_0078
    )


async def prepare_commercialization_legacy_schema(conn: asyncpg.Connection) -> None:
    """Build only the predecessor tables the destructive 0079 migration touches."""

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
        CREATE TABLE commerce_plans (
            id UUID PRIMARY KEY,
            code VARCHAR(48) NOT NULL UNIQUE,
            tier VARCHAR(16) NOT NULL,
            features JSONB NOT NULL
        );
        CREATE TABLE commerce_workspace_subscriptions (
            id UUID PRIMARY KEY,
            workspace_id UUID NOT NULL UNIQUE REFERENCES workspaces(id),
            plan_id UUID NOT NULL REFERENCES commerce_plans(id),
            status VARCHAR(16) NOT NULL
        );
        CREATE TABLE commerce_workspace_credit_accounts (id UUID PRIMARY KEY);
        CREATE TABLE commerce_workspace_credit_ledger (id UUID PRIMARY KEY);
        CREATE TABLE commerce_subscription_change_requests (
            id UUID PRIMARY KEY,
            status VARCHAR(16) NOT NULL
        );
        CREATE TABLE commerce_billing_provider_event_receipts (id UUID PRIMARY KEY);
        CREATE TABLE connector_event_inbox (
            id UUID PRIMARY KEY,
            connector_key VARCHAR(128) NOT NULL
        );
        """
    )
    await conn.executemany(
        """
        INSERT INTO tortoise_migrations (app, name, applied_at)
        VALUES ('models', $1, NOW())
        """,
        [(name,) for name in _migration_names_through_0078()],
    )
