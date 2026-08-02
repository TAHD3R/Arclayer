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
from tests.migrations.wave5_to9_predecessor_schema import (
    RETIRED_COMMERCE_PERMISSION_CODES,
    prepare_wave5_to7_predecessor_schema,
)

MIGRATION_0079 = "0079_workspace_commercialization_persistence_hard_cut"
MIGRATION_0088 = "0088_backfill_local_free_commercial_access"
MIGRATIONS_0080_THROUGH_0088 = (
    "0080_workspace_fixed_member_role_management_hard_cut",
    "0081_commercial_access_fact_consumers",
    "0082_feature_access_convergence_outbox",
    "0083_subscription_transition_convergence_binding",
    "0084_support_access_grants",
    "0085_operational_signal_triage",
    "0086_platform_saved_views",
    "0087_wave7_platform_permission_hard_cut",
    MIGRATION_0088,
)
WAVE5_TO7_TABLES = {
    "commerce_commercial_access_facts",
    "commerce_feature_access_convergence_outbox",
    "hosting_commercial_access_projections",
    "hosting_commercial_access_receipts",
    "operational_signal_triage",
    "operational_signal_triage_history",
    "platform_saved_views",
    "support_access_grant_operators",
    "support_access_grant_scopes",
    "support_access_grants",
    "system_commercial_lifecycle_notification_deliveries",
}
WAVE5_TO7_CONSTRAINTS = {
    "commerce_commercial_access_facts_identity_unique",
    "commerce_commercial_access_facts_kind_check",
    "commerce_subscription_transition_items_convergence_check",
    "operational_signal_triage_signal_source_check",
    "platform_saved_views_actor_capability_name",
    "support_access_grants_state_check",
    "system_roles_lifecycle_check",
    "workspace_membership_roles_lifecycle_check",
}
WAVE7_REPLACEMENT_PERMISSION_CODES = {
    "platform:ai-tasks:read",
    "platform:ai-tasks:recover",
    "platform:commerce:catalog-manage",
    "platform:commerce:credits-adjust",
    "platform:commerce:events-reconcile",
    "platform:commerce:provider-manage",
    "platform:commerce:read",
    "platform:commerce:subscriptions-manage",
}
OPERATIONAL_SIGNAL_PERMISSION_CODES = {
    "platform:operations-signals:assign",
    "platform:operations-signals:claim",
    "platform:operations-signals:read",
    "platform:operations-signals:triage",
}

pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_commercial_access_backfill_uses_current_subscription_lifecycle_and_is_idempotent(
    integration_db_settings,
) -> None:
    database = f"arclayer_commercial_access_backfill_{uuid4().hex[:12]}"
    admin_database = os.getenv("TEST_DATABASE__ADMIN_DB", "postgres")
    workspace_ids = tuple(uuid4() for _ in range(4))
    subscription_ids = tuple(uuid4() for _ in workspace_ids)
    membership_id = uuid4()
    workspace_role_id = uuid4()
    transition_id = uuid4()
    transition_item_id = uuid4()
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
            await prepare_wave5_to7_predecessor_schema(
                conn,
                workspace_id=workspace_ids[0],
                membership_id=membership_id,
                role_id=workspace_role_id,
            )
            await conn.executemany(
                "INSERT INTO workspaces (id) VALUES ($1) ON CONFLICT DO NOTHING",
                [(workspace_id,) for workspace_id in workspace_ids],
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
            await conn.execute(
                """
                INSERT INTO commerce_subscription_revision_transitions (
                    id, created_at, updated_at, source_plan_revision_id, target_plan_revision_id,
                    actor_user_id, reason, preview_token_hash, idempotency_key, requested_at,
                    status, correlation_id
                ) VALUES (
                    $1, NOW(), NOW(), $2, $3, NULL, 'Wave 5 to 7 migration predecessor',
                    $4, $5, NOW(), 'scheduled', $6
                )
                """,
                transition_id,
                revisions["free"],
                revisions["premium"],
                f"transition-preview-{transition_id.hex}",
                f"transition-idempotency-{transition_id.hex}",
                uuid4(),
            )
            await conn.execute(
                """
                INSERT INTO commerce_subscription_revision_transition_items (
                    id, created_at, updated_at, transition_id, subscription_id, effective_at,
                    status
                ) VALUES ($1, NOW(), NOW(), $2, $3, NOW(), 'scheduled')
                """,
                transition_item_id,
                transition_id,
                subscription_ids[0],
            )
        finally:
            await conn.close()

        await _run_upgrade(database, MIGRATION_0088)
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            rows = await _commercial_access_rows(conn, workspace_ids)
            tables = {
                row["table_name"]
                for row in await conn.fetch(
                    """
                    SELECT table_name
                    FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = ANY($1::text[])
                    """,
                    list(WAVE5_TO7_TABLES),
                )
            }
            constraints = {
                row["conname"]
                for row in await conn.fetch(
                    "SELECT conname FROM pg_constraint WHERE conname = ANY($1::text[])",
                    list(WAVE5_TO7_CONSTRAINTS),
                )
            }
            indexes = {
                row["indexname"]: row["indexdef"]
                for row in await conn.fetch(
                    """
                    SELECT indexname, indexdef
                    FROM pg_indexes
                    WHERE schemaname = 'public'
                        AND indexname = ANY($1::text[])
                    """,
                    [
                        "commerce_subscription_transition_items_convergence_unique",
                        "operational_signal_triage_state_reminder_idx",
                        "platform_saved_views_actor_capability_idx",
                        "support_access_grants_current_idx",
                        "system_roles_active_workspace_idx",
                        "workspace_membership_roles_one_active",
                    ],
                )
            }
            lifecycle_rows = await conn.fetchrow(
                """
                SELECT
                    system_role.started_at IS NOT NULL AS system_role_started,
                    system_role.ended_at IS NULL AS system_role_active,
                    membership_role.started_at IS NOT NULL AS membership_role_started,
                    membership_role.ended_at IS NULL AS membership_role_active
                FROM system_roles AS system_role
                CROSS JOIN workspace_membership_roles AS membership_role
                WHERE system_role.workspace_id = $1
                    AND membership_role.membership_id = $2
                    AND membership_role.role_id = $3
                """,
                workspace_ids[0],
                membership_id,
                workspace_role_id,
            )
            await conn.execute(
                """
                UPDATE workspace_membership_roles
                SET ended_at = NOW()
                WHERE membership_id = $1 AND role_id = $2
                """,
                membership_id,
                workspace_role_id,
            )
            await conn.execute(
                """
                INSERT INTO workspace_membership_roles (id, membership_id, role_id, started_at)
                VALUES ($1, $2, $3, NOW())
                """,
                uuid4(),
                membership_id,
                workspace_role_id,
            )
            active_assignment_count = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM workspace_membership_roles
                WHERE membership_id = $1 AND role_id = $2 AND ended_at IS NULL
                """,
                membership_id,
                workspace_role_id,
            )
            transition_convergence = await conn.fetchrow(
                """
                SELECT convergence_id, requires_convergence
                FROM commerce_subscription_revision_transition_items
                WHERE id = $1
                """,
                transition_item_id,
            )
            outbox_convergence_is_unique = await conn.fetchval(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conrelid = 'commerce_feature_access_convergence_outbox'::regclass
                        AND contype = 'u'
                        AND pg_get_constraintdef(oid) LIKE 'UNIQUE (convergence_id)%'
                )
                """
            )
            migrated_permissions = set(
                await conn.fetchval(
                    """
                    SELECT array_agg(code)
                    FROM platform_permissions
                    WHERE code = ANY($1::text[])
                    """,
                    list(WAVE7_REPLACEMENT_PERMISSION_CODES | set(RETIRED_COMMERCE_PERMISSION_CODES)),
                )
                or []
            )
            operational_permissions = set(
                await conn.fetchval(
                    """
                    SELECT array_agg(permission.code)
                    FROM platform_roles AS role
                    JOIN platform_role_revisions AS revision
                        ON revision.role_id = role.id AND revision.is_current = TRUE
                    JOIN platform_role_revision_permissions AS binding
                        ON binding.role_revision_id = revision.id
                    JOIN platform_permissions AS permission ON permission.id = binding.permission_id
                    WHERE role.code = 'platform-operations-reader'
                    """
                )
                or []
            )
            tenant_support_bound = await conn.fetchval(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM platform_roles AS role
                    JOIN platform_role_revisions AS revision
                        ON revision.role_id = role.id AND revision.is_current = TRUE
                    JOIN platform_role_revision_permissions AS binding
                        ON binding.role_revision_id = revision.id
                    JOIN platform_permissions AS permission ON permission.id = binding.permission_id
                    WHERE role.code = 'tenant-governance-operator'
                        AND permission.code = 'platform:tenant-support:read'
                )
                """
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
            migration_names = set(
                await conn.fetchval(
                    """
                    SELECT array_agg(name)
                    FROM tortoise_migrations
                    WHERE app = 'models' AND name = ANY($1::text[])
                    """,
                    list(MIGRATIONS_0080_THROUGH_0088),
                )
                or []
            )
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
        assert {row["subscription_id"]: row["source_identity"] for row in rows} == {
            subscription_id: f"migration:0088:commercial-access:{workspace_id}"
            for subscription_id, workspace_id in zip(subscription_ids, workspace_ids, strict=True)
        }
        assert tables == WAVE5_TO7_TABLES
        assert constraints == WAVE5_TO7_CONSTRAINTS
        assert set(indexes) == {
            "commerce_subscription_transition_items_convergence_unique",
            "operational_signal_triage_state_reminder_idx",
            "platform_saved_views_actor_capability_idx",
            "support_access_grants_current_idx",
            "system_roles_active_workspace_idx",
            "workspace_membership_roles_one_active",
        }
        assert "UNIQUE" in indexes["commerce_subscription_transition_items_convergence_unique"]
        assert "WHERE" in indexes["commerce_subscription_transition_items_convergence_unique"]
        assert "convergence_id IS NOT NULL" in indexes["commerce_subscription_transition_items_convergence_unique"]
        assert "UNIQUE" in indexes["workspace_membership_roles_one_active"]
        assert "WHERE" in indexes["workspace_membership_roles_one_active"]
        assert "ended_at IS NULL" in indexes["workspace_membership_roles_one_active"]
        assert lifecycle_rows is not None
        assert dict(lifecycle_rows) == {
            "system_role_started": True,
            "system_role_active": True,
            "membership_role_started": True,
            "membership_role_active": True,
        }
        assert active_assignment_count == 1
        assert transition_convergence is not None
        assert dict(transition_convergence) == {"convergence_id": None, "requires_convergence": False}
        assert outbox_convergence_is_unique is True
        assert migrated_permissions == WAVE7_REPLACEMENT_PERMISSION_CODES
        assert OPERATIONAL_SIGNAL_PERMISSION_CODES <= operational_permissions
        assert tenant_support_bound is True
        assert history_trigger is True
        assert migration_names == set(MIGRATIONS_0080_THROUGH_0088)
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
