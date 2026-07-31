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

MIGRATION_0086 = "0086_platform_saved_views"
MIGRATION_0085 = "0085_operational_signal_triage"
MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "src" / "migrations"
SAVED_VIEW_COLUMNS = {
    "id",
    "created_at",
    "updated_at",
    "actor_user_id",
    "capability_id",
    "name",
    "filter_schema_revision",
    "column_schema_revision",
    "filters",
    "ordering",
    "visible_columns",
    "column_order",
    "density",
    "revision",
}


def _migration_names_through_0085() -> list[str]:
    return sorted(
        path.stem
        for path in MIGRATIONS_DIR.glob("[0-9][0-9][0-9][0-9]_*.py")
        if path.stem <= MIGRATION_0085
    )


async def _prepare_saved_views_predecessor_schema(conn: asyncpg.Connection) -> None:
    await conn.execute(
        """
        CREATE TABLE tortoise_migrations (
            id SERIAL PRIMARY KEY,
            app VARCHAR(255) NOT NULL,
            name VARCHAR(255) NOT NULL,
            applied_at TIMESTAMPTZ NOT NULL,
            UNIQUE (app, name)
        )
        """
    )
    await conn.executemany(
        """
        INSERT INTO tortoise_migrations (app, name, applied_at)
        VALUES ('models', $1, NOW())
        """,
        [(name,) for name in _migration_names_through_0085()],
    )


@pytest.mark.asyncio
async def test_platform_saved_views_migration_creates_revisioned_private_projection(integration_db_settings) -> None:
    database = f"arclayer_platform_saved_views_{uuid4().hex[:16]}"
    admin_database = os.getenv("TEST_DATABASE__ADMIN_DB", "postgres")
    await _create_database(database, admin_database)
    try:
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            await _prepare_saved_views_predecessor_schema(conn)
        finally:
            await conn.close()

        await _run_upgrade(database, MIGRATION_0086)
        await _run_upgrade(database, MIGRATION_0086)
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            columns = {
                row["column_name"]
                for row in await conn.fetch(
                    """
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'platform_saved_views'
                    """
                )
            }
            constraints = {
                row["conname"]
                for row in await conn.fetch(
                    """
                    SELECT conname FROM pg_constraint
                    WHERE conrelid = 'platform_saved_views'::regclass
                    """
                )
            }
            indexes = {
                row["indexname"]
                for row in await conn.fetch(
                    """
                    SELECT indexname FROM pg_indexes
                    WHERE schemaname = 'public' AND tablename = 'platform_saved_views'
                    """
                )
            }
            migration_count = await conn.fetchval(
                "SELECT COUNT(*) FROM tortoise_migrations WHERE app = 'models' AND name = $1",
                MIGRATION_0086,
            )
        finally:
            await conn.close()

        assert columns == SAVED_VIEW_COLUMNS
        assert "platform_saved_views_actor_capability_name" in constraints
        assert "platform_saved_views_actor_capability_idx" in indexes
        assert migration_count == 1
    finally:
        await _drop_database(database, admin_database)
