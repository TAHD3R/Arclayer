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

MIGRATION_0089 = "0089_commerce_catalog_command_persistence"
MIGRATION_0090 = "0090_hosting_continuity_lifecycle"
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
        CREATE TABLE projects (
            id UUID PRIMARY KEY,
            workspace_id UUID NOT NULL REFERENCES workspaces(id),
            is_active BOOLEAN NOT NULL
        );
        CREATE TABLE project_runtimes (
            id UUID PRIMARY KEY,
            project_id UUID NOT NULL REFERENCES projects(id),
            is_active BOOLEAN NOT NULL
        );
        CREATE TABLE sites (
            id UUID PRIMARY KEY,
            workspace_id UUID NOT NULL REFERENCES workspaces(id),
            project_id UUID REFERENCES projects(id),
            runtime_id UUID REFERENCES project_runtimes(id),
            is_active BOOLEAN NOT NULL
        );
        CREATE TABLE content_releases (
            id UUID PRIMARY KEY,
            workspace_id UUID NOT NULL REFERENCES workspaces(id),
            site_id UUID NOT NULL REFERENCES sites(id)
        );
        CREATE TABLE project_environments (
            id UUID PRIMARY KEY,
            project_id UUID NOT NULL REFERENCES projects(id),
            key VARCHAR(16) NOT NULL
        );
        CREATE TABLE project_deployments (
            id UUID PRIMARY KEY,
            created_at TIMESTAMPTZ NOT NULL,
            project_id UUID NOT NULL REFERENCES projects(id),
            runtime_id UUID NOT NULL REFERENCES project_runtimes(id),
            environment_id UUID NOT NULL REFERENCES project_environments(id),
            source_type VARCHAR(32) NOT NULL,
            source_ref VARCHAR(255) NOT NULL,
            is_active BOOLEAN NOT NULL
        );
        CREATE TABLE hosting_commercial_access_projections (
            id UUID PRIMARY KEY,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            workspace_id UUID NOT NULL UNIQUE REFERENCES workspaces(id),
            state VARCHAR(32) NOT NULL DEFAULT 'serving',
            preserved_release_id UUID,
            source_identity VARCHAR(255) NOT NULL UNIQUE,
            CONSTRAINT hosting_commercial_access_projections_state_check
                CHECK (state IN ('serving', 'continuity_required', 'suspended', 'restoration_required', 'restored'))
        );
        CREATE TABLE hosting_commercial_access_receipts (
            id UUID PRIMARY KEY,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            source_identity VARCHAR(255) NOT NULL UNIQUE,
            workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            resulting_state VARCHAR(32) NOT NULL,
            CONSTRAINT hosting_commercial_access_receipts_state_check
                CHECK (resulting_state IN ('serving', 'continuity_required', 'suspended', 'restoration_required', 'restored'))
        );
        """
    )
    migration_names = sorted(
        path.stem
        for path in MIGRATIONS_DIR.glob("[0-9][0-9][0-9][0-9]_*.py")
        if path.stem <= MIGRATION_0089
    )
    await conn.executemany(
        "INSERT INTO tortoise_migrations (app, name, applied_at) VALUES ('models', $1, NOW())",
        [(name,) for name in migration_names],
    )


async def _insert_mappable_legacy_projection(
    conn: asyncpg.Connection,
    *,
    projection_id: UUID,
    workspace_id: UUID,
    site_id: UUID,
    runtime_id: UUID,
    release_id: UUID,
    state: str = "serving",
) -> None:
    project_id = uuid4()
    environment_id = uuid4()
    await conn.execute("INSERT INTO workspaces (id) VALUES ($1)", workspace_id)
    await conn.execute("INSERT INTO projects (id, workspace_id, is_active) VALUES ($1, $2, TRUE)", project_id, workspace_id)
    await conn.execute(
        "INSERT INTO project_runtimes (id, project_id, is_active) VALUES ($1, $2, TRUE)", runtime_id, project_id
    )
    await conn.execute(
        """
        INSERT INTO sites (id, workspace_id, project_id, runtime_id, is_active)
        VALUES ($1, $2, $3, $4, TRUE)
        """,
        site_id,
        workspace_id,
        project_id,
        runtime_id,
    )
    await conn.execute(
        "INSERT INTO content_releases (id, workspace_id, site_id) VALUES ($1, $2, $3)",
        release_id,
        workspace_id,
        site_id,
    )
    await conn.execute(
        "INSERT INTO project_environments (id, project_id, key) VALUES ($1, $2, 'production')",
        environment_id,
        project_id,
    )
    await conn.execute(
        """
        INSERT INTO project_deployments (
            id, created_at, project_id, runtime_id, environment_id, source_type, source_ref, is_active
        ) VALUES ($1, NOW(), $2, $3, $4, 'cms_runtime', $5, TRUE)
        """,
        uuid4(),
        project_id,
        runtime_id,
        environment_id,
        str(release_id),
    )
    await conn.execute(
        """
        INSERT INTO hosting_commercial_access_projections (
            id, created_at, updated_at, workspace_id, state, preserved_release_id, source_identity
        ) VALUES ($1, '2026-08-01T00:00:00Z', '2026-08-01T01:00:00Z', $2, $3, $4, $5)
        """,
        projection_id,
        workspace_id,
        state,
        release_id,
        f"legacy-hosting:{projection_id}",
    )


@pytest.mark.asyncio
async def test_hosting_continuity_migration_preserves_mappable_legacy_release_in_deterministic_target(
    integration_db_settings,
) -> None:
    database = f"arclayer_hosting_continuity_{uuid4().hex[:16]}"
    admin_database = os.getenv("TEST_DATABASE__ADMIN_DB", "postgres")
    projection_id, workspace_id, site_id, runtime_id, release_id = (uuid4() for _ in range(5))
    await _create_database(database, admin_database)
    try:
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            await _prepare_predecessor_schema(conn)
            await _insert_mappable_legacy_projection(
                conn,
                projection_id=projection_id,
                workspace_id=workspace_id,
                site_id=site_id,
                runtime_id=runtime_id,
                release_id=release_id,
            )
        finally:
            await conn.close()

        await _run_upgrade(database, MIGRATION_0090)

        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            target = await conn.fetchrow(
                """
                SELECT
                    id = md5(
                        'arclayer:hosting-continuity-target:'
                        || $1::uuid::text
                        || ':' || $2::uuid::text
                        || ':' || $3::uuid::text
                    )::uuid
                        AS deterministic_id,
                    created_at,
                    updated_at,
                    projection_id,
                    site_id,
                    runtime_id,
                    preserved_release_id,
                    gate,
                    restoration_state,
                    verification_evidence,
                    verified_at
                FROM hosting_continuity_targets
                WHERE projection_id = $1::uuid
                """,
                projection_id,
                site_id,
                runtime_id,
            )
            preserved_release_column = await conn.fetchval(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'hosting_commercial_access_projections'
                      AND column_name = 'preserved_release_id'
                )
                """
            )
        finally:
            await conn.close()

        assert target is not None
        assert target["deterministic_id"] is True
        assert target["projection_id"] == projection_id
        assert target["site_id"] == site_id
        assert target["runtime_id"] == runtime_id
        assert target["preserved_release_id"] == release_id
        assert target["gate"] == "serving"
        assert target["restoration_state"] == "not_required"
        assert target["verification_evidence"] is None
        assert target["verified_at"] is None
        assert target["created_at"].isoformat() == "2026-08-01T00:00:00+00:00"
        assert target["updated_at"].isoformat() == "2026-08-01T01:00:00+00:00"
        assert preserved_release_column is False
    finally:
        await _drop_database(database, admin_database)


@pytest.mark.asyncio
async def test_hosting_continuity_migration_extends_receipt_state_constraint_to_partial(
    integration_db_settings,
) -> None:
    database = f"arclayer_hosting_continuity_receipts_{uuid4().hex[:16]}"
    admin_database = os.getenv("TEST_DATABASE__ADMIN_DB", "postgres")
    workspace_id = uuid4()
    await _create_database(database, admin_database)
    try:
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            await _prepare_predecessor_schema(conn)
            await conn.execute("INSERT INTO workspaces (id) VALUES ($1)", workspace_id)
        finally:
            await conn.close()

        await _run_upgrade(database, MIGRATION_0090)

        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            partial_receipt_id = uuid4()
            await conn.execute(
                """
                INSERT INTO hosting_commercial_access_receipts (
                    id, created_at, updated_at, source_identity, workspace_id, resulting_state
                ) VALUES ($1, NOW(), NOW(), $2, $3, 'partial')
                """,
                partial_receipt_id,
                "hosting:partial",
                workspace_id,
            )
            resulting_state = await conn.fetchval(
                "SELECT resulting_state FROM hosting_commercial_access_receipts WHERE id = $1", partial_receipt_id
            )
            with pytest.raises(asyncpg.CheckViolationError):
                await conn.execute(
                    """
                    INSERT INTO hosting_commercial_access_receipts (
                        id, created_at, updated_at, source_identity, workspace_id, resulting_state
                    ) VALUES ($1, NOW(), NOW(), $2, $3, 'invalid')
                    """,
                    uuid4(),
                    "hosting:invalid",
                    workspace_id,
                )
        finally:
            await conn.close()

        assert resulting_state == "partial"
    finally:
        await _drop_database(database, admin_database)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("state", "create_release", "expected_error"),
    [
        ("serving", False, "legacy preserved release lacks one current delivery target"),
        ("continuity_required", True, "legacy non-serving projection lacks target-level lifecycle evidence"),
    ],
)
async def test_hosting_continuity_migration_rejects_legacy_states_without_complete_target_evidence(
    integration_db_settings,
    state: str,
    create_release: bool,
    expected_error: str,
) -> None:
    database = f"arclayer_hosting_continuity_invalid_{uuid4().hex[:12]}"
    admin_database = os.getenv("TEST_DATABASE__ADMIN_DB", "postgres")
    projection_id, workspace_id, site_id, runtime_id, release_id = (uuid4() for _ in range(5))
    await _create_database(database, admin_database)
    try:
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            await _prepare_predecessor_schema(conn)
            if create_release:
                await _insert_mappable_legacy_projection(
                    conn,
                    projection_id=projection_id,
                    workspace_id=workspace_id,
                    site_id=site_id,
                    runtime_id=runtime_id,
                    release_id=release_id,
                    state=state,
                )
            else:
                await conn.execute("INSERT INTO workspaces (id) VALUES ($1)", workspace_id)
                await conn.execute(
                    """
                    INSERT INTO hosting_commercial_access_projections (
                        id, created_at, updated_at, workspace_id, state, preserved_release_id, source_identity
                    ) VALUES ($1, NOW(), NOW(), $2, $3, $4, $5)
                    """,
                    projection_id,
                    workspace_id,
                    state,
                    release_id,
                    f"legacy-hosting:{projection_id}",
                )
        finally:
            await conn.close()

        with pytest.raises(AssertionError, match=expected_error):
            await _run_upgrade(database, MIGRATION_0090)

        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            preserved_release_column = await conn.fetchval(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'hosting_commercial_access_projections'
                      AND column_name = 'preserved_release_id'
                )
                """
            )
            target_table = await conn.fetchval(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM information_schema.tables
                    WHERE table_schema = 'public'
                      AND table_name = 'hosting_continuity_targets'
                )
                """
            )
            policy_table = await conn.fetchval(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM information_schema.tables
                    WHERE table_schema = 'public'
                      AND table_name = 'hosting_continuity_policies'
                )
                """
            )
        finally:
            await conn.close()

        assert preserved_release_column is True
        assert target_table is False
        assert policy_table is False
    finally:
        await _drop_database(database, admin_database)
