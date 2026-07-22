from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path
from uuid import UUID, uuid4

import asyncpg
import pytest

from src.config import get_settings

API_ROOT = Path(__file__).resolve().parents[2]
MIGRATION_0012 = "0012_auto_20260715_2043"
MIGRATION_0014 = "0014_auto_20260717_0427"
MIGRATION_0015 = "0015_auto_20260717_1019"
MIGRATION_0016 = "0016_auto_20260717_1019"
MIGRATION_0040 = "0040_auto_20260720_2029"
MIGRATION_0041 = "0041_auto_20260720_2110"
MIGRATION_0042 = "0042_auto_20260720_2152"
MIGRATION_0043 = "0043_auto_20260720_2214"
MIGRATION_0044 = "0044_auto_20260720_2323"
MIGRATION_0045 = "0045_auto_20260721_0009"
MIGRATION_0047 = "0047_auto_20260721_0158"
MIGRATION_0050 = "0050_auto_20260721_1018"


def _connection_kwargs(*, database: str) -> dict[str, object]:
    settings = get_settings().database
    return {
        "host": settings.host,
        "port": settings.port,
        "user": settings.user,
        "password": settings.password.get_secret_value(),
        "database": database,
    }


async def _create_database(database: str, admin_database: str) -> None:
    conn = await asyncpg.connect(**_connection_kwargs(database=admin_database))
    try:
        safe_database = database.replace('"', '""')
        await conn.execute(f'CREATE DATABASE "{safe_database}"')
    finally:
        await conn.close()


async def _drop_database(database: str, admin_database: str) -> None:
    conn = await asyncpg.connect(**_connection_kwargs(database=admin_database))
    try:
        await conn.execute(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
            database,
        )
        safe_database = database.replace('"', '""')
        await conn.execute(f'DROP DATABASE "{safe_database}"')
    finally:
        await conn.close()


async def _run_upgrade(database: str, migration: str) -> None:
    env = os.environ.copy()
    env.update({
        "APP_ENV": "test",
        "DATABASE__ENABLED": "1",
        "DATABASE__CORE_MODELS": '["src.models"]',
        "TESTING__DATABASE_NAME": database,
    })
    process = await asyncio.create_subprocess_exec(
        sys.executable,
        "-m",
        "tortoise",
        "-c",
        "src.core.database.orm.TORTOISE_ORM",
        "upgrade",
        "models",
        migration,
        cwd=API_ROOT,
        env=env,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await process.communicate()
    if process.returncode != 0:
        raise AssertionError(
            f"migration {migration} failed with exit {process.returncode}\n"
            f"stdout:\n{stdout.decode()}\nstderr:\n{stderr.decode()}"
        )


async def _insert_legacy_sessions(database: str, session_ids: tuple[UUID, UUID]) -> None:
    conn = await asyncpg.connect(**_connection_kwargs(database=database))
    try:
        for session_id, status in zip(session_ids, ("completed", "uploading"), strict=True):
            await conn.execute(
                """
                INSERT INTO upload_sessions (
                    id, created_at, updated_at, actor_user_id, purpose, filename,
                    size_bytes, chunk_size, total_parts, status, expires_at,
                    visibility, indexable, storage_provider
                ) VALUES (
                    $1, clock_timestamp(), clock_timestamp(), $2, 'library',
                    'legacy.png', 8, 8, 1, $3, clock_timestamp() + interval '1 hour',
                    'public', false, 'local'
                )
                """,
                session_id,
                uuid4(),
                status,
            )
    finally:
        await conn.close()


async def _insert_legacy_storage_profile(database: str, profile_id: UUID) -> None:
    conn = await asyncpg.connect(**_connection_kwargs(database=database))
    try:
        await conn.execute(
            """
            INSERT INTO storage_profiles (
                id, created_at, updated_at, profile_key, scope_type, scope_id,
                provider, display_name, config, secret_ref, is_active, is_default
            ) VALUES (
                $1, clock_timestamp(), clock_timestamp(), 'legacy-profile',
                'system', '00000000-0000-0000-0000-000000000000', 'local',
                'Legacy profile',
                '{"local_root_dir":"/legacy/storage","marker":"keep"}'::jsonb,
                '{"secret_name":"legacy-storage"}'::jsonb,
                false, true
            )
            """,
            profile_id,
        )
    finally:
        await conn.close()


@pytest.mark.asyncio
async def test_upload_completion_migration_upgrades_existing_sessions(
    integration_db_settings,
) -> None:
    database = f"arclayer_migration_{uuid4().hex[:20]}"
    admin_database = os.getenv("TEST_DATABASE__ADMIN_DB", "postgres")
    session_ids = (uuid4(), uuid4())
    await _create_database(database, admin_database)
    try:
        await _run_upgrade(database, MIGRATION_0012)
        await _insert_legacy_sessions(database, session_ids)
        await _run_upgrade(database, MIGRATION_0014)

        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            rows = await conn.fetch(
                """
                SELECT id, status, completion_claim_token, completion_generation,
                       completion_heartbeat_at, completion_lease_until,
                       finalized_storage_bucket, storage_checksum_sha256,
                       storage_finalized_at
                FROM upload_sessions
                WHERE id = ANY($1::uuid[])
                ORDER BY status
                """,
                session_ids,
            )
            lease_index = await conn.fetchval(
                """
                SELECT indexdef FROM pg_indexes
                WHERE schemaname = 'public'
                  AND tablename = 'upload_sessions'
                  AND indexdef LIKE '%completion_lease_until%'
                """
            )
        finally:
            await conn.close()

        assert {row["status"] for row in rows} == {"completed", "uploading"}
        assert all(row["completion_generation"] == 0 for row in rows)
        assert all(row["completion_claim_token"] is None for row in rows)
        assert all(row["completion_heartbeat_at"] is None for row in rows)
        assert all(row["completion_lease_until"] is None for row in rows)
        assert all(row["finalized_storage_bucket"] is None for row in rows)
        assert all(row["storage_checksum_sha256"] is None for row in rows)
        assert all(row["storage_finalized_at"] is None for row in rows)
        assert lease_index is not None
    finally:
        await _drop_database(database, admin_database)


@pytest.mark.asyncio
async def test_provider_effect_migration_preserves_legacy_profiles_and_creates_restrictive_ledger(
    integration_db_settings,
) -> None:
    database = f"arclayer_effect_migration_{uuid4().hex[:20]}"
    admin_database = os.getenv("TEST_DATABASE__ADMIN_DB", "postgres")
    profile_id = uuid4()
    await _create_database(database, admin_database)
    try:
        await _run_upgrade(database, MIGRATION_0014)
        await _insert_legacy_storage_profile(database, profile_id)
        await _run_upgrade(database, MIGRATION_0016)

        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            profile = await conn.fetchrow(
                """
                SELECT config_source, tombstoned_at,
                       config = '{"local_root_dir":"/legacy/storage","marker":"keep"}'::jsonb
                         AS config_preserved,
                       secret_ref = '{"secret_name":"legacy-storage"}'::jsonb
                         AS secret_ref_preserved,
                       is_active, is_default
                FROM storage_profiles
                WHERE id = $1
                """,
                profile_id,
            )
            config_source_column = await conn.fetchrow(
                """
                SELECT is_nullable, column_default
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'storage_profiles'
                  AND column_name = 'config_source'
                """
            )
            tables = {
                row["table_name"]
                for row in await conn.fetch(
                    """
                    SELECT table_name
                    FROM information_schema.tables
                    WHERE table_schema = 'public'
                      AND table_name IN ('storage_profile_route_revisions', 'provider_effect_records')
                    """
                )
            }
            effect_fk_delete_actions = [
                row["delete_action"]
                for row in await conn.fetch(
                    """
                    SELECT rc.delete_rule AS delete_action
                    FROM information_schema.referential_constraints rc
                    JOIN information_schema.table_constraints tc
                      ON tc.constraint_catalog = rc.constraint_catalog
                     AND tc.constraint_schema = rc.constraint_schema
                     AND tc.constraint_name = rc.constraint_name
                    WHERE tc.table_schema = 'public'
                      AND tc.table_name = 'provider_effect_records'
                    """
                )
            ]
            route_fk_delete_actions = [
                row["delete_action"]
                for row in await conn.fetch(
                    """
                    SELECT rc.delete_rule AS delete_action
                    FROM information_schema.referential_constraints rc
                    JOIN information_schema.table_constraints tc
                      ON tc.constraint_catalog = rc.constraint_catalog
                     AND tc.constraint_schema = rc.constraint_schema
                     AND tc.constraint_name = rc.constraint_name
                    WHERE tc.table_schema = 'public'
                      AND tc.table_name = 'storage_profile_route_revisions'
                    """
                )
            ]
            composite_unique_constraints = {
                (row["table_name"], tuple(row["columns"]))
                for row in await conn.fetch(
                    """
                    SELECT tc.table_name,
                           array_agg(kcu.column_name ORDER BY kcu.ordinal_position) AS columns
                    FROM information_schema.table_constraints tc
                    JOIN information_schema.key_column_usage kcu
                      ON kcu.constraint_catalog = tc.constraint_catalog
                     AND kcu.constraint_schema = tc.constraint_schema
                     AND kcu.constraint_name = tc.constraint_name
                    WHERE tc.table_schema = 'public'
                      AND tc.constraint_type = 'UNIQUE'
                      AND tc.table_name IN (
                          'storage_profile_route_revisions',
                          'provider_effect_records'
                      )
                    GROUP BY tc.table_name, tc.constraint_name
                    HAVING COUNT(*) > 1
                    """
                )
            }
            index_rows = await conn.fetch(
                """
                SELECT tablename, indexdef
                FROM pg_indexes
                WHERE schemaname = 'public'
                  AND tablename IN ('storage_profiles', 'provider_effect_records')
                """
            )
            applied_effect_migrations = {
                row["name"]
                for row in await conn.fetch(
                    """
                    SELECT name
                    FROM tortoise_migrations
                    WHERE app = 'models'
                      AND name = ANY($1::text[])
                    """,
                    [MIGRATION_0015, MIGRATION_0016],
                )
            }
        finally:
            await conn.close()

        assert profile is not None
        assert profile["config_source"] == "database"
        assert profile["tombstoned_at"] is None
        assert profile["config_preserved"] is True
        assert profile["secret_ref_preserved"] is True
        assert profile["is_active"] is False
        assert profile["is_default"] is True
        assert config_source_column is not None
        assert config_source_column["is_nullable"] == "NO"
        assert "database" in config_source_column["column_default"]
        assert tables == {"storage_profile_route_revisions", "provider_effect_records"}
        assert applied_effect_migrations == {MIGRATION_0015, MIGRATION_0016}
        assert len(effect_fk_delete_actions) == 5
        assert set(effect_fk_delete_actions) == {"RESTRICT"}
        assert len(route_fk_delete_actions) == 1
        assert set(route_fk_delete_actions) == {"RESTRICT"}
        assert composite_unique_constraints == {
            ("storage_profile_route_revisions", ("profile_id", "revision_number")),
            ("storage_profile_route_revisions", ("profile_id", "route_hash")),
            ("provider_effect_records", ("owner_attempt_id", "effect_type", "effect_key")),
        }
        provider_index_definitions = {
            row["indexdef"] for row in index_rows if row["tablename"] == "provider_effect_records"
        }
        storage_profile_index_definitions = {
            row["indexdef"] for row in index_rows if row["tablename"] == "storage_profiles"
        }
        assert any("(job_id, disposition, registered_at)" in value for value in provider_index_definitions)
        assert any("(profile_id, disposition, registered_at)" in value for value in provider_index_definitions)
        assert any("(tombstoned_at)" in value for value in storage_profile_index_definitions)
    finally:
        await _drop_database(database, admin_database)


@pytest.mark.asyncio
async def test_workspace_skill_package_archive_migration_upgrades_clean_chain(
    integration_db_settings,
) -> None:
    database = f"arclayer_skill_archive_migration_{uuid4().hex[:16]}"
    admin_database = os.getenv("TEST_DATABASE__ADMIN_DB", "postgres")
    await _create_database(database, admin_database)
    try:
        await _run_upgrade(database, MIGRATION_0040)
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            package_columns = {
                row["column_name"]
                for row in await conn.fetch(
                    """
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'skill_packages'
                      AND column_name IN (
                          'archived_at',
                          'archived_by_user_id'
                      )
                    """
                )
            }
            archive_table = await conn.fetchval(
                """
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'public'
                  AND table_name = 'skill_package_archives'
                """
            )
            archive_unique_index = await conn.fetchval(
                """
                SELECT indexdef
                FROM pg_indexes
                WHERE schemaname = 'public'
                  AND tablename = 'skill_package_archives'
                  AND indexdef LIKE '%workspace_id%request_idempotency_key%'
                """
            )
        finally:
            await conn.close()

        assert package_columns == {"archived_at", "archived_by_user_id"}
        assert archive_table == "skill_package_archives"
        assert archive_unique_index is not None
    finally:
        await _drop_database(database, admin_database)


@pytest.mark.asyncio
async def test_project_design_system_authority_and_agent_context_migrations_upgrade_clean_chain(
    integration_db_settings,
) -> None:
    database = f"arclayer_design_system_migration_{uuid4().hex[:16]}"
    admin_database = os.getenv("TEST_DATABASE__ADMIN_DB", "postgres")
    await _create_database(database, admin_database)
    try:
        await _run_upgrade(database, MIGRATION_0043)
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            tables = {
                row["table_name"]
                for row in await conn.fetch(
                    """
                    SELECT table_name
                    FROM information_schema.tables
                    WHERE table_schema = 'public'
                      AND table_name = ANY($1::text[])
                    """,
                    [
                        "design_systems",
                        "design_system_versions",
                        "design_system_validation_results",
                        "workspace_design_system_defaults",
                        "workspace_design_system_default_commands",
                        "project_design_system_assignments",
                        "project_design_system_commands",
                        "ai_run_design_system_snapshots",
                    ],
                )
            }
            unique_indexes = {
                row["tablename"]: row["indexdef"]
                for row in await conn.fetch(
                    """
                    SELECT tablename, indexdef
                    FROM pg_indexes
                    WHERE schemaname = 'public'
                      AND (
                        (tablename = 'design_system_versions'
                         AND indexdef LIKE '%design_system_id%request_idempotency_key%')
                        OR
                        (tablename = 'workspace_design_system_default_commands'
                         AND indexdef LIKE '%workspace_id%request_idempotency_key%')
                        OR
                        (tablename = 'project_design_system_commands'
                         AND indexdef LIKE '%project_id%request_idempotency_key%')
                      )
                    """
                )
            }
            snapshot_unique_constraints = {
                tuple(row["columns"])
                for row in await conn.fetch(
                    """
                    SELECT array_agg(kcu.column_name ORDER BY kcu.ordinal_position) AS columns
                    FROM information_schema.table_constraints tc
                    JOIN information_schema.key_column_usage kcu
                      ON kcu.constraint_catalog = tc.constraint_catalog
                     AND kcu.constraint_schema = tc.constraint_schema
                     AND kcu.constraint_name = tc.constraint_name
                    WHERE tc.table_schema = 'public'
                      AND tc.table_name = 'ai_run_design_system_snapshots'
                      AND tc.constraint_type = 'UNIQUE'
                    GROUP BY tc.constraint_name
                    """
                )
            }
            snapshot_index_definitions = {
                row["indexdef"]
                for row in await conn.fetch(
                    """
                    SELECT indexdef
                    FROM pg_indexes
                    WHERE schemaname = 'public'
                      AND tablename = 'ai_run_design_system_snapshots'
                    """
                )
            }
        finally:
            await conn.close()

        assert tables == {
            "design_systems",
            "design_system_versions",
            "design_system_validation_results",
            "workspace_design_system_defaults",
            "workspace_design_system_default_commands",
            "project_design_system_assignments",
            "project_design_system_commands",
            "ai_run_design_system_snapshots",
        }
        assert set(unique_indexes) == {
            "design_system_versions",
            "workspace_design_system_default_commands",
            "project_design_system_commands",
        }
        assert ("run_id",) in snapshot_unique_constraints
        assert any("(context_hash)" in value for value in snapshot_index_definitions)
        assert any("(design_system_version_id)" in value for value in snapshot_index_definitions)
        assert any("(design_system_version_id, created_at)" in value for value in snapshot_index_definitions)
    finally:
        await _drop_database(database, admin_database)


@pytest.mark.asyncio
async def test_site_builder_change_set_migrations_upgrade_clean_chain(
    integration_db_settings,
) -> None:
    database = f"arclayer_builder_migration_{uuid4().hex[:16]}"
    admin_database = os.getenv("TEST_DATABASE__ADMIN_DB", "postgres")
    await _create_database(database, admin_database)
    try:
        await _run_upgrade(database, MIGRATION_0047)
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            project_columns = {
                row["column_name"]: (row["is_nullable"], row["column_default"])
                for row in await conn.fetch(
                    """
                    SELECT column_name, is_nullable, column_default
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'projects'
                      AND column_name = ANY($1::text[])
                    """,
                    [
                        "authoring_mode",
                        "authoring_state",
                        "authoring_revision",
                        "authoring_resolved_by_user_id",
                        "authoring_resolved_at",
                    ],
                )
            }
            tables = {
                row["table_name"]
                for row in await conn.fetch(
                    """
                    SELECT table_name
                    FROM information_schema.tables
                    WHERE table_schema = 'public'
                      AND table_name = ANY($1::text[])
                    """,
                    [
                        "content_structure_revisions",
                        "site_revision_manifests",
                        "site_revision_statuses",
                        "builder_initialization_commands",
                        "builder_change_sets",
                        "builder_change_set_commands",
                        "builder_change_set_approvals",
                        "ai_run_builder_snapshots",
                        "builder_generations",
                    ],
                )
            }
            unique_constraints = {
                (row["table_name"], tuple(row["columns"]))
                for row in await conn.fetch(
                    """
                    SELECT tc.table_name,
                           array_agg(kcu.column_name ORDER BY kcu.ordinal_position) AS columns
                    FROM information_schema.table_constraints tc
                    JOIN information_schema.key_column_usage kcu
                      ON kcu.constraint_catalog = tc.constraint_catalog
                     AND kcu.constraint_schema = tc.constraint_schema
                     AND kcu.constraint_name = tc.constraint_name
                    WHERE tc.table_schema = 'public'
                      AND tc.constraint_type = 'UNIQUE'
                      AND tc.table_name = ANY($1::text[])
                    GROUP BY tc.table_name, tc.constraint_name
                    """,
                    [
                        "content_structure_revisions",
                        "site_revision_manifests",
                        "site_revision_statuses",
                        "builder_initialization_commands",
                        "builder_change_sets",
                        "builder_change_set_commands",
                        "builder_change_set_approvals",
                        "ai_run_builder_snapshots",
                        "builder_generations",
                    ],
                )
            }
            index_definitions = {
                (row["tablename"], row["indexdef"])
                for row in await conn.fetch(
                    """
                    SELECT tablename, indexdef
                    FROM pg_indexes
                    WHERE schemaname = 'public'
                      AND tablename = ANY($1::text[])
                    """,
                    [
                        "content_structure_revisions",
                        "site_revision_manifests",
                        "site_revision_statuses",
                        "builder_initialization_commands",
                        "builder_change_sets",
                        "builder_change_set_commands",
                        "builder_change_set_approvals",
                        "ai_run_builder_snapshots",
                        "builder_generations",
                    ],
                )
            }
        finally:
            await conn.close()

        assert project_columns["authoring_mode"] == ("YES", None)
        assert project_columns["authoring_resolved_by_user_id"] == ("YES", None)
        assert project_columns["authoring_resolved_at"] == ("YES", None)
        assert project_columns["authoring_state"][0] == "NO"
        assert "migration_required" in str(project_columns["authoring_state"][1])
        assert project_columns["authoring_revision"][0] == "NO"
        assert str(project_columns["authoring_revision"][1]).endswith("1")
        assert tables == {
            "content_structure_revisions",
            "site_revision_manifests",
            "site_revision_statuses",
            "builder_initialization_commands",
            "builder_change_sets",
            "builder_change_set_commands",
            "builder_change_set_approvals",
            "ai_run_builder_snapshots",
            "builder_generations",
        }
        assert (
            "content_structure_revisions",
            ("project_id", "site_id", "environment_id", "revision_number"),
        ) in unique_constraints
        assert (
            "site_revision_manifests",
            ("project_id", "site_id", "environment_id", "revision_number"),
        ) in unique_constraints
        assert ("site_revision_statuses", ("site_revision_id",)) in unique_constraints
        assert (
            "builder_initialization_commands",
            ("project_id", "request_idempotency_key"),
        ) in unique_constraints
        assert (
            "builder_change_set_commands",
            ("project_id", "command_kind", "request_idempotency_key"),
        ) in unique_constraints
        assert ("builder_change_sets", ("preview_token_hash",)) in unique_constraints
        assert ("builder_change_set_approvals", ("change_set_id",)) in unique_constraints
        assert ("ai_run_builder_snapshots", ("run_id",)) in unique_constraints
        assert ("builder_generations", ("job_id",)) in unique_constraints
        assert any(
            table == "site_revision_manifests" and "(manifest_hash)" in definition
            for table, definition in index_definitions
        )
        assert any(
            table == "site_revision_statuses" and "(etag)" in definition for table, definition in index_definitions
        )
        assert any(
            table == "content_structure_revisions" and "(project_id, site_id, environment_id, created_at)" in definition
            for table, definition in index_definitions
        )
        assert any(
            table == "site_revision_manifests" and "(design_system_version_id, created_at)" in definition
            for table, definition in index_definitions
        )
        assert any(
            table == "builder_change_sets" and "(project_id, site_id, environment_id, created_at)" in definition
            for table, definition in index_definitions
        )
        assert any(
            table == "builder_change_set_approvals" and "(project_id, status, expires_at)" in definition
            for table, definition in index_definitions
        )
        assert any(
            table == "ai_run_builder_snapshots" and "(project_id, site_revision_id, created_at)" in definition
            for table, definition in index_definitions
        )
        assert any(
            table == "builder_generations" and "(base_site_revision_id, status, created_at)" in definition
            for table, definition in index_definitions
        )
    finally:
        await _drop_database(database, admin_database)


@pytest.mark.asyncio
async def test_design_system_concept_generation_migration_upgrades_clean_chain(
    integration_db_settings,
) -> None:
    database = f"arclayer_design_concepts_migration_{uuid4().hex[:16]}"
    admin_database = os.getenv("TEST_DATABASE__ADMIN_DB", "postgres")
    await _create_database(database, admin_database)
    try:
        await _run_upgrade(database, MIGRATION_0050)
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            columns = {
                row["column_name"]
                for row in await conn.fetch(
                    """
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'design_system_concept_generations'
                    """
                )
            }
            unique_constraints = {
                tuple(row["columns"])
                for row in await conn.fetch(
                    """
                    SELECT array_agg(kcu.column_name ORDER BY kcu.ordinal_position) AS columns
                    FROM information_schema.table_constraints tc
                    JOIN information_schema.key_column_usage kcu
                      ON kcu.constraint_catalog = tc.constraint_catalog
                     AND kcu.constraint_schema = tc.constraint_schema
                     AND kcu.constraint_name = tc.constraint_name
                    WHERE tc.table_schema = 'public'
                      AND tc.table_name = 'design_system_concept_generations'
                      AND tc.constraint_type = 'UNIQUE'
                    GROUP BY tc.constraint_name
                    """
                )
            }
            indexes = {
                row["indexdef"]
                for row in await conn.fetch(
                    """
                    SELECT indexdef
                    FROM pg_indexes
                    WHERE schemaname = 'public'
                      AND tablename = 'design_system_concept_generations'
                    """
                )
            }
        finally:
            await conn.close()

        assert {
            "workspace_id",
            "project_id",
            "design_system_id",
            "base_version_id",
            "base_manifest_checksum",
            "base_site_revision_id",
            "base_etag",
            "job_id",
            "agent_run_id",
            "status",
            "candidates",
            "failures",
        } <= columns
        assert ("job_id",) in unique_constraints
        assert any("(project_id, design_system_id, created_at)" in definition for definition in indexes)
        assert any("(base_version_id, status, created_at)" in definition for definition in indexes)
    finally:
        await _drop_database(database, admin_database)
