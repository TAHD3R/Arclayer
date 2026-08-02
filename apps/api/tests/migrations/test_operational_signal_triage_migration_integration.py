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

MIGRATION_0098 = "0098_operational_signal_triage_lifecycle"
MIGRATION_0099 = "0099_platform_identity_access_lifecycle"
MIGRATION_0100 = "0100_operational_signal_projection"
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
        await _run_upgrade(database, MIGRATION_0098)
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
                        "operational_signal_triage_note_revision_check",
                        "operational_signal_triage_note_body_check",
                    ],
                )
            }
            migration_count = await conn.fetchval(
                "SELECT COUNT(*) FROM tortoise_migrations WHERE app = 'models' AND name = $1",
                MIGRATION_0098,
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
            note_trigger = await conn.fetchval(
                """
                SELECT EXISTS (
                    SELECT 1 FROM pg_trigger
                    WHERE tgname = 'operational_signal_triage_notes_append_only'
                        AND tgenabled = 'O'
                )
                """
            )
            triage_state_constraint = await conn.fetchval(
                """
                SELECT pg_get_constraintdef(oid)
                FROM pg_constraint
                WHERE conname = 'operational_signal_triage_state_check'
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
            "operational_signal_triage_note_revision_check",
            "operational_signal_triage_note_body_check",
        }
        assert migration_count == 1
        assert history_trigger
        assert note_trigger
        assert "unclaimed" in triage_state_constraint
        assert "waiting" in triage_state_constraint
        assert "source_recovered" in triage_state_constraint
    finally:
        await _drop_database(database, admin_database)


@pytest.mark.asyncio
async def test_operational_signal_projection_migration_backfills_jobs_and_rebinds_triage(
    integration_db_settings,
) -> None:
    database = f"arclayer_operational_signal_projection_{uuid4().hex[:16]}"
    admin_database = os.getenv("TEST_DATABASE__ADMIN_DB", "postgres")
    failed_job_id = uuid4()
    recovered_job_id = uuid4()
    triage_id = uuid4()
    await _create_database(database, admin_database)
    try:
        await _run_upgrade(database, MIGRATION_0099)
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            await conn.executemany(
                """
                INSERT INTO background_jobs (
                    id, created_at, updated_at, job_type, job_type_version, task_name,
                    workload_class, internal_status, retry_class, authority_mode,
                    target_descriptor, idempotency_scope_key, idempotency_key_hash,
                    request_fingerprint, correlation_id, retry_policy, lease_seconds,
                    heartbeat_seconds, completed_at, attempt_count, error_code, status_key
                ) VALUES (
                    $1, clock_timestamp(), clock_timestamp(), 'platform.delivery.reconcile', 1,
                    'platform.delivery.reconcile', 'maintenance', $2, 'none', 'system_service',
                    '{}'::jsonb, $3, $4, $5, $6, '{"maxAttempts":3}'::jsonb,
                    60, 10, clock_timestamp(), 3, 'DELIVERY_PROVIDER_UNAVAILABLE',
                    'jobs:DELIVERY_RECONCILIATION_FAILED'
                )
                """,
                [
                    (
                        failed_job_id,
                        "failed",
                        f"projection-failed:{failed_job_id}",
                        uuid4().hex.ljust(64, "0")[:64],
                        uuid4().hex.rjust(64, "0")[:64],
                        f"projection-failed:{failed_job_id}",
                    ),
                    (
                        recovered_job_id,
                        "succeeded",
                        f"projection-recovered:{recovered_job_id}",
                        uuid4().hex.ljust(64, "0")[:64],
                        uuid4().hex.rjust(64, "0")[:64],
                        f"projection-recovered:{recovered_job_id}",
                    ),
                ],
            )
            await conn.execute(
                """
                INSERT INTO operational_signal_triage (
                    id, created_at, updated_at, signal_id, source_job_id, state, revision
                ) VALUES ($1, clock_timestamp(), clock_timestamp(), $2, $2, 'unclaimed', 1)
                """,
                triage_id,
                recovered_job_id,
            )
            await conn.execute(
                """
                INSERT INTO operational_signal_triage_history (
                    id, created_at, updated_at, triage_id, revision, action, to_state
                ) VALUES ($1, clock_timestamp(), clock_timestamp(), $2, 1, 'claim', 'unclaimed')
                """,
                uuid4(),
                triage_id,
            )
            await conn.execute(
                """
                INSERT INTO operational_signal_triage_notes (
                    id, created_at, updated_at, triage_id, revision, actor_user_id, body
                ) VALUES ($1, clock_timestamp(), clock_timestamp(), $2, 1, $3, 'Preserve this note')
                """,
                uuid4(),
                triage_id,
                uuid4(),
            )
        finally:
            await conn.close()

        await _run_upgrade(database, MIGRATION_0100)
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            projections = await conn.fetch(
                """
                SELECT id, source_domain, signal_type, source_reference_type,
                       source_reference_id, source_lifecycle, resolved_at,
                       policy_id, policy_revision, sanitized_evidence, affected_scope
                FROM operational_signal_projections
                WHERE id = ANY($1::uuid[])
                ORDER BY id
                """,
                [failed_job_id, recovered_job_id],
            )
            triage_projection_id = await conn.fetchval(
                "SELECT projection_id FROM operational_signal_triage WHERE id = $1",
                triage_id,
            )
            projection_fk = await conn.fetchrow(
                """
                SELECT convalidated, confdeltype
                FROM pg_constraint
                WHERE conname = 'operational_signal_triage_projection_id_fkey'
                """
            )
            source_job_column_exists = await conn.fetchval(
                """
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'operational_signal_triage' AND column_name = 'source_job_id'
                )
                """
            )
            signal_id_column_exists = await conn.fetchval(
                """
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'operational_signal_triage' AND column_name = 'signal_id'
                )
                """
            )
            history_count = await conn.fetchval(
                "SELECT COUNT(*) FROM operational_signal_triage_history WHERE triage_id = $1",
                triage_id,
            )
            note_count = await conn.fetchval(
                "SELECT COUNT(*) FROM operational_signal_triage_notes WHERE triage_id = $1",
                triage_id,
            )
        finally:
            await conn.close()

        by_id = {row["id"]: row for row in projections}
        assert set(by_id) == {failed_job_id, recovered_job_id}
        assert by_id[failed_job_id]["source_domain"] == "jobs"
        assert by_id[failed_job_id]["signal_type"] == "background_job_failed"
        assert by_id[failed_job_id]["source_reference_type"] == "background_job"
        assert by_id[failed_job_id]["source_reference_id"] == failed_job_id
        assert by_id[failed_job_id]["source_lifecycle"] == "unresolved"
        assert by_id[failed_job_id]["resolved_at"] is None
        assert by_id[failed_job_id]["sanitized_evidence"] == {
            "jobType": "platform.delivery.reconcile",
            "workloadClass": "maintenance",
            "attemptCount": 3,
            "errorCode": "DELIVERY_PROVIDER_UNAVAILABLE",
            "statusKey": "jobs:DELIVERY_RECONCILIATION_FAILED",
            "detectionTimeProvenance": "source_terminal_at",
        }
        assert by_id[recovered_job_id]["source_lifecycle"] == "resolved"
        assert by_id[recovered_job_id]["resolved_at"] is not None
        assert all(row["policy_id"] == "jobs.background_job_failed" for row in projections)
        assert all(row["policy_revision"] == 1 for row in projections)
        assert triage_projection_id == recovered_job_id
        assert projection_fk is not None
        assert projection_fk["convalidated"] is True
        assert projection_fk["confdeltype"] == "r"
        assert not source_job_column_exists
        assert not signal_id_column_exists
        assert history_count == 1
        assert note_count == 1
    finally:
        await _drop_database(database, admin_database)


@pytest.mark.asyncio
async def test_operational_signal_projection_migration_rejects_nonterminal_triage_source(
    integration_db_settings,
) -> None:
    database = f"arclayer_operational_signal_projection_ambiguous_{uuid4().hex[:12]}"
    admin_database = os.getenv("TEST_DATABASE__ADMIN_DB", "postgres")
    job_id = uuid4()
    await _create_database(database, admin_database)
    try:
        await _run_upgrade(database, MIGRATION_0099)
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            await conn.execute(
                """
                INSERT INTO background_jobs (
                    id, created_at, updated_at, job_type, job_type_version, task_name,
                    workload_class, internal_status, retry_class, authority_mode,
                    target_descriptor, idempotency_scope_key, idempotency_key_hash,
                    request_fingerprint, correlation_id, retry_policy, lease_seconds,
                    heartbeat_seconds, attempt_count
                ) VALUES (
                    $1, clock_timestamp(), clock_timestamp(), 'platform.delivery.reconcile', 1,
                    'platform.delivery.reconcile', 'maintenance', 'queued', 'none', 'system_service',
                    '{}'::jsonb, $2, $3, $4, $5, '{"maxAttempts":3}'::jsonb, 60, 10, 0
                )
                """,
                job_id,
                f"projection-ambiguous:{job_id}",
                uuid4().hex.ljust(64, "0")[:64],
                uuid4().hex.rjust(64, "0")[:64],
                f"projection-ambiguous:{job_id}",
            )
            await conn.execute(
                """
                INSERT INTO operational_signal_triage (
                    id, created_at, updated_at, signal_id, source_job_id, state, revision
                ) VALUES ($1, clock_timestamp(), clock_timestamp(), $2, $2, 'unclaimed', 1)
                """,
                uuid4(),
                job_id,
            )
        finally:
            await conn.close()

        with pytest.raises(AssertionError, match="triage source lifecycle is not terminal"):
            await _run_upgrade(database, MIGRATION_0100)

        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            projection_table_exists = await conn.fetchval(
                "SELECT to_regclass('public.operational_signal_projections') IS NOT NULL"
            )
            old_columns = set(
                await conn.fetchval(
                    """
                    SELECT array_agg(column_name)
                    FROM information_schema.columns
                    WHERE table_name = 'operational_signal_triage'
                        AND column_name = ANY(ARRAY['signal_id', 'source_job_id'])
                    """
                )
            )
            migration_count = await conn.fetchval(
                "SELECT COUNT(*) FROM tortoise_migrations WHERE app = 'models' AND name = $1",
                MIGRATION_0100,
            )
        finally:
            await conn.close()

        assert not projection_table_exists
        assert old_columns == {"signal_id", "source_job_id"}
        assert migration_count == 0
    finally:
        await _drop_database(database, admin_database)
