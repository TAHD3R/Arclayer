from __future__ import annotations

import os
from uuid import UUID, uuid4

import asyncpg
import pytest

from tests.migrations.test_upload_completion_migration_integration import (
    _connection_kwargs,
    _create_database,
    _drop_database,
    _run_upgrade,
)
from tests.migrations.workspace_owner_legacy_schema import prepare_workspace_owner_legacy_schema

MIGRATION_0077 = "0077_workspace_owner_authority_hard_cut"


async def _insert_user(conn: asyncpg.Connection, *, user_id: UUID, label: str) -> None:
    await conn.execute(
        """
        INSERT INTO users (
            id, created_at, updated_at, username, email, status,
            is_super_admin, token_version
        ) VALUES ($1, NOW(), NOW(), $2, $3, 'active', FALSE, 0)
        """,
        user_id,
        f"migration-{label}-{user_id.hex[:8]}",
        f"migration-{label}-{user_id.hex[:8]}@example.com",
    )


async def _insert_organization(
    conn: asyncpg.Connection,
    *,
    organization_id: UUID,
    owner_user_id: UUID,
) -> None:
    await conn.execute(
        """
        INSERT INTO organizations (
            id, created_at, updated_at, slug, name, owner_user_id, is_active
        ) VALUES ($1, NOW(), NOW(), $2, 'Migration Org', $3, TRUE)
        """,
        organization_id,
        f"migration-org-{organization_id.hex[:12]}",
        owner_user_id,
    )


async def _insert_workspace(
    conn: asyncpg.Connection,
    *,
    workspace_id: UUID,
    organization_id: UUID,
    creator_user_id: UUID,
    owner_user_id: UUID | None,
) -> None:
    await conn.execute(
        """
        INSERT INTO workspaces (
            id, created_at, updated_at, organization_id, name, owner_user_id,
            icon_mode, icon_color, is_active, created_by_user_id, extension_revision
        ) VALUES (
            $1, NOW(), NOW(), $2, $3, $4,
            'initials', '#337ea9', TRUE, $5, 1
        )
        """,
        workspace_id,
        organization_id,
        f"Migration Workspace {workspace_id.hex[:8]}",
        owner_user_id,
        creator_user_id,
    )


async def _insert_membership(
    conn: asyncpg.Connection,
    *,
    membership_id: UUID,
    workspace_id: UUID,
    user_id: UUID,
) -> None:
    await conn.execute(
        """
        INSERT INTO workspace_memberships (
            id, created_at, updated_at, workspace_id, user_id, status
        ) VALUES ($1, NOW(), NOW(), $2, $3, 'active')
        """,
        membership_id,
        workspace_id,
        user_id,
    )


async def _insert_free_plan(conn: asyncpg.Connection, *, plan_id: UUID) -> None:
    await conn.execute(
        """
        INSERT INTO commerce_plans (
            id, created_at, updated_at, code, tier, name, description,
            credit_grant_amount, credit_refresh_interval, credit_value_micros,
            price_monthly_micros, price_yearly_micros, currency, features,
            is_active, is_default, sort_order
        ) VALUES (
            $1, NOW(), NOW(), 'free', 'free', 'Free', 'Migration Free Plan',
            70, 'daily', 1000, 0, 0, 'USD', '[]'::jsonb, TRUE, TRUE, 10
        )
        """,
        plan_id,
    )


async def _insert_owner_role_binding(
    conn: asyncpg.Connection,
    *,
    workspace_id: UUID,
    membership_id: UUID,
) -> tuple[UUID, UUID]:
    role_id = uuid4()
    binding_id = uuid4()
    await conn.execute(
        """
        INSERT INTO system_roles (
            id, created_at, updated_at, workspace_id, code, name,
            is_system, is_default, is_superuser
        ) VALUES ($1, NOW(), NOW(), $2, 'owner', 'Owner', TRUE, FALSE, TRUE)
        """,
        role_id,
        workspace_id,
    )
    await conn.execute(
        """
        INSERT INTO workspace_membership_roles (
            id, created_at, updated_at, membership_id, role_id
        ) VALUES ($1, NOW(), NOW(), $2, $3)
        """,
        binding_id,
        membership_id,
        role_id,
    )
    return role_id, binding_id


@pytest.mark.asyncio
async def test_migration_rejects_conflicting_legacy_owner_role(integration_db_settings) -> None:
    database = f"arclayer_owner_conflict_{uuid4().hex[:18]}"
    admin_database = os.getenv("TEST_DATABASE__ADMIN_DB", "postgres")
    await _create_database(database, admin_database)
    try:
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            await prepare_workspace_owner_legacy_schema(conn)
            creator_user_id = uuid4()
            conflicting_user_id = uuid4()
            organization_id = uuid4()
            workspace_id = uuid4()
            await _insert_user(conn, user_id=creator_user_id, label="creator")
            await _insert_user(conn, user_id=conflicting_user_id, label="conflicting-owner")
            await _insert_organization(
                conn,
                organization_id=organization_id,
                owner_user_id=creator_user_id,
            )
            await _insert_workspace(
                conn,
                workspace_id=workspace_id,
                organization_id=organization_id,
                creator_user_id=creator_user_id,
                owner_user_id=None,
            )
            await _insert_membership(
                conn,
                membership_id=uuid4(),
                workspace_id=workspace_id,
                user_id=creator_user_id,
            )
            conflicting_membership_id = uuid4()
            await _insert_membership(
                conn,
                membership_id=conflicting_membership_id,
                workspace_id=workspace_id,
                user_id=conflicting_user_id,
            )
            await _insert_owner_role_binding(
                conn,
                workspace_id=workspace_id,
                membership_id=conflicting_membership_id,
            )
        finally:
            await conn.close()

        with pytest.raises(AssertionError, match="assignable Owner role conflicts with the Workspace creator"):
            await _run_upgrade(database, MIGRATION_0077)
    finally:
        await _drop_database(database, admin_database)


@pytest.mark.asyncio
async def test_migration_rejects_multiple_owned_free_workspaces(integration_db_settings) -> None:
    database = f"arclayer_owner_allowance_{uuid4().hex[:18]}"
    admin_database = os.getenv("TEST_DATABASE__ADMIN_DB", "postgres")
    await _create_database(database, admin_database)
    try:
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            await prepare_workspace_owner_legacy_schema(conn)
            owner_user_id = uuid4()
            organization_id = uuid4()
            await _insert_user(conn, user_id=owner_user_id, label="free-owner")
            await _insert_organization(
                conn,
                organization_id=organization_id,
                owner_user_id=owner_user_id,
            )
            await _insert_free_plan(conn, plan_id=uuid4())
            for _index in range(2):
                workspace_id = uuid4()
                await _insert_workspace(
                    conn,
                    workspace_id=workspace_id,
                    organization_id=organization_id,
                    creator_user_id=owner_user_id,
                    owner_user_id=owner_user_id,
                )
                await _insert_membership(
                    conn,
                    membership_id=uuid4(),
                    workspace_id=workspace_id,
                    user_id=owner_user_id,
                )
        finally:
            await conn.close()

        with pytest.raises(AssertionError, match="a User owns more than one Free Workspace"):
            await _run_upgrade(database, MIGRATION_0077)
    finally:
        await _drop_database(database, admin_database)


@pytest.mark.asyncio
async def test_migration_backfills_owner_and_removes_legacy_owner_role(integration_db_settings) -> None:
    database = f"arclayer_owner_backfill_{uuid4().hex[:18]}"
    admin_database = os.getenv("TEST_DATABASE__ADMIN_DB", "postgres")
    await _create_database(database, admin_database)
    try:
        owner_user_id = uuid4()
        organization_id = uuid4()
        workspace_id = uuid4()
        membership_id = uuid4()
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            await prepare_workspace_owner_legacy_schema(conn)
            await _insert_user(conn, user_id=owner_user_id, label="backfill-owner")
            await _insert_organization(
                conn,
                organization_id=organization_id,
                owner_user_id=owner_user_id,
            )
            await _insert_workspace(
                conn,
                workspace_id=workspace_id,
                organization_id=organization_id,
                creator_user_id=owner_user_id,
                owner_user_id=None,
            )
            await _insert_membership(
                conn,
                membership_id=membership_id,
                workspace_id=workspace_id,
                user_id=owner_user_id,
            )
            role_id, binding_id = await _insert_owner_role_binding(
                conn,
                workspace_id=workspace_id,
                membership_id=membership_id,
            )
            await _insert_free_plan(conn, plan_id=uuid4())
        finally:
            await conn.close()

        await _run_upgrade(database, MIGRATION_0077)

        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            assert (
                await conn.fetchval(
                    """
                SELECT COUNT(*)
                FROM tortoise_migrations
                WHERE app = 'models' AND name = $1
                """,
                    MIGRATION_0077,
                )
                == 1
            )
            assert (
                await conn.fetchval(
                    "SELECT owner_user_id FROM workspaces WHERE id = $1",
                    workspace_id,
                )
                == owner_user_id
            )
            assert not await conn.fetchval("SELECT EXISTS (SELECT 1 FROM system_roles WHERE id = $1)", role_id)
            assert not await conn.fetchval(
                "SELECT EXISTS (SELECT 1 FROM workspace_membership_roles WHERE id = $1)",
                binding_id,
            )
            assert (
                await conn.fetchval(
                    """
                SELECT plan.tier
                FROM commerce_workspace_subscriptions AS subscription
                JOIN commerce_plans AS plan ON plan.id = subscription.plan_id
                WHERE subscription.workspace_id = $1
                """,
                    workspace_id,
                )
                == "free"
            )
            assert await conn.fetchval("SELECT to_regclass('workspace_ownership_transfers')") is not None
        finally:
            await conn.close()
    finally:
        await _drop_database(database, admin_database)
