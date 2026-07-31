from __future__ import annotations

from pathlib import Path

import asyncpg

MIGRATION_0077 = "0077_workspace_owner_authority_hard_cut"
MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "src" / "migrations"


def _migration_names_through_0077() -> list[str]:
    return sorted(
        path.stem
        for path in MIGRATIONS_DIR.glob("[0-9][0-9][0-9][0-9]_*.py")
        if path.stem <= MIGRATION_0077
    )


async def prepare_platform_identity_legacy_schema(conn: asyncpg.Connection) -> None:
    """Build only the 0078 predecessor schema needed by its hard-cut operations."""

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
        """
    )
    await conn.executemany(
        """
        INSERT INTO tortoise_migrations (app, name, applied_at)
        VALUES ('models', $1, NOW())
        """,
        [(name,) for name in _migration_names_through_0077()],
    )
