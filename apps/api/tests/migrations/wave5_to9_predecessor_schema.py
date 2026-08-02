from __future__ import annotations

from uuid import UUID

import asyncpg

RETIRED_COMMERCE_PERMISSION_CODES = (
    "platform:commerce-plans:read",
    "platform:commerce-plans:manage",
    "platform:commerce-subscriptions:read",
    "platform:commerce-subscriptions:manage",
    "platform:commerce-credits:read",
    "platform:commerce-credits:correct",
    "platform:commerce-settings:read",
    "platform:commerce-settings:manage",
)


async def prepare_wave5_to7_predecessor_schema(
    conn: asyncpg.Connection,
    *,
    workspace_id: UUID,
    membership_id: UUID,
    role_id: UUID,
) -> None:
    """Create the 0079-era tables required by the 0080–0087 migration chain."""

    await conn.execute(
        """
        CREATE TABLE users (
            id UUID PRIMARY KEY,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            username VARCHAR(64) NOT NULL UNIQUE,
            email VARCHAR(255) UNIQUE,
            status VARCHAR(16) NOT NULL,
            token_version INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE system_notifications (id UUID PRIMARY KEY);
        CREATE TABLE system_roles (
            id UUID PRIMARY KEY,
            workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE
        );
        CREATE TABLE workspace_membership_roles (
            id UUID PRIMARY KEY,
            membership_id UUID NOT NULL,
            role_id UUID NOT NULL,
            CONSTRAINT workspace_membership_roles_membership_id_role_id_key
                UNIQUE (membership_id, role_id)
        );
        CREATE TABLE background_jobs (id UUID PRIMARY KEY);
        CREATE TABLE platform_permissions (
            id UUID PRIMARY KEY,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            code VARCHAR(128) NOT NULL UNIQUE,
            owner_domain VARCHAR(64) NOT NULL,
            name_i18n VARCHAR(200) NOT NULL,
            description_i18n VARCHAR(200) NOT NULL,
            is_delegable BOOLEAN NOT NULL,
            catalog_revision BIGINT NOT NULL,
            is_active BOOLEAN NOT NULL
        );
        CREATE TABLE platform_roles (
            id UUID PRIMARY KEY,
            code VARCHAR(128) NOT NULL UNIQUE,
            kind VARCHAR(32) NOT NULL,
            is_active BOOLEAN NOT NULL
        );
        CREATE TABLE platform_role_revisions (
            id UUID PRIMARY KEY,
            role_id UUID NOT NULL REFERENCES platform_roles(id) ON DELETE CASCADE,
            is_current BOOLEAN NOT NULL
        );
        CREATE TABLE platform_role_revision_permissions (
            id UUID PRIMARY KEY,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            role_revision_id UUID NOT NULL REFERENCES platform_role_revisions(id) ON DELETE CASCADE,
            permission_id UUID NOT NULL REFERENCES platform_permissions(id) ON DELETE RESTRICT,
            UNIQUE (role_revision_id, permission_id)
        );
        """
    )
    await conn.execute("INSERT INTO workspaces (id) VALUES ($1)", workspace_id)
    await conn.execute(
        "INSERT INTO system_roles (id, workspace_id) VALUES ($1, $2)",
        UUID("00000000-0000-0000-0000-000000000080"),
        workspace_id,
    )
    await conn.execute(
        "INSERT INTO workspace_membership_roles (id, membership_id, role_id) VALUES ($1, $2, $3)",
        UUID("00000000-0000-0000-0000-000000000081"),
        membership_id,
        role_id,
    )
    await _seed_platform_predecessor_catalog(conn)


async def _seed_platform_predecessor_catalog(conn: asyncpg.Connection) -> None:
    await conn.execute(
        """
        INSERT INTO platform_roles (id, code, kind, is_active) VALUES
            (md5('arclayer:test-role:tenant-governance-operator')::uuid,
                'tenant-governance-operator', 'built_in', TRUE),
            (md5('arclayer:test-role:platform-operations-reader')::uuid,
                'platform-operations-reader', 'built_in', TRUE),
            (md5('arclayer:test-role:commerce-operations-operator')::uuid,
                'commerce-operations-operator', 'built_in', TRUE);

        INSERT INTO platform_role_revisions (id, role_id, is_current)
        SELECT
            md5('arclayer:test-role-revision:' || role.code)::uuid,
            role.id,
            TRUE
        FROM platform_roles AS role;

        INSERT INTO platform_permissions (
            id, created_at, updated_at, code, owner_domain, name_i18n,
            description_i18n, is_delegable, catalog_revision, is_active
        )
        SELECT
            md5('arclayer:platform-permission:' || legacy.code)::uuid,
            NOW(), NOW(), legacy.code, 'commerce',
            'platform.permission.legacy.name', 'platform.permission.legacy.description',
            TRUE, 1, TRUE
        FROM unnest(ARRAY[
            'platform:commerce-plans:read',
            'platform:commerce-plans:manage',
            'platform:commerce-subscriptions:read',
            'platform:commerce-subscriptions:manage',
            'platform:commerce-credits:read',
            'platform:commerce-credits:correct',
            'platform:commerce-settings:read',
            'platform:commerce-settings:manage'
        ]) AS legacy(code);

        INSERT INTO platform_role_revision_permissions (
            id, created_at, updated_at, role_revision_id, permission_id
        )
        SELECT
            md5('arclayer:test-legacy-commerce-binding:' || permission.code)::uuid,
            NOW(), NOW(), revision.id, permission.id
        FROM platform_role_revisions AS revision
        JOIN platform_roles AS role ON role.id = revision.role_id
        JOIN platform_permissions AS permission ON permission.code = ANY(ARRAY[
            'platform:commerce-plans:read',
            'platform:commerce-plans:manage',
            'platform:commerce-subscriptions:read',
            'platform:commerce-subscriptions:manage',
            'platform:commerce-credits:read',
            'platform:commerce-credits:correct',
            'platform:commerce-settings:read',
            'platform:commerce-settings:manage'
        ])
        WHERE role.code = 'commerce-operations-operator';
        """
    )
