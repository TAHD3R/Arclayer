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

MIGRATION_0123 = "0123_dunning_policy_ordering_evidence"
MIGRATION_0124 = "0124_commercial_access_fact_immutability"
MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "src" / "migrations"
pytestmark = pytest.mark.integration


async def _prepare_predecessor_schema(conn: asyncpg.Connection) -> UUID:
    workspace_id = uuid4()
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
        CREATE TABLE commerce_commercial_access_facts (
            id UUID PRIMARY KEY,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            kind VARCHAR(32) NOT NULL,
            source_identity VARCHAR(255) NOT NULL,
            payload JSONB NOT NULL,
            effective_at TIMESTAMPTZ NOT NULL,
            UNIQUE (kind, source_identity)
        );
        """
    )
    migration_names = sorted(
        path.stem for path in MIGRATIONS_DIR.glob("[0-9][0-9][0-9][0-9]_*.py") if path.stem <= MIGRATION_0123
    )
    await conn.executemany(
        "INSERT INTO tortoise_migrations (app, name, applied_at) VALUES ('models', $1, NOW())",
        [(name,) for name in migration_names],
    )
    await conn.execute("INSERT INTO workspaces (id) VALUES ($1)", workspace_id)
    await conn.executemany(
        """
        INSERT INTO commerce_commercial_access_facts (
            id, created_at, updated_at, workspace_id, kind, source_identity, payload, effective_at
        ) VALUES ($1, NOW(), NOW(), $2, $3, $4, '{}'::jsonb, NOW())
        """,
        [
            (uuid4(), workspace_id, "lifecycle_notification", "provider:simulated:evt_lifecycle"),
            (uuid4(), workspace_id, "hosting_handoff", "provider:simulated:evt_hosting"),
        ],
    )
    return workspace_id


@pytest.mark.asyncio
async def test_commercial_access_facts_reject_updates_without_blocking_workspace_cascade(
    integration_db_settings,
) -> None:
    _ = integration_db_settings
    database = f"arclayer_access_fact_0124_{uuid4().hex[:10]}"
    admin_database = os.getenv("TEST_DATABASE__ADMIN_DB", "postgres")
    await _create_database(database, admin_database)
    try:
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            workspace_id = await _prepare_predecessor_schema(conn)
        finally:
            await conn.close()

        await _run_upgrade(database, MIGRATION_0124)
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            for kind in ("lifecycle_notification", "hosting_handoff"):
                with pytest.raises(asyncpg.RaiseError, match="commercial access fact evidence is immutable"):
                    await conn.execute(
                        "UPDATE commerce_commercial_access_facts SET payload = '{\"changed\": true}'::jsonb WHERE kind = $1",
                        kind,
                    )

            assert (
                await conn.fetchval(
                    "SELECT COUNT(*) FROM tortoise_migrations WHERE app = 'models' AND name = $1",
                    MIGRATION_0124,
                )
                == 1
            )
            await conn.execute("DELETE FROM workspaces WHERE id = $1", workspace_id)
            assert (
                await conn.fetchval(
                    "SELECT COUNT(*) FROM commerce_commercial_access_facts WHERE workspace_id = $1",
                    workspace_id,
                )
                == 0
            )
        finally:
            await conn.close()
    finally:
        await _drop_database(database, admin_database)
