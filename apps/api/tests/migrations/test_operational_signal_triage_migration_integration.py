from __future__ import annotations

import os
from uuid import uuid4

import asyncpg
import pytest

from tests.migrations.test_upload_completion_migration_integration import (
    _connection_kwargs,
    _create_database,
    _drop_database,
    _run_upgrade,
)

MIGRATION_0085 = "0085_operational_signal_triage"
OPERATIONAL_SIGNAL_PERMISSIONS = {
    "platform:operations-signals:read",
    "platform:operations-signals:claim",
    "platform:operations-signals:assign",
    "platform:operations-signals:triage",
}


@pytest.mark.asyncio
async def test_operational_signal_migration_seeds_current_role_and_constraints(integration_db_settings) -> None:
    database = f"arclayer_operational_signals_{uuid4().hex[:16]}"
    admin_database = os.getenv("TEST_DATABASE__ADMIN_DB", "postgres")
    await _create_database(database, admin_database)
    try:
        await _run_upgrade(database, MIGRATION_0085)
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            permissions = await conn.fetch(
                """
                SELECT code, owner_domain, id = md5('arclayer:platform-permission:' || code)::uuid AS stable_id
                FROM platform_permissions
                WHERE code = ANY($1::text[])
                """,
                list(OPERATIONAL_SIGNAL_PERMISSIONS),
            )
            role_permissions = set(
                await conn.fetchval(
                    """
                    SELECT array_agg(permission.code)
                    FROM platform_roles AS role
                    JOIN platform_role_revisions AS revision
                        ON revision.role_id = role.id AND revision.is_current = TRUE
                    JOIN platform_role_revision_permissions AS binding
                        ON binding.role_revision_id = revision.id
                    JOIN platform_permissions AS permission
                        ON permission.id = binding.permission_id
                    WHERE role.code = 'platform-operations-reader'
                    """
                )
            )
            constraints = {
                row["conname"]
                for row in await conn.fetch(
                    """
                    SELECT conname FROM pg_constraint
                    WHERE conname = ANY($1::text[])
                    """,
                    [
                        "operational_signal_triage_signal_source_check",
                        "operational_signal_triage_revision_check",
                        "operational_signal_triage_state_check",
                        "operational_signal_triage_in_progress_assignee_check",
                        "operational_signal_triage_reminder_check",
                        "operational_signal_triage_history_revision_check",
                        "operational_signal_triage_history_action_check",
                    ],
                )
            }
            migration_count = await conn.fetchval(
                "SELECT COUNT(*) FROM tortoise_migrations WHERE app = 'models' AND name = $1",
                MIGRATION_0085,
            )
            history_trigger = await conn.fetchval(
                """
                SELECT EXISTS (
                    SELECT 1 FROM pg_trigger
                    WHERE tgname = 'operational_signal_triage_history_append_only'
                        AND tgenabled = 'O'
                )
                """
            )
        finally:
            await conn.close()

        assert {row["code"] for row in permissions} == OPERATIONAL_SIGNAL_PERMISSIONS
        assert all(row["owner_domain"] == "operations" and row["stable_id"] for row in permissions)
        assert OPERATIONAL_SIGNAL_PERMISSIONS <= role_permissions
        assert constraints == {
            "operational_signal_triage_signal_source_check",
            "operational_signal_triage_revision_check",
            "operational_signal_triage_state_check",
            "operational_signal_triage_in_progress_assignee_check",
            "operational_signal_triage_reminder_check",
            "operational_signal_triage_history_revision_check",
            "operational_signal_triage_history_action_check",
        }
        assert migration_count == 1
        assert history_trigger
    finally:
        await _drop_database(database, admin_database)
