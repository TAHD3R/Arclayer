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

MIGRATION_0103 = "0103_platform_invitation_mfa_activation"
MIGRATION_0105 = "0105_hosting_domain_recovery"
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
        """
    )
    migration_names = sorted(
        path.stem
        for path in MIGRATIONS_DIR.glob("[0-9][0-9][0-9][0-9]_*.py")
        if path.stem <= MIGRATION_0103
    )
    await conn.executemany(
        "INSERT INTO tortoise_migrations (app, name, applied_at) VALUES ('models', $1, NOW())",
        [(name,) for name in migration_names],
    )


async def _insert_running_operation(
    conn: asyncpg.Connection,
    *,
    operation_id: UUID,
    actor_user_id: UUID,
    idempotency_key: str,
) -> None:
    await conn.execute(
        """
        INSERT INTO hosting_delivery_operations (
            id, created_at, updated_at, target_type, target_id, action, actor_user_id,
            idempotency_key, source_revision, before_state, state, verification_state
        ) VALUES (
            $1, NOW(), NOW(), 'hosting_continuity', $2, 'restore', $3,
            $4, NOW(), 'restoration_required', 'running', 'pending'
        )
        """,
        operation_id,
        uuid4(),
        actor_user_id,
        idempotency_key,
    )


@pytest.mark.asyncio
async def test_hosting_domain_recovery_migration_creates_constrained_durable_operation_history(
    integration_db_settings,
) -> None:
    database = f"arclayer_hosting_domain_recovery_{uuid4().hex[:16]}"
    admin_database = os.getenv("TEST_DATABASE__ADMIN_DB", "postgres")
    actor_user_id = uuid4()
    try:
        await _create_database(database, admin_database)
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            await _prepare_predecessor_schema(conn)
        finally:
            await conn.close()

        await _run_upgrade(database, MIGRATION_0105)

        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            columns = {
                row["column_name"]
                for row in await conn.fetch(
                    """
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'hosting_delivery_operations'
                    """
                )
            }
            constraints = {
                row["conname"]
                for row in await conn.fetch(
                    """
                    SELECT conname
                    FROM pg_constraint
                    WHERE conrelid = 'hosting_delivery_operations'::regclass
                    """
                )
            }
            await _insert_running_operation(
                conn,
                operation_id=uuid4(),
                actor_user_id=actor_user_id,
                idempotency_key="hosting-recovery-running",
            )
            with pytest.raises(asyncpg.UniqueViolationError):
                await _insert_running_operation(
                    conn,
                    operation_id=uuid4(),
                    actor_user_id=actor_user_id,
                    idempotency_key="hosting-recovery-running",
                )
            with pytest.raises(asyncpg.CheckViolationError):
                await conn.execute(
                    """
                    INSERT INTO hosting_delivery_operations (
                        id, created_at, updated_at, target_type, target_id, action, actor_user_id,
                        idempotency_key, source_revision, before_state, state, verification_state,
                        resulting_state, completed_at
                    ) VALUES (
                        $1, NOW(), NOW(), 'storage_profile', $2, 'test_readiness', $3,
                        'invalid-terminal-state', NOW(), 'not_tested', 'outcome_unknown', 'pending',
                        'healthy', NOW()
                    )
                    """,
                    uuid4(),
                    uuid4(),
                    uuid4(),
                )
        finally:
            await conn.close()

        assert {
            "target_type",
            "target_id",
            "action",
            "actor_user_id",
            "idempotency_key",
            "source_revision",
            "before_state",
            "resulting_state",
            "state",
            "verification_state",
            "source_operation_identity",
            "result_reference_id",
            "failed_target_count",
            "evidence",
            "failure_code",
            "failure_message",
            "completed_at",
        } <= columns
        assert {
            "hosting_delivery_operations_target_type_check",
            "hosting_delivery_operations_action_check",
            "hosting_delivery_operations_state_check",
            "hosting_delivery_operations_verification_state_check",
            "hosting_delivery_operations_failed_target_count_check",
            "hosting_delivery_operations_terminal_state_check",
            "hosting_delivery_operations_actor_key_unique",
        } <= constraints
    finally:
        await _drop_database(database, admin_database)
