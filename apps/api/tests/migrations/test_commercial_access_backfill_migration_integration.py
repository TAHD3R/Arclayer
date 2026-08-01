from __future__ import annotations

import os
from uuid import UUID, uuid4

import asyncpg
import pytest

from tests.migrations.commercialization_legacy_schema import prepare_commercialization_legacy_schema
from tests.migrations.test_upload_completion_migration_integration import (
    _connection_kwargs,
    _create_database,
    _drop_database,
    _run_upgrade,
)

MIGRATION_0079 = "0079_workspace_commercialization_persistence_hard_cut"
MIGRATION_0088 = "0088_backfill_local_free_commercial_access"
MIGRATIONS_0080_THROUGH_0087 = (
    "0080_workspace_fixed_member_role_management_hard_cut",
    "0081_commercial_access_fact_consumers",
    "0082_feature_access_convergence_outbox",
    "0083_subscription_transition_convergence_binding",
    "0084_support_access_grants",
    "0085_operational_signal_triage",
    "0086_platform_saved_views",
    "0087_wave7_platform_permission_hard_cut",
)


@pytest.mark.asyncio
async def test_commercial_access_backfill_uses_current_subscription_lifecycle_and_is_idempotent(
    integration_db_settings,
) -> None:
    database = f"arclayer_commercial_access_backfill_{uuid4().hex[:12]}"
    admin_database = os.getenv("TEST_DATABASE__ADMIN_DB", "postgres")
    workspace_ids = tuple(uuid4() for _ in range(4))
    subscription_ids = tuple(uuid4() for _ in workspace_ids)
    try:
        await _create_database(database, admin_database)
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            await prepare_commercialization_legacy_schema(conn)
        finally:
            await conn.close()

        await _run_upgrade(database, MIGRATION_0079)
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            await conn.executemany(
                "INSERT INTO tortoise_migrations (app, name, applied_at) VALUES ('models', $1, NOW())",
                [(migration,) for migration in MIGRATIONS_0080_THROUGH_0087],
            )
            revisions = {
                row["code"]: row["id"]
                for row in await conn.fetch(
                    """
                    SELECT plan.code, revision.id
                    FROM commerce_plans AS plan
                    JOIN commerce_plan_revisions AS revision ON revision.plan_id = plan.id
                    WHERE plan.code = ANY($1::varchar[])
                    """,
                    ["free", "premium"],
                )
            }
            await conn.executemany(
                "INSERT INTO workspaces (id) VALUES ($1)", [(workspace_id,) for workspace_id in workspace_ids]
            )
            await conn.executemany(
                """
                INSERT INTO commerce_workspace_subscriptions (
                    id, created_at, updated_at, workspace_id, plan_revision_id, status, billing_cycle,
                    current_period_start, current_period_end, cancel_at_period_end, billing_provider,
                    provider_mode, external_customer_id, external_subscription_id, revision
                ) VALUES (
                    $1, NOW(), NOW(), $2, $3, $4, 'monthly', NOW(), NOW() + INTERVAL '1 month', FALSE,
                    $5, $6, $7, $8, 1
                )
                """,
                [
                    (subscription_ids[0], workspace_ids[0], revisions["free"], "active", "local", None, None, None),
                    (
                        subscription_ids[1],
                        workspace_ids[1],
                        revisions["premium"],
                        "active",
                        "stripe",
                        "test",
                        "cus_active",
                        "sub_active",
                    ),
                    (
                        subscription_ids[2],
                        workspace_ids[2],
                        revisions["premium"],
                        "past_due",
                        "stripe",
                        "test",
                        "cus_past_due",
                        "sub_past_due",
                    ),
                    (
                        subscription_ids[3],
                        workspace_ids[3],
                        revisions["premium"],
                        "canceled",
                        "stripe",
                        "test",
                        "cus_canceled",
                        "sub_canceled",
                    ),
                ],
            )
        finally:
            await conn.close()

        await _run_upgrade(database, MIGRATION_0088)
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            rows = await _commercial_access_rows(conn, workspace_ids)
            await conn.execute(
                "DELETE FROM tortoise_migrations WHERE app = 'models' AND name = $1",
                MIGRATION_0088,
            )
        finally:
            await conn.close()

        await _run_upgrade(database, MIGRATION_0088)
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            rerun_rows = await _commercial_access_rows(conn, workspace_ids)
        finally:
            await conn.close()

        assert {row["subscription_id"]: row["state"] for row in rows} == {
            subscription_ids[0]: "normal",
            subscription_ids[1]: "normal",
            subscription_ids[2]: "payment_restricted",
            subscription_ids[3]: "payment_restricted",
        }
        assert all(row["deadline_at"] is None for row in rows)
        assert all(row["state_revision"] == 1 for row in rows)
        assert rows == rerun_rows
    finally:
        await _drop_database(database, admin_database)


async def _commercial_access_rows(
    conn: asyncpg.Connection,
    workspace_ids: tuple[UUID, ...],
) -> list[asyncpg.Record]:
    return await conn.fetch(
        """
        SELECT workspace_id, subscription_id, state, deadline_at, state_revision, source_identity
        FROM commerce_workspace_commercial_access
        WHERE workspace_id = ANY($1::uuid[])
        ORDER BY workspace_id
        """,
        workspace_ids,
    )
