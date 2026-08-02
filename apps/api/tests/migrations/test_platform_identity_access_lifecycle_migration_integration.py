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
IDENTITY_LIFECYCLE_TABLES = {
    "platform_identity_mutation_receipts",
    "platform_role_change_previews",
}
STEP_UP_ACTION_CODES = {
    "platform.access.change_role",
    "platform.access.invite_operator",
    "platform.access.remove_operator",
    "platform.access.reset_operator_mfa",
    "platform.access.transfer_instance_ownership",
}
PRESERVED_FRESHNESS_ACTION_CODE = "platform.access.change_role"
NO_STEP_UP_ACTION_CODE = "platform.access.lifecycle-read-only-test"

pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_platform_identity_access_lifecycle_migration_backfills_freshness_and_enforces_receipt_identity(
    integration_db_settings,
) -> None:
    database = f"arclayer_platform_identity_lifecycle_{uuid4().hex[:16]}"
    admin_database = os.getenv("TEST_DATABASE__ADMIN_DB", "postgres")
    actor_user_id = uuid4()
    second_actor_user_id = uuid4()
    role_id = uuid4()
    role_revision_id = uuid4()
    receipt_correlation_id = uuid4()
    try:
        await _create_database(database, admin_database)
        await _run_upgrade(database, MIGRATION_0098)

        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            await _insert_user(conn, user_id=actor_user_id, label="actor")
            await _insert_user(conn, user_id=second_actor_user_id, label="second-actor")
            await conn.execute(
                """
                INSERT INTO platform_roles (
                    id, created_at, updated_at, code, kind, name, description,
                    name_i18n, description_i18n, created_by_user_id, is_active
                ) VALUES (
                    $1, NOW(), NOW(), 'lifecycle-migration-custom-role', 'custom',
                    'Lifecycle migration custom role', NULL, NULL, NULL, $2, TRUE
                )
                """,
                role_id,
                actor_user_id,
            )
            await conn.execute(
                """
                INSERT INTO platform_role_revisions (
                    id, created_at, updated_at, role_id, sequence, is_current,
                    created_by_user_id, superseded_at
                ) VALUES ($1, NOW(), NOW(), $2, 1, TRUE, $3, NULL)
                """,
                role_revision_id,
                role_id,
                actor_user_id,
            )
            await conn.execute(
                """
                UPDATE platform_action_policies
                SET freshness_seconds = 720, updated_at = NOW()
                WHERE code = $1
                """,
                PRESERVED_FRESHNESS_ACTION_CODE,
            )
            await conn.execute(
                """
                INSERT INTO platform_action_policies (
                    id, created_at, updated_at, code, permission_id, requires_step_up,
                    required_assurance, freshness_seconds, policy_revision, is_active
                ) VALUES (
                    $1, NOW(), NOW(), $2,
                    (SELECT id FROM platform_permissions WHERE code = 'platform:access-team:read'),
                    FALSE, 'local_mfa', NULL, 1, TRUE
                )
                """,
                uuid4(),
                NO_STEP_UP_ACTION_CODE,
            )
        finally:
            await conn.close()

        await _run_upgrade(database, MIGRATION_0099)
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            tables = {
                row["table_name"]
                for row in await conn.fetch(
                    """
                    SELECT table_name
                    FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = ANY($1::text[])
                    """,
                    list(IDENTITY_LIFECYCLE_TABLES),
                )
            }
            preview_indexes = {
                row["indexname"]
                for row in await conn.fetch(
                    """
                    SELECT indexname
                    FROM pg_indexes
                    WHERE schemaname = 'public' AND indexname = ANY($1::text[])
                    """,
                    [
                        "platform_role_change_previews_actor_created_idx",
                        "platform_role_change_previews_role_created_idx",
                    ],
                )
            }
            freshness_by_action = {
                row["code"]: row["freshness_seconds"]
                for row in await conn.fetch(
                    """
                    SELECT code, freshness_seconds
                    FROM platform_action_policies
                    WHERE code = ANY($1::text[])
                    """,
                    list(STEP_UP_ACTION_CODES | {NO_STEP_UP_ACTION_CODE}),
                )
            }
            await conn.execute(
                """
                INSERT INTO platform_role_change_previews (
                    id, created_at, updated_at, role_id, actor_user_id, expected_role_revision_id,
                    proposed_name, proposed_description, proposed_permission_codes,
                    assignment_fingerprint, catalog_fingerprint
                ) VALUES (
                    $1, NOW(), NOW(), $2, $3, $4, 'Reviewed role name',
                    'Reviewed role description', '["platform:access-roles:manage"]'::jsonb,
                    $5, $6
                )
                """,
                uuid4(),
                role_id,
                actor_user_id,
                role_revision_id,
                "a" * 64,
                "b" * 64,
            )
            await conn.execute(
                """
                INSERT INTO platform_identity_mutation_receipts (
                    id, created_at, updated_at, actor_user_id, action, idempotency_key,
                    request_fingerprint, entity_id, correlation_id
                ) VALUES ($1, NOW(), NOW(), $2, 'platform.access.change_role', $3, $4, $5, $6)
                """,
                uuid4(),
                actor_user_id,
                "idempotency-key-1",
                "c" * 64,
                role_id,
                receipt_correlation_id,
            )
            with pytest.raises(asyncpg.UniqueViolationError):
                await conn.execute(
                    """
                    INSERT INTO platform_identity_mutation_receipts (
                        id, created_at, updated_at, actor_user_id, action, idempotency_key,
                        request_fingerprint, entity_id, correlation_id
                    ) VALUES ($1, NOW(), NOW(), $2, 'platform.access.change_role', $3, $4, $5, $6)
                    """,
                    uuid4(),
                    actor_user_id,
                    "idempotency-key-1",
                    "d" * 64,
                    role_id,
                    uuid4(),
                )
            with pytest.raises(asyncpg.UniqueViolationError):
                await conn.execute(
                    """
                    INSERT INTO platform_identity_mutation_receipts (
                        id, created_at, updated_at, actor_user_id, action, idempotency_key,
                        request_fingerprint, entity_id, correlation_id
                    ) VALUES ($1, NOW(), NOW(), $2, 'platform.access.remove_operator', $3, $4, $5, $6)
                    """,
                    uuid4(),
                    second_actor_user_id,
                    "idempotency-key-2",
                    "e" * 64,
                    role_id,
                    receipt_correlation_id,
                )
            migration_count = await conn.fetchval(
                "SELECT COUNT(*) FROM tortoise_migrations WHERE app = 'models' AND name = $1",
                MIGRATION_0099,
            )
        finally:
            await conn.close()

        assert tables == IDENTITY_LIFECYCLE_TABLES
        assert preview_indexes == {
            "platform_role_change_previews_actor_created_idx",
            "platform_role_change_previews_role_created_idx",
        }
        assert freshness_by_action == {
            "platform.access.change_role": 720,
            "platform.access.invite_operator": 300,
            "platform.access.lifecycle-read-only-test": None,
            "platform.access.remove_operator": 300,
            "platform.access.reset_operator_mfa": 300,
            "platform.access.transfer_instance_ownership": 300,
        }
        assert migration_count == 1
    finally:
        await _drop_database(database, admin_database)


async def _insert_user(conn: asyncpg.Connection, *, user_id, label: str) -> None:
    await conn.execute(
        """
        INSERT INTO users (id, created_at, updated_at, username, email, status, token_version)
        VALUES ($1, NOW(), NOW(), $2, $3, 'active', 0)
        """,
        user_id,
        f"platform-lifecycle-{label}-{user_id.hex[:8]}",
        f"platform-lifecycle-{label}-{user_id.hex[:8]}@example.com",
    )
