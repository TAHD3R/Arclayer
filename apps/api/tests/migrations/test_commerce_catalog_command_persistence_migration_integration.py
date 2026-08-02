from __future__ import annotations

import os
from uuid import uuid4

import asyncpg
import pytest

from tests.migrations.commercialization_legacy_schema import prepare_commercialization_legacy_schema
from tests.migrations.test_upload_completion_migration_integration import (
    _connection_kwargs,
    _create_database,
    _drop_database,
    _run_upgrade,
)

MIGRATION_0089 = "0089_commerce_catalog_command_persistence"


@pytest.mark.asyncio
async def test_catalog_command_persistence_migration_adds_receipts_and_draft_revision(integration_db_settings) -> None:
    database = f"arclayer_catalog_command_{uuid4().hex[:18]}"
    admin_database = os.getenv("TEST_DATABASE__ADMIN_DB", "postgres")
    try:
        await _create_database(database, admin_database)
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            await prepare_commercialization_legacy_schema(conn)
        finally:
            await conn.close()

        await _run_upgrade(database, MIGRATION_0089)

        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            free_revision = await conn.fetchrow(
                "SELECT id, plan_id, revision FROM commerce_plan_revisions WHERE status = 'published' LIMIT 1"
            )
            assert free_revision is not None
            audit_event_id = uuid4()
            receipt_id = uuid4()
            await conn.execute(
                """
                INSERT INTO analytics_audit_events (
                    id, created_at, updated_at, occurred_at, event_name, source
                ) VALUES ($1, NOW(), NOW(), NOW(), 'commerce.catalog.draft_created', 'api')
                """,
                audit_event_id,
            )
            await conn.execute(
                """
                INSERT INTO commerce_catalog_command_receipts (
                    id, created_at, updated_at, action, idempotency_key_hash, request_fingerprint,
                    actor_user_id, actor_session_id, target_plan_code, plan_id, plan_revision_id,
                    result_revision, result_snapshot, audit_event_id
                ) VALUES (
                    $1, NOW(), NOW(), 'create_draft', $2, $3, NULL, NULL, 'free', $4, $5,
                    $6, '{}'::jsonb, $7
                )
                """,
                receipt_id,
                "a" * 64,
                "b" * 64,
                free_revision["plan_id"],
                free_revision["id"],
                free_revision["revision"],
                audit_event_id,
            )
            with pytest.raises(asyncpg.UniqueViolationError):
                await conn.execute(
                    """
                    INSERT INTO commerce_catalog_command_receipts (
                        id, created_at, updated_at, action, idempotency_key_hash, request_fingerprint,
                        target_plan_code, plan_id, plan_revision_id, result_revision, result_snapshot, audit_event_id
                    ) VALUES (
                        $1, NOW(), NOW(), 'create_draft', $2, $3, 'free', $4, $5, $6, '{}'::jsonb, $7
                    )
                    """,
                    uuid4(),
                    "a" * 64,
                    "c" * 64,
                    free_revision["plan_id"],
                    free_revision["id"],
                    free_revision["revision"],
                    audit_event_id,
                )
        finally:
            await conn.close()
    finally:
        await _drop_database(database, admin_database)
