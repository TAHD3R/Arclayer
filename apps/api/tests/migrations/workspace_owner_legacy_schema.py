from __future__ import annotations

from pathlib import Path

import asyncpg

MIGRATION_0076 = "0076_auto_20260729_1107"
MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "src" / "migrations"


def _migration_names_through_0076() -> list[str]:
    return sorted(
        path.stem
        for path in MIGRATIONS_DIR.glob("[0-9][0-9][0-9][0-9]_*.py")
        if path.stem <= MIGRATION_0076
    )


async def prepare_workspace_owner_legacy_schema(conn: asyncpg.Connection) -> None:
    """Build the exact legacy tables touched by migration 0077.

    Unrelated migrations have their own clean-chain integration coverage. Keeping this
    fixture focused lets each 0077 behavior test stay inside the repository's 60-second
    single-node timeout while the real migration operation and ledger application remain
    under test.
    """

    await conn.execute(
        """
        CREATE TABLE tortoise_migrations (
            id SERIAL PRIMARY KEY,
            app VARCHAR(255) NOT NULL,
            name VARCHAR(255) NOT NULL,
            applied_at TIMESTAMPTZ NOT NULL,
            UNIQUE (app, name)
        );

        CREATE TABLE users (
            id UUID PRIMARY KEY,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            username VARCHAR(64) NOT NULL UNIQUE,
            email VARCHAR(255) UNIQUE,
            status VARCHAR(16) NOT NULL,
            is_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
            token_version INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE organizations (
            id UUID PRIMARY KEY,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            slug VARCHAR(64) NOT NULL UNIQUE,
            name VARCHAR(128) NOT NULL,
            owner_user_id UUID NOT NULL REFERENCES users(id),
            is_active BOOLEAN NOT NULL DEFAULT TRUE
        );

        CREATE TABLE workspaces (
            id UUID PRIMARY KEY,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            name VARCHAR(128) NOT NULL,
            owner_user_id UUID,
            icon_mode VARCHAR(16) NOT NULL,
            icon_color VARCHAR(16) NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            deleted_at TIMESTAMPTZ,
            created_by_user_id UUID NOT NULL,
            extension_revision BIGINT NOT NULL DEFAULT 1
        );

        CREATE TABLE workspace_memberships (
            id UUID PRIMARY KEY,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            status VARCHAR(16) NOT NULL,
            invited_by_user_id UUID,
            UNIQUE (workspace_id, user_id)
        );

        CREATE TABLE system_roles (
            id UUID PRIMARY KEY,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            code VARCHAR(64) NOT NULL,
            name VARCHAR(96) NOT NULL,
            is_system BOOLEAN NOT NULL DEFAULT FALSE,
            is_default BOOLEAN NOT NULL DEFAULT FALSE,
            is_superuser BOOLEAN NOT NULL DEFAULT FALSE,
            UNIQUE (workspace_id, code)
        );

        CREATE TABLE workspace_membership_roles (
            id UUID PRIMARY KEY,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            membership_id UUID NOT NULL REFERENCES workspace_memberships(id) ON DELETE CASCADE,
            role_id UUID NOT NULL REFERENCES system_roles(id) ON DELETE CASCADE,
            UNIQUE (membership_id, role_id)
        );

        CREATE TABLE commerce_plans (
            id UUID PRIMARY KEY,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            code VARCHAR(48) NOT NULL UNIQUE,
            tier VARCHAR(16) NOT NULL,
            name VARCHAR(96) NOT NULL,
            description VARCHAR(512) NOT NULL,
            credit_grant_amount BIGINT NOT NULL,
            credit_refresh_interval VARCHAR(16) NOT NULL,
            credit_value_micros BIGINT NOT NULL,
            price_monthly_micros BIGINT NOT NULL,
            price_yearly_micros BIGINT NOT NULL,
            currency VARCHAR(3) NOT NULL,
            features JSONB NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            is_default BOOLEAN NOT NULL DEFAULT FALSE,
            sort_order INTEGER NOT NULL DEFAULT 100
        );

        CREATE TABLE commerce_workspace_subscriptions (
            id UUID PRIMARY KEY,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            workspace_id UUID NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
            plan_id UUID NOT NULL REFERENCES commerce_plans(id),
            status VARCHAR(16) NOT NULL,
            billing_cycle VARCHAR(16) NOT NULL,
            current_period_start TIMESTAMPTZ NOT NULL,
            current_period_end TIMESTAMPTZ NOT NULL,
            cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
            billing_provider VARCHAR(32) NOT NULL,
            external_customer_id VARCHAR(128),
            external_subscription_id VARCHAR(128) UNIQUE
        );
        """
    )
    await conn.executemany(
        """
        INSERT INTO tortoise_migrations (app, name, applied_at)
        VALUES ('models', $1, NOW())
        """,
        [(name,) for name in _migration_names_through_0076()],
    )
