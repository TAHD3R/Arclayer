from __future__ import annotations

import os
from uuid import uuid4

import asyncpg
import pytest

from tests.migrations.platform_identity_legacy_schema import prepare_platform_identity_legacy_schema
from tests.migrations.test_upload_completion_migration_integration import (
    _connection_kwargs,
    _create_database,
    _drop_database,
    _run_upgrade,
)

MIGRATION_0078 = "0078_platform_identity_security_hard_cut"
PLATFORM_TABLES = {
    "platform_instance_ownership",
    "platform_operators",
    "platform_operator_invitations",
    "platform_permissions",
    "platform_roles",
    "platform_role_revisions",
    "platform_role_revision_permissions",
    "platform_operator_role_assignments",
    "platform_operator_invitation_roles",
    "platform_mfa_methods",
    "platform_webauthn_challenges",
    "platform_auth_flow_challenges",
    "platform_mfa_recovery_codes",
    "platform_action_policies",
    "platform_sessions",
    "platform_step_up_proofs",
    "platform_ownership_transfers",
    "platform_ownership_transfer_former_owner_roles",
}


async def _insert_user(conn: asyncpg.Connection, *, user_id, label: str) -> None:
    await conn.execute(
        """
        INSERT INTO users (id, created_at, updated_at, username, email, status, token_version)
        VALUES ($1, NOW(), NOW(), $2, $3, 'active', 0)
        """,
        user_id,
        f"platform-migration-{label}-{user_id.hex[:8]}",
        f"platform-migration-{label}-{user_id.hex[:8]}@example.com",
    )


@pytest.mark.asyncio
async def test_platform_identity_migration_creates_the_new_catalog_without_legacy_authority(
    integration_db_settings,
) -> None:
    database = f"arclayer_platform_identity_{uuid4().hex[:18]}"
    admin_database = os.getenv("TEST_DATABASE__ADMIN_DB", "postgres")
    await _create_database(database, admin_database)
    try:
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            await prepare_platform_identity_legacy_schema(conn)
            await _insert_user(conn, user_id=uuid4(), label="legacy-super-admin")
            await conn.execute("UPDATE users SET is_super_admin = TRUE")
        finally:
            await conn.close()

        await _run_upgrade(database, MIGRATION_0078)
        await _run_upgrade(database, MIGRATION_0078)

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
                    list(PLATFORM_TABLES),
                )
            }
            action_codes = set(await conn.fetchval("SELECT array_agg(code) FROM platform_action_policies"))
            migration_count = await conn.fetchval(
                "SELECT COUNT(*) FROM tortoise_migrations WHERE app = 'models' AND name = $1", MIGRATION_0078
            )
            has_legacy_flag = await conn.fetchval(
                """
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'is_super_admin'
                )
                """
            )
            owner_or_assignment_count = await conn.fetchval(
                """
                SELECT (SELECT COUNT(*) FROM platform_instance_ownership)
                     + (SELECT COUNT(*) FROM platform_operator_role_assignments)
                """
            )
            role_codes = set(await conn.fetchval("SELECT array_agg(code) FROM platform_roles"))
            challenge_constraints = {
                row["conname"]
                for row in await conn.fetch(
                    """
                    SELECT conname
                    FROM pg_constraint
                    WHERE conname = ANY($1::text[])
                    """,
                    [
                        "platform_webauthn_challenges_purpose_check",
                        "platform_webauthn_challenges_expiry_check",
                        "platform_webauthn_challenges_consumed_at_check",
                        "platform_auth_flow_challenges_purpose_check",
                        "platform_auth_flow_challenges_identity_revision_check",
                        "platform_auth_flow_challenges_failure_count_check",
                        "platform_auth_flow_challenges_expiry_check",
                        "platform_auth_flow_challenges_consumed_at_check",
                    ],
                )
            }
        finally:
            await conn.close()

        assert tables == PLATFORM_TABLES
        assert migration_count == 1
        assert not has_legacy_flag
        assert owner_or_assignment_count == 0
        assert "owner" not in role_codes
        assert challenge_constraints == {
            "platform_webauthn_challenges_purpose_check",
            "platform_webauthn_challenges_expiry_check",
            "platform_webauthn_challenges_consumed_at_check",
            "platform_auth_flow_challenges_purpose_check",
            "platform_auth_flow_challenges_identity_revision_check",
            "platform_auth_flow_challenges_failure_count_check",
            "platform_auth_flow_challenges_expiry_check",
            "platform_auth_flow_challenges_consumed_at_check",
        }
        assert action_codes == {
            "platform.access.invite_operator",
            "platform.access.change_role",
            "platform.access.remove_operator",
            "platform.access.reset_operator_mfa",
            "platform.access.transfer_instance_ownership",
        }
    finally:
        await _drop_database(database, admin_database)


@pytest.mark.asyncio
async def test_platform_identity_migration_enforces_authority_and_pending_record_invariants(
    integration_db_settings,
) -> None:
    database = f"arclayer_platform_constraints_{uuid4().hex[:18]}"
    admin_database = os.getenv("TEST_DATABASE__ADMIN_DB", "postgres")
    first_user_id = uuid4()
    second_user_id = uuid4()
    third_user_id = uuid4()
    await _create_database(database, admin_database)
    try:
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            await prepare_platform_identity_legacy_schema(conn)
            await _insert_user(conn, user_id=first_user_id, label="first")
            await _insert_user(conn, user_id=second_user_id, label="second")
            await _insert_user(conn, user_id=third_user_id, label="third")
        finally:
            await conn.close()

        await _run_upgrade(database, MIGRATION_0078)
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            role_id = await conn.fetchval("SELECT id FROM platform_roles WHERE code = 'access-security-operator'")
            await conn.execute(
                """
                INSERT INTO platform_instance_ownership (
                    id, created_at, updated_at, singleton_key, owner_user_id, revision
                ) VALUES ($1, NOW(), NOW(), 'other', $2, 1)
                """,
                uuid4(),
                first_user_id,
            )
        except asyncpg.CheckViolationError:
            pass
        else:
            pytest.fail("singleton check accepted a non-instance ownership key")
        finally:
            await conn.close()

        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            custom_role_id = uuid4()
            operator_id = uuid4()
            await conn.execute(
                """
                INSERT INTO platform_roles (
                    id, created_at, updated_at, code, kind, name, is_active
                ) VALUES ($1, NOW(), NOW(), 'constraint-test-role', 'custom', 'Constraint test', TRUE)
                """,
                custom_role_id,
            )
            await conn.execute(
                """
                INSERT INTO platform_role_revisions (
                    id, created_at, updated_at, role_id, sequence, is_current
                ) VALUES ($1, NOW(), NOW(), $2, 1, TRUE)
                """,
                uuid4(),
                custom_role_id,
            )
            with pytest.raises(asyncpg.UniqueViolationError):
                await conn.execute(
                    """
                    INSERT INTO platform_role_revisions (
                        id, created_at, updated_at, role_id, sequence, is_current
                    ) VALUES ($1, NOW(), NOW(), $2, 2, TRUE)
                    """,
                    uuid4(),
                    custom_role_id,
                )

            await conn.execute(
                """
                INSERT INTO platform_operators (
                    id, created_at, updated_at, user_id, status, revision
                ) VALUES ($1, NOW(), NOW(), $2, 'active', 1)
                """,
                operator_id,
                first_user_id,
            )
            await conn.execute(
                """
                INSERT INTO platform_operator_role_assignments (
                    id, created_at, updated_at, operator_id, role_id, started_at
                ) VALUES ($1, NOW(), NOW(), $2, $3, NOW())
                """,
                uuid4(),
                operator_id,
                role_id,
            )
            with pytest.raises(asyncpg.UniqueViolationError):
                await conn.execute(
                    """
                    INSERT INTO platform_operator_role_assignments (
                        id, created_at, updated_at, operator_id, role_id, started_at
                    ) VALUES ($1, NOW(), NOW(), $2, $3, NOW())
                    """,
                    uuid4(),
                    operator_id,
                    role_id,
                )

            await conn.execute(
                """
                INSERT INTO platform_operator_invitations (
                    id, created_at, updated_at, recipient_user_id, invited_by_user_id,
                    status, expires_at, revision, idempotency_key, correlation_id
                ) VALUES ($1, NOW(), NOW(), $2, $3, 'pending', NOW() + interval '1 day', 1, 'first-invite', $4)
                """,
                uuid4(),
                second_user_id,
                first_user_id,
                uuid4(),
            )
            with pytest.raises(asyncpg.UniqueViolationError):
                await conn.execute(
                    """
                    INSERT INTO platform_operator_invitations (
                        id, created_at, updated_at, recipient_user_id, invited_by_user_id,
                        status, expires_at, revision, idempotency_key, correlation_id
                    ) VALUES ($1, NOW(), NOW(), $2, $3, 'pending', NOW() + interval '1 day', 1, 'second-invite', $4)
                    """,
                    uuid4(),
                    second_user_id,
                    first_user_id,
                    uuid4(),
                )

            await conn.execute("UPDATE platform_operator_invitations SET status = 'revoked'")
            await conn.execute(
                """
                INSERT INTO platform_operator_invitations (
                    id, created_at, updated_at, recipient_user_id, invited_by_user_id,
                    status, expires_at, revision, idempotency_key, correlation_id
                ) VALUES ($1, NOW(), NOW(), $2, $3, 'pending', NOW() + interval '1 day', 1, 'replay-key', $4)
                """,
                uuid4(),
                first_user_id,
                first_user_id,
                uuid4(),
            )
            with pytest.raises(asyncpg.UniqueViolationError):
                await conn.execute(
                    """
                    INSERT INTO platform_operator_invitations (
                        id, created_at, updated_at, recipient_user_id, invited_by_user_id,
                        status, expires_at, revision, idempotency_key, correlation_id
                    ) VALUES ($1, NOW(), NOW(), $2, $3, 'pending', NOW() + interval '1 day', 1, 'replay-key', $4)
                    """,
                    uuid4(),
                    third_user_id,
                    first_user_id,
                    uuid4(),
                )

            await conn.execute(
                """
                    INSERT INTO platform_ownership_transfers (
                        id, created_at, updated_at, previous_owner_user_id, next_owner_user_id,
                        initiated_by_user_id, status, ownership_revision, target_operator_revision,
                        expires_at, idempotency_key, correlation_id, revision
                    ) VALUES ($1, NOW(), NOW(), $2, $3, $2, 'pending', 1, 1, NOW() + interval '1 day', 'first', $4, 1)
                """,
                uuid4(),
                first_user_id,
                second_user_id,
                uuid4(),
            )
            with pytest.raises(asyncpg.UniqueViolationError):
                await conn.execute(
                    """
                        INSERT INTO platform_ownership_transfers (
                            id, created_at, updated_at, previous_owner_user_id, next_owner_user_id,
                            initiated_by_user_id, status, ownership_revision, target_operator_revision,
                            expires_at, idempotency_key, correlation_id, revision
                        ) VALUES ($1, NOW(), NOW(), $2, $3, $2, 'pending', 2, 1, NOW() + interval '1 day', 'second', $4, 1)
                    """,
                    uuid4(),
                    third_user_id,
                    second_user_id,
                    uuid4(),
                )
        finally:
            await conn.close()
    finally:
        await _drop_database(database, admin_database)
