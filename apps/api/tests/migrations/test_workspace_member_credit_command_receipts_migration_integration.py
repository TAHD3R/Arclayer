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

MIGRATION_0116 = "0116_commerce_credit_sources_member_limits_and_payments"
MIGRATION_0117 = "0117_workspace_member_credit_command_receipts"
MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "src" / "migrations"


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
        CREATE TABLE workspace_memberships (
            id UUID PRIMARY KEY,
            workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE
        );
        CREATE TABLE analytics_audit_events (
            id UUID PRIMARY KEY,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            occurred_at TIMESTAMPTZ NOT NULL,
            event_name VARCHAR(128) NOT NULL,
            workspace_id UUID NULL,
            actor_user_id UUID NULL,
            source VARCHAR(32) NULL
        );
        """
    )
    migration_names = sorted(
        path.stem for path in MIGRATIONS_DIR.glob("[0-9][0-9][0-9][0-9]_*.py") if path.stem <= MIGRATION_0116
    )
    await conn.executemany(
        "INSERT INTO tortoise_migrations (app, name, applied_at) VALUES ('models', $1, NOW())",
        [(name,) for name in migration_names],
    )


async def _seed_workspace_scope(conn: asyncpg.Connection, *, label: str) -> tuple[UUID, UUID, UUID]:
    _ = label
    user_id, workspace_id, membership_id = (uuid4() for _ in range(3))
    await conn.execute("INSERT INTO workspaces (id) VALUES ($1)", workspace_id)
    await conn.execute(
        "INSERT INTO workspace_memberships (id, workspace_id) VALUES ($1, $2)",
        membership_id,
        workspace_id,
    )
    return workspace_id, membership_id, user_id


async def _insert_audit(conn: asyncpg.Connection, *, workspace_id: UUID, actor_user_id: UUID) -> UUID:
    audit_event_id = uuid4()
    await conn.execute(
        """
        INSERT INTO analytics_audit_events (
            id, created_at, updated_at, occurred_at, event_name, workspace_id, actor_user_id, source
        ) VALUES ($1, NOW(), NOW(), NOW(), 'commerce.member_credit.set_override', $2, $3, 'api')
        """,
        audit_event_id,
        workspace_id,
        actor_user_id,
    )
    return audit_event_id


async def _insert_receipt(
    conn: asyncpg.Connection,
    *,
    workspace_id: UUID,
    membership_id: UUID | None,
    audit_event_id: UUID,
    key_hash: str,
    scope_kind: str,
    operation: str,
    revision: int,
) -> UUID:
    receipt_id = uuid4()
    await conn.execute(
        """
        INSERT INTO commerce_workspace_member_credit_command_receipts (
            id, created_at, updated_at, workspace_id, scope_kind, membership_id,
            idempotency_key_hash, request_fingerprint, operation, result_revision,
            result_snapshot, audit_event_id
        ) VALUES ($1, NOW(), NOW(), $2, $3, $4, $5, $6, $7, $8, '{}'::jsonb, $9)
        """,
        receipt_id,
        workspace_id,
        scope_kind,
        membership_id,
        key_hash,
        "f" * 64,
        operation,
        revision,
        audit_event_id,
    )
    return receipt_id


@pytest.mark.asyncio
async def test_member_credit_receipt_migration_enforces_identity_scope_and_lifecycle(
    integration_db_settings,
) -> None:
    _ = integration_db_settings
    database = f"arclayer_member_credit_0117_{uuid4().hex[:14]}"
    admin_database = os.getenv("TEST_DATABASE__ADMIN_DB", "postgres")
    await _create_database(database, admin_database)
    try:
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            await _prepare_predecessor_schema(conn)
        finally:
            await conn.close()
        await _run_upgrade(database, MIGRATION_0117)
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            workspace_id, membership_id, actor_user_id = await _seed_workspace_scope(conn, label="primary")
            other_workspace_id, _, other_actor_user_id = await _seed_workspace_scope(conn, label="other")
            audit_event_id = await _insert_audit(
                conn,
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
            )
            other_audit_event_id = await _insert_audit(
                conn,
                workspace_id=other_workspace_id,
                actor_user_id=other_actor_user_id,
            )
            receipt_id = await _insert_receipt(
                conn,
                workspace_id=workspace_id,
                membership_id=membership_id,
                audit_event_id=audit_event_id,
                key_hash="a" * 64,
                scope_kind="override",
                operation="set_override",
                revision=2,
            )
            await _insert_receipt(
                conn,
                workspace_id=other_workspace_id,
                membership_id=None,
                audit_event_id=other_audit_event_id,
                key_hash="a" * 64,
                scope_kind="default",
                operation="set_default",
                revision=2,
            )

            with pytest.raises(asyncpg.UniqueViolationError):
                await _insert_receipt(
                    conn,
                    workspace_id=workspace_id,
                    membership_id=membership_id,
                    audit_event_id=audit_event_id,
                    key_hash="a" * 64,
                    scope_kind="override",
                    operation="clear_override",
                    revision=3,
                )
            with pytest.raises(asyncpg.CheckViolationError):
                await _insert_receipt(
                    conn,
                    workspace_id=workspace_id,
                    membership_id=membership_id,
                    audit_event_id=audit_event_id,
                    key_hash="b" * 64,
                    scope_kind="default",
                    operation="set_default",
                    revision=2,
                )
            with pytest.raises(asyncpg.CheckViolationError):
                await _insert_receipt(
                    conn,
                    workspace_id=workspace_id,
                    membership_id=membership_id,
                    audit_event_id=audit_event_id,
                    key_hash="c" * 64,
                    scope_kind="override",
                    operation="invalid",
                    revision=2,
                )
            with pytest.raises(asyncpg.CheckViolationError):
                await _insert_receipt(
                    conn,
                    workspace_id=workspace_id,
                    membership_id=membership_id,
                    audit_event_id=audit_event_id,
                    key_hash="d" * 64,
                    scope_kind="override",
                    operation="set_override",
                    revision=0,
                )
            with pytest.raises(asyncpg.ForeignKeyViolationError):
                await conn.execute("DELETE FROM analytics_audit_events WHERE id = $1", audit_event_id)

            indexes = {
                row["indexname"]
                for row in await conn.fetch(
                    """
                    SELECT indexname FROM pg_indexes
                    WHERE schemaname = 'public'
                      AND tablename = 'commerce_workspace_member_credit_command_receipts'
                    """
                )
            }
            delete_rules = {
                (row["referenced_table"], row["delete_rule"])
                for row in await conn.fetch(
                    """
                    SELECT ccu.table_name AS referenced_table, rc.delete_rule
                    FROM information_schema.referential_constraints rc
                    JOIN information_schema.table_constraints tc
                      ON tc.constraint_catalog = rc.constraint_catalog
                     AND tc.constraint_schema = rc.constraint_schema
                     AND tc.constraint_name = rc.constraint_name
                    JOIN information_schema.constraint_column_usage ccu
                      ON ccu.constraint_catalog = rc.unique_constraint_catalog
                     AND ccu.constraint_schema = rc.unique_constraint_schema
                     AND ccu.constraint_name = rc.unique_constraint_name
                    WHERE tc.table_name = 'commerce_workspace_member_credit_command_receipts'
                    """
                )
            }
            migration_count = await conn.fetchval(
                "SELECT COUNT(*) FROM tortoise_migrations WHERE app = 'models' AND name = $1",
                MIGRATION_0117,
            )

            assert {
                "commerce_member_credit_receipt_workspace_idx",
                "commerce_member_credit_receipt_membership_idx",
            }.issubset(indexes)
            assert delete_rules == {
                ("workspaces", "CASCADE"),
                ("analytics_audit_events", "RESTRICT"),
            }
            assert migration_count == 1

            await conn.execute("DELETE FROM workspace_memberships WHERE id = $1", membership_id)
            assert (
                await conn.fetchval(
                    "SELECT COUNT(*) FROM commerce_workspace_member_credit_command_receipts WHERE id = $1",
                    receipt_id,
                )
                == 1
            )
            assert await conn.fetchval("SELECT COUNT(*) FROM analytics_audit_events WHERE id = $1", audit_event_id) == 1

            await conn.execute("DELETE FROM workspaces WHERE id = $1", workspace_id)
            assert (
                await conn.fetchval(
                    "SELECT COUNT(*) FROM commerce_workspace_member_credit_command_receipts WHERE id = $1",
                    receipt_id,
                )
                == 0
            )

            await conn.execute("DELETE FROM workspaces WHERE id = $1", other_workspace_id)
            assert (
                await conn.fetchval(
                    "SELECT COUNT(*) FROM commerce_workspace_member_credit_command_receipts WHERE workspace_id = $1",
                    other_workspace_id,
                )
                == 0
            )
        finally:
            await conn.close()
    finally:
        await _drop_database(database, admin_database)
