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

MIGRATION_0122 = "0122_checkout_activation_evidence"
MIGRATION_0123 = "0123_dunning_policy_ordering_evidence"
MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "src" / "migrations"
pytestmark = pytest.mark.integration


async def _prepare_legacy_dunning_schema(conn: asyncpg.Connection) -> dict[str, UUID]:
    identifiers = {
        "workspace_id": uuid4(),
        "subscription_id": uuid4(),
        "plan_revision_id": uuid4(),
        "access_id": uuid4(),
        "transition_id": uuid4(),
        "application_id": uuid4(),
    }
    await conn.execute(
        """
        CREATE TABLE tortoise_migrations (
            id SERIAL PRIMARY KEY,
            app VARCHAR(255) NOT NULL,
            name VARCHAR(255) NOT NULL,
            applied_at TIMESTAMPTZ NOT NULL,
            UNIQUE (app, name)
        );
        CREATE TABLE commerce_dunning_policies (
            id UUID PRIMARY KEY,
            revision BIGINT NOT NULL
        );
        CREATE TABLE commerce_workspace_subscriptions (
            id UUID PRIMARY KEY,
            workspace_id UUID NOT NULL,
            plan_revision_id UUID NOT NULL,
            current_period_start TIMESTAMPTZ NOT NULL,
            current_period_end TIMESTAMPTZ NOT NULL
        );
        CREATE TABLE commerce_workspace_commercial_access (
            id UUID PRIMARY KEY,
            workspace_id UUID NOT NULL,
            subscription_id UUID NOT NULL,
            state_revision BIGINT NOT NULL,
            source_identity VARCHAR(255) NOT NULL UNIQUE
        );
        CREATE TABLE commerce_provider_event_applications (
            id UUID PRIMARY KEY,
            provider VARCHAR(32) NOT NULL,
            provider_mode VARCHAR(16) NOT NULL,
            provider_account_id VARCHAR(255) NOT NULL,
            provider_event_id VARCHAR(255) NOT NULL,
            workspace_id UUID NOT NULL,
            subscription_id UUID NOT NULL,
            plan_revision_id UUID NOT NULL,
            provider_period_identity VARCHAR(255)
        );
        CREATE TABLE commerce_commercial_access_transitions (
            id UUID PRIMARY KEY,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            access_id UUID NOT NULL,
            from_state VARCHAR(24) NOT NULL,
            to_state VARCHAR(24) NOT NULL,
            deadline_at TIMESTAMPTZ,
            source_identity VARCHAR(255) NOT NULL UNIQUE,
            correlation_id UUID NOT NULL UNIQUE
        );
        """
    )
    migration_names = sorted(
        path.stem for path in MIGRATIONS_DIR.glob("[0-9][0-9][0-9][0-9]_*.py") if path.stem <= MIGRATION_0122
    )
    await conn.executemany(
        "INSERT INTO tortoise_migrations (app, name, applied_at) VALUES ('models', $1, NOW())",
        [(name,) for name in migration_names],
    )
    await conn.execute(
        """
        INSERT INTO commerce_workspace_subscriptions (
            id, workspace_id, plan_revision_id, current_period_start, current_period_end
        ) VALUES ($1, $2, $3, '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z')
        """,
        identifiers["subscription_id"],
        identifiers["workspace_id"],
        identifiers["plan_revision_id"],
    )
    await conn.execute(
        """
        INSERT INTO commerce_workspace_commercial_access (
            id, workspace_id, subscription_id, state_revision, source_identity
        ) VALUES ($1, $2, $3, 2, 'provider:simulated:evt_legacy_dunning')
        """,
        identifiers["access_id"],
        identifiers["workspace_id"],
        identifiers["subscription_id"],
    )
    await conn.execute(
        """
        INSERT INTO commerce_provider_event_applications (
            id, provider, provider_mode, provider_account_id, provider_event_id,
            workspace_id, subscription_id, plan_revision_id, provider_period_identity
        ) VALUES (
            $1, 'simulated', 'test', 'platform', 'evt_legacy_dunning',
            $2, $3, $4, 'period_legacy_dunning'
        )
        """,
        identifiers["application_id"],
        identifiers["workspace_id"],
        identifiers["subscription_id"],
        identifiers["plan_revision_id"],
    )
    await conn.execute(
        """
        INSERT INTO commerce_commercial_access_transitions (
            id, created_at, updated_at, access_id, from_state, to_state,
            deadline_at, source_identity, correlation_id
        ) VALUES (
            $1, '2026-08-05T00:00:00Z', '2026-08-05T00:00:00Z', $2,
            'normal', 'payment_grace', '2026-08-10T00:00:00Z',
            'provider:simulated:evt_legacy_dunning', $3
        )
        """,
        identifiers["transition_id"],
        identifiers["access_id"],
        uuid4(),
    )
    return identifiers


@pytest.mark.asyncio
async def test_dunning_ordering_migration_backfills_exact_legacy_receipt_evidence(
    integration_db_settings,
) -> None:
    _ = integration_db_settings
    database = f"arclayer_dunning_0123_{uuid4().hex[:10]}"
    admin_database = os.getenv("TEST_DATABASE__ADMIN_DB", "postgres")
    await _create_database(database, admin_database)
    try:
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            identifiers = await _prepare_legacy_dunning_schema(conn)
        finally:
            await conn.close()

        await _run_upgrade(database, MIGRATION_0123)
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            transition = await conn.fetchrow(
                "SELECT * FROM commerce_commercial_access_transitions WHERE id = $1",
                identifiers["transition_id"],
            )
            assert transition is not None
            assert transition["provider"] == "simulated"
            assert transition["provider_mode"] == "test"
            assert transition["provider_account_id"] == "platform"
            assert transition["provider_event_id"] == "evt_legacy_dunning"
            assert transition["subscription_revision_identity"] == identifiers["plan_revision_id"]
            assert transition["provider_period_identity"] == "period_legacy_dunning"
            assert transition["provider_period_start"].isoformat() == "2026-08-01T00:00:00+00:00"
            assert transition["provider_period_end"].isoformat() == "2026-09-01T00:00:00+00:00"
            assert transition["resulting_state_revision"] == 2
            assert transition["source_occurred_at"] is None
            assert transition["dunning_policy_revision"] is None

            access = await conn.fetchrow(
                "SELECT * FROM commerce_workspace_commercial_access WHERE id = $1",
                identifiers["access_id"],
            )
            assert access is not None
            assert access["provider_period_identity"] == "period_legacy_dunning"
            assert access["provider_period_start"] == transition["provider_period_start"]
            assert access["provider_period_end"] == transition["provider_period_end"]

            required_nullable = await conn.fetch(
                """
                SELECT column_name, is_nullable
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'commerce_commercial_access_transitions'
                  AND column_name = ANY($1::text[])
                """,
                [
                    "provider",
                    "provider_mode",
                    "provider_account_id",
                    "provider_event_id",
                    "subscription_revision_identity",
                    "provider_period_identity",
                    "provider_period_start",
                    "provider_period_end",
                    "resulting_state_revision",
                ],
            )
            assert {row["column_name"]: row["is_nullable"] for row in required_nullable} == {
                "provider": "NO",
                "provider_mode": "NO",
                "provider_account_id": "NO",
                "provider_event_id": "NO",
                "subscription_revision_identity": "NO",
                "provider_period_identity": "NO",
                "provider_period_start": "NO",
                "provider_period_end": "NO",
                "resulting_state_revision": "NO",
            }
            assert (
                await conn.fetchval(
                    "SELECT COUNT(*) FROM tortoise_migrations WHERE app = 'models' AND name = $1",
                    MIGRATION_0123,
                )
                == 1
            )
            with pytest.raises(asyncpg.RaiseError, match="commercial access transition evidence is immutable"):
                await conn.execute(
                    "UPDATE commerce_commercial_access_transitions SET deadline_at = NULL WHERE id = $1",
                    identifiers["transition_id"],
                )
        finally:
            await conn.close()
    finally:
        await _drop_database(database, admin_database)
