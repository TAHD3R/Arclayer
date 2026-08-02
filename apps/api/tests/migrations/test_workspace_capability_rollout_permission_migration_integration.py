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

MIGRATION_0092 = "0092_workspace_capability_rollout"
MIGRATION_0093 = "0093_workspace_capability_rollout_permission"
WORKSPACE_CAPABILITY_ROLLOUT_APPLY_PERMISSION = "platform:workspace-capability-rollout:apply"

type _BuiltInRoleRevision = tuple[object, object, object, object, tuple[str, ...]]


def _permission_codes(value: object) -> tuple[str, ...]:
    if not isinstance(value, list):
        raise AssertionError("permission_codes query result must be a list")

    codes: list[str] = []
    for code in value:
        if not isinstance(code, str):
            raise AssertionError("permission_codes query result must contain only strings")
        codes.append(code)
    return tuple(codes)


async def _built_in_role_revisions(conn: asyncpg.Connection) -> tuple[_BuiltInRoleRevision, ...]:
    rows = await conn.fetch(
        """
        SELECT
            role.code,
            revision.id,
            revision.sequence,
            revision.is_current,
            COALESCE(array_agg(permission.code ORDER BY permission.code)
                FILTER (WHERE permission.code IS NOT NULL), ARRAY[]::text[]) AS permission_codes
        FROM platform_roles AS role
        JOIN platform_role_revisions AS revision
            ON revision.role_id = role.id AND revision.is_current = TRUE
        LEFT JOIN platform_role_revision_permissions AS binding
            ON binding.role_revision_id = revision.id
        LEFT JOIN platform_permissions AS permission
            ON permission.id = binding.permission_id
        WHERE role.kind = 'built_in'
        GROUP BY role.code, revision.id, revision.sequence, revision.is_current
        ORDER BY role.code
        """
    )
    return tuple(
        (row["code"], row["id"], row["sequence"], row["is_current"], _permission_codes(row["permission_codes"]))
        for row in rows
    )


@pytest.mark.asyncio
async def test_workspace_capability_rollout_permission_migration_seeds_catalog_without_mutating_built_in_roles(
    integration_db_settings,
) -> None:
    database = f"arclayer_workspace_rollout_permission_{uuid4().hex[:16]}"
    admin_database = os.getenv("TEST_DATABASE__ADMIN_DB", "postgres")
    await _create_database(database, admin_database)
    try:
        await _run_upgrade(database, MIGRATION_0092)
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            before_role_revisions = await _built_in_role_revisions(conn)
        finally:
            await conn.close()

        await _run_upgrade(database, MIGRATION_0093)
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            permission = await conn.fetchrow(
                """
                SELECT
                    id = md5('arclayer:platform-permission:' || code)::uuid AS stable_id,
                    owner_domain,
                    name_i18n,
                    description_i18n,
                    is_delegable,
                    catalog_revision,
                    is_active
                FROM platform_permissions
                WHERE code = $1
                """,
                WORKSPACE_CAPABILITY_ROLLOUT_APPLY_PERMISSION,
            )
            after_role_revisions = await _built_in_role_revisions(conn)
        finally:
            await conn.close()

        assert permission is not None
        assert before_role_revisions
        assert dict(permission) == {
            "stable_id": True,
            "owner_domain": "capabilities",
            "name_i18n": "platform.permission.workspace_capability_rollout_apply.name",
            "description_i18n": "platform.permission.workspace_capability_rollout_apply.description",
            "is_delegable": True,
            "catalog_revision": 1,
            "is_active": True,
        }
        assert after_role_revisions == before_role_revisions
        assert all(
            WORKSPACE_CAPABILITY_ROLLOUT_APPLY_PERMISSION not in revision[4] for revision in after_role_revisions
        )
    finally:
        await _drop_database(database, admin_database)
