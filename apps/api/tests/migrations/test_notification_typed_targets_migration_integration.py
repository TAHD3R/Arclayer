from __future__ import annotations

import json
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

MIGRATION_0101 = "0101_hosting_delivery_policy_previews"
MIGRATION_0102 = "0102_notification_typed_targets"
MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "src" / "migrations"


def _migration_names_through_0101() -> list[str]:
    return sorted(
        path.stem
        for path in MIGRATIONS_DIR.glob("[0-9][0-9][0-9][0-9]_*.py")
        if path.stem <= MIGRATION_0101
    )


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
            workspace_id UUID NOT NULL REFERENCES workspaces(id)
        );
        CREATE TABLE sites (
            id UUID PRIMARY KEY,
            workspace_id UUID NOT NULL REFERENCES workspaces(id),
            project_id UUID REFERENCES projects(id)
        );
        CREATE TABLE content_releases (
            id UUID PRIMARY KEY,
            workspace_id UUID NOT NULL REFERENCES workspaces(id),
            site_id UUID NOT NULL REFERENCES sites(id)
        );
        CREATE TABLE system_notifications (
            id UUID PRIMARY KEY,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            workspace_id UUID NOT NULL REFERENCES workspaces(id),
            recipient_user_id UUID NOT NULL,
            category VARCHAR(16) NOT NULL,
            title VARCHAR(256) NOT NULL,
            body TEXT,
            target_to VARCHAR(512) NOT NULL,
            target_meta JSONB,
            actor_user_id UUID,
            event_name VARCHAR(128),
            dedupe_key VARCHAR(128),
            read_at TIMESTAMPTZ,
            archived_at TIMESTAMPTZ
        );
        CREATE TABLE automation_flows (
            id UUID PRIMARY KEY,
            workspace_id UUID NOT NULL REFERENCES workspaces(id)
        );
        CREATE TABLE automation_operations (
            id UUID PRIMARY KEY,
            flow_id UUID NOT NULL REFERENCES automation_flows(id),
            kind VARCHAR(32) NOT NULL,
            config JSONB
        );
        CREATE TABLE notification_campaigns (
            id UUID PRIMARY KEY,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            priority SMALLINT NOT NULL DEFAULT 0,
            display_start_at TIMESTAMPTZ,
            display_end_at TIMESTAMPTZ
        );
        CREATE TABLE notification_campaign_variants (
            id UUID PRIMARY KEY,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            campaign_id UUID NOT NULL REFERENCES notification_campaigns(id),
            locale VARCHAR(16) NOT NULL,
            revision INTEGER NOT NULL DEFAULT 1,
            is_fallback BOOLEAN NOT NULL DEFAULT FALSE,
            inbox_payload JSONB,
            email_payload JSONB,
            modal_payload JSONB,
            banner_payload JSONB,
            toast_payload JSONB
        );
        """
    )
    await conn.executemany(
        "INSERT INTO tortoise_migrations (app, name, applied_at) VALUES ('models', $1, NOW())",
        [(name,) for name in _migration_names_through_0101()],
    )


async def _insert_notification(
    conn: asyncpg.Connection,
    *,
    notification_id: UUID,
    workspace_id: UUID,
    target_to: str,
    target_meta: dict[str, object] | None,
    event_name: str | None,
) -> None:
    await conn.execute(
        """
        INSERT INTO system_notifications (
            id, created_at, updated_at, workspace_id, recipient_user_id, category, title, body,
            target_to, target_meta, actor_user_id, event_name, dedupe_key, read_at, archived_at
        ) VALUES (
            $1, NOW(), NOW(), $2, $3, 'task', 'Legacy notification', 'Migrated notification',
            $4, $5::jsonb, NULL, $6, NULL, NULL, NULL
        )
        """,
        notification_id,
        workspace_id,
        uuid4(),
        target_to,
        json.dumps(target_meta) if target_meta is not None else None,
        event_name,
    )


async def _notification_columns(conn: asyncpg.Connection) -> set[str]:
    return {
        row["column_name"]
        for row in await conn.fetch(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'system_notifications'
            """
        )
    }


async def _assert_hard_cut_rolled_back(conn: asyncpg.Connection) -> None:
    columns = await _notification_columns(conn)
    assert {"target_to", "target_meta"} <= columns
    assert not {"target", "campaign_surface"} & columns


@pytest.mark.asyncio
async def test_notification_typed_targets_migration_converts_notifications_automations_and_campaign_actions(
    integration_db_settings,
) -> None:
    database = f"arclayer_notification_targets_{uuid4().hex[:16]}"
    admin_database = os.getenv("TEST_DATABASE__ADMIN_DB", "postgres")
    workspace_id = uuid4()
    project_id = uuid4()
    site_id = uuid4()
    release_id = uuid4()
    scheduled_notification_id = uuid4()
    campaign_notification_id = uuid4()
    dev_seed_notification_id = uuid4()
    campaign_id = uuid4()
    delivery_id = uuid4()
    flow_id = uuid4()
    operation_id = uuid4()
    variant_id = uuid4()
    automation_recipient_id = uuid4()
    try:
        await _create_database(database, admin_database)
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            await _prepare_predecessor_schema(conn)
            await conn.execute("INSERT INTO workspaces (id) VALUES ($1)", workspace_id)
            await conn.execute(
                "INSERT INTO projects (id, workspace_id) VALUES ($1, $2)", project_id, workspace_id
            )
            await conn.execute(
                "INSERT INTO sites (id, workspace_id, project_id) VALUES ($1, $2, $3)",
                site_id,
                workspace_id,
                project_id,
            )
            await conn.execute(
                "INSERT INTO content_releases (id, workspace_id, site_id) VALUES ($1, $2, $3)",
                release_id,
                workspace_id,
                site_id,
            )
            await _insert_notification(
                conn,
                notification_id=scheduled_notification_id,
                workspace_id=workspace_id,
                target_to="/content/releases",
                target_meta={"releaseId": str(release_id), "jobId": str(uuid4())},
                event_name="project.release.scheduled_publish.completed",
            )
            await _insert_notification(
                conn,
                notification_id=campaign_notification_id,
                workspace_id=workspace_id,
                target_to="/notifications",
                target_meta={
                    "campaignId": str(campaign_id),
                    "deliveryId": str(delivery_id),
                    "presentation": "toast",
                    "priority": 25,
                    "displayStartAt": "2026-08-01T00:00:00+00:00",
                    "displayEndAt": "2026-08-02T00:00:00+00:00",
                    "scheduleAt": "2026-08-01T00:00:00+00:00",
                    "payload": {
                        "title": "Maintenance complete",
                        "body": "All systems are available.",
                        "action": {
                            "kind": "internal_route",
                            "label": "Open inbox",
                            "target": "/notifications",
                        },
                    },
                },
                event_name="system.broadcast",
            )
            await _insert_notification(
                conn,
                notification_id=dev_seed_notification_id,
                workspace_id=workspace_id,
                target_to="/settings/maintenance/snapshots",
                target_meta={"demo": True},
                event_name="dev.seed",
            )
            await conn.execute("INSERT INTO automation_flows (id, workspace_id) VALUES ($1, $2)", flow_id, workspace_id)
            await conn.execute(
                """
                INSERT INTO automation_operations (id, flow_id, kind, config)
                VALUES ($1, $2, 'notification', $3::jsonb)
                """,
                operation_id,
                flow_id,
                json.dumps(
                    {
                        "recipientUserId": str(automation_recipient_id),
                        "title": "Automation complete",
                        "body": "The scheduled action completed.",
                        "workflowLabel": "Scheduled publishing",
                        "targetTo": "/notifications",
                    }
                ),
            )
            await conn.execute(
                """
                INSERT INTO notification_campaigns (
                    id, created_at, updated_at, priority, display_start_at, display_end_at
                ) VALUES ($1, NOW(), NOW(), 25, '2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z')
                """,
                campaign_id,
            )
            await conn.execute(
                """
                INSERT INTO notification_campaign_variants (
                    id, created_at, updated_at, campaign_id, locale, inbox_payload,
                    email_payload, modal_payload, banner_payload, toast_payload
                ) VALUES ($1, NOW(), NOW(), $2, 'en-US', $3::jsonb, NULL, NULL, NULL, NULL)
                """,
                variant_id,
                campaign_id,
                json.dumps(
                    {
                        "title": "Campaign",
                        "body": "A typed action is required.",
                        "severity": "info",
                        "action": {
                            "kind": "internal_route",
                            "label": "Open inbox",
                            "target": "/notifications",
                        },
                    }
                ),
            )
        finally:
            await conn.close()

        await _run_upgrade(database, MIGRATION_0102)

        expected_release_target = {
            "kind": "project",
            "projectId": str(project_id),
            "destination": "website_releases",
            "entityId": str(release_id),
            "focus": "release",
        }
        expected_campaign_surface = {
            "campaignId": str(campaign_id),
            "deliveryId": str(delivery_id),
            "priority": 25,
            "displayStartAt": "2026-08-01T00:00:00+00:00",
            "displayEndAt": "2026-08-02T00:00:00+00:00",
            "presentation": "toast",
            "payload": {
                "title": "Maintenance complete",
                "body": "All systems are available.",
                "action": {
                    "kind": "internal_route",
                    "label": "Open inbox",
                    "target": {"kind": "inbox"},
                },
            },
        }
        expected_automation_config = {
            "recipientUserId": str(automation_recipient_id),
            "title": "Automation complete",
            "body": "The scheduled action completed.",
            "workflowLabel": "Scheduled publishing",
            "target": {"kind": "inbox"},
        }
        expected_variant_payload = {
            "title": "Campaign",
            "body": "A typed action is required.",
            "severity": "info",
            "action": {
                "kind": "internal_route",
                "label": "Open inbox",
                "target": {"kind": "inbox"},
            },
        }

        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            columns = await _notification_columns(conn)
            scheduled = await conn.fetchrow(
                """
                SELECT target = $2::jsonb AS target_matches, campaign_surface IS NULL AS has_no_campaign_surface
                FROM system_notifications
                WHERE id = $1
                """,
                scheduled_notification_id,
                json.dumps(expected_release_target),
            )
            campaign = await conn.fetchrow(
                """
                SELECT target = '{"kind":"inbox"}'::jsonb AS target_matches,
                       campaign_surface = $2::jsonb AS surface_matches
                FROM system_notifications
                WHERE id = $1
                """,
                campaign_notification_id,
                json.dumps(expected_campaign_surface),
            )
            dev_seed_target_matches = await conn.fetchval(
                "SELECT target = '{\"kind\":\"inbox\"}'::jsonb FROM system_notifications WHERE id = $1",
                dev_seed_notification_id,
            )
            automation_matches = await conn.fetchval(
                "SELECT config = $2::jsonb FROM automation_operations WHERE id = $1",
                operation_id,
                json.dumps(expected_automation_config),
            )
            campaign_variant_matches = await conn.fetchval(
                "SELECT inbox_payload = $2::jsonb FROM notification_campaign_variants WHERE id = $1",
                variant_id,
                json.dumps(expected_variant_payload),
            )
        finally:
            await conn.close()

        assert {"target", "campaign_surface"} <= columns
        assert not {"target_to", "target_meta"} & columns
        assert scheduled is not None
        assert scheduled["target_matches"] is True
        assert scheduled["has_no_campaign_surface"] is True
        assert campaign is not None
        assert campaign["target_matches"] is True
        assert campaign["surface_matches"] is True
        assert dev_seed_target_matches is True
        assert automation_matches is True
        assert campaign_variant_matches is True
    finally:
        await _drop_database(database, admin_database)


@pytest.mark.asyncio
@pytest.mark.parametrize("target_to", ["/not-a-supported-notification-target", "/w/legacy-workspace/notifications"])
async def test_notification_typed_targets_migration_rejects_unknown_and_legacy_routes_without_inbox_fallback(
    integration_db_settings,
    target_to: str,
) -> None:
    database = f"arclayer_notification_targets_invalid_route_{uuid4().hex[:12]}"
    admin_database = os.getenv("TEST_DATABASE__ADMIN_DB", "postgres")
    try:
        await _create_database(database, admin_database)
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            workspace_id = uuid4()
            await _prepare_predecessor_schema(conn)
            await conn.execute("INSERT INTO workspaces (id) VALUES ($1)", workspace_id)
            await _insert_notification(
                conn,
                notification_id=uuid4(),
                workspace_id=workspace_id,
                target_to=target_to,
                target_meta=None,
                event_name="automation.notification",
            )
        finally:
            await conn.close()

        with pytest.raises(AssertionError, match=r"(?i)(target|route)"):
            await _run_upgrade(database, MIGRATION_0102)

        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            await _assert_hard_cut_rolled_back(conn)
        finally:
            await conn.close()
    finally:
        await _drop_database(database, admin_database)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("config", "error_fragment"),
    [
        (
            {
                "recipientUserId": str(uuid4()),
                "title": "Legacy metadata",
                "targetTo": "/notifications",
                "targetMeta": {"event": "release.published"},
            },
            "metadata",
        ),
        (
            {
                "recipientUserId": str(uuid4()),
                "title": "Ambiguous target",
                "targetTo": "/notifications",
                "target": {"kind": "inbox"},
            },
            "typed",
        ),
    ],
)
async def test_notification_typed_targets_migration_rejects_lossy_automation_target_data(
    integration_db_settings,
    config: dict[str, object],
    error_fragment: str,
) -> None:
    database = f"arclayer_notification_targets_invalid_automation_{uuid4().hex[:12]}"
    admin_database = os.getenv("TEST_DATABASE__ADMIN_DB", "postgres")
    try:
        await _create_database(database, admin_database)
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            workspace_id = uuid4()
            flow_id = uuid4()
            await _prepare_predecessor_schema(conn)
            await conn.execute("INSERT INTO workspaces (id) VALUES ($1)", workspace_id)
            await conn.execute("INSERT INTO automation_flows (id, workspace_id) VALUES ($1, $2)", flow_id, workspace_id)
            await conn.execute(
                """
                INSERT INTO automation_operations (id, flow_id, kind, config)
                VALUES ($1, $2, 'notification', $3::jsonb)
                """,
                uuid4(),
                flow_id,
                json.dumps(config),
            )
        finally:
            await conn.close()

        with pytest.raises(AssertionError, match=rf"(?i){error_fragment}"):
            await _run_upgrade(database, MIGRATION_0102)

        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            await _assert_hard_cut_rolled_back(conn)
        finally:
            await conn.close()
    finally:
        await _drop_database(database, admin_database)


@pytest.mark.asyncio
@pytest.mark.parametrize("invalid_chain", ["missing_release", "missing_project", "workspace_mismatch"])
async def test_notification_typed_targets_migration_rejects_scheduled_release_without_one_workspace_consistent_project(
    integration_db_settings,
    invalid_chain: str,
) -> None:
    database = f"arclayer_notification_targets_invalid_release_{uuid4().hex[:12]}"
    admin_database = os.getenv("TEST_DATABASE__ADMIN_DB", "postgres")
    workspace_id = uuid4()
    release_id = uuid4()
    try:
        await _create_database(database, admin_database)
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            await _prepare_predecessor_schema(conn)
            await conn.execute("INSERT INTO workspaces (id) VALUES ($1)", workspace_id)
            if invalid_chain == "missing_project":
                site_id = uuid4()
                await conn.execute(
                    "INSERT INTO sites (id, workspace_id, project_id) VALUES ($1, $2, NULL)",
                    site_id,
                    workspace_id,
                )
                await conn.execute(
                    "INSERT INTO content_releases (id, workspace_id, site_id) VALUES ($1, $2, $3)",
                    release_id,
                    workspace_id,
                    site_id,
                )
            elif invalid_chain == "workspace_mismatch":
                other_workspace_id = uuid4()
                project_id = uuid4()
                site_id = uuid4()
                await conn.execute("INSERT INTO workspaces (id) VALUES ($1)", other_workspace_id)
                await conn.execute(
                    "INSERT INTO projects (id, workspace_id) VALUES ($1, $2)", project_id, other_workspace_id
                )
                await conn.execute(
                    "INSERT INTO sites (id, workspace_id, project_id) VALUES ($1, $2, $3)",
                    site_id,
                    workspace_id,
                    project_id,
                )
                await conn.execute(
                    "INSERT INTO content_releases (id, workspace_id, site_id) VALUES ($1, $2, $3)",
                    release_id,
                    workspace_id,
                    site_id,
                )
            await _insert_notification(
                conn,
                notification_id=uuid4(),
                workspace_id=workspace_id,
                target_to="/content/releases",
                target_meta={"releaseId": str(release_id)},
                event_name="project.release.scheduled_publish.failed",
            )
        finally:
            await conn.close()

        with pytest.raises(AssertionError, match=r"(?i)(release|project|workspace|target)"):
            await _run_upgrade(database, MIGRATION_0102)

        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            await _assert_hard_cut_rolled_back(conn)
        finally:
            await conn.close()
    finally:
        await _drop_database(database, admin_database)


@pytest.mark.asyncio
async def test_notification_typed_targets_migration_rejects_malformed_campaign_payload_without_default_target(
    integration_db_settings,
) -> None:
    database = f"arclayer_notification_targets_invalid_campaign_{uuid4().hex[:12]}"
    admin_database = os.getenv("TEST_DATABASE__ADMIN_DB", "postgres")
    try:
        await _create_database(database, admin_database)
        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            campaign_id = uuid4()
            await _prepare_predecessor_schema(conn)
            await conn.execute(
                "INSERT INTO notification_campaigns (id, created_at, updated_at) VALUES ($1, NOW(), NOW())",
                campaign_id,
            )
            await conn.execute(
                """
                INSERT INTO notification_campaign_variants (
                    id, created_at, updated_at, campaign_id, locale, inbox_payload,
                    email_payload, modal_payload, banner_payload, toast_payload
                ) VALUES ($1, NOW(), NOW(), $2, 'en-US', $3::jsonb, NULL, NULL, NULL, NULL)
                """,
                uuid4(),
                campaign_id,
                json.dumps(
                    {
                        "title": "Malformed campaign payload",
                        "action": {"kind": "internal_route", "label": "Missing target"},
                    }
                ),
            )
        finally:
            await conn.close()

        with pytest.raises(AssertionError, match=r"(?i)(campaign|payload|target)"):
            await _run_upgrade(database, MIGRATION_0102)

        conn = await asyncpg.connect(**_connection_kwargs(database=database))
        try:
            await _assert_hard_cut_rolled_back(conn)
        finally:
            await conn.close()
    finally:
        await _drop_database(database, admin_database)
