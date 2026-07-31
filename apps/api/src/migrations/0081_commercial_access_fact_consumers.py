from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0080_workspace_fixed_member_role_management_hard_cut")]

    initial = False

    operations = [
        ops.RunSQL(
            """
            CREATE TABLE commerce_commercial_access_facts (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                kind VARCHAR(32) NOT NULL,
                source_identity VARCHAR(255) NOT NULL,
                payload JSONB NOT NULL,
                effective_at TIMESTAMPTZ NOT NULL,
                CONSTRAINT commerce_commercial_access_facts_kind_check
                    CHECK (kind IN ('lifecycle_notification', 'hosting_handoff')),
                CONSTRAINT commerce_commercial_access_facts_identity_unique UNIQUE (kind, source_identity)
            );
            CREATE INDEX commerce_commercial_access_facts_workspace_kind_created_idx
                ON commerce_commercial_access_facts (workspace_id, kind, created_at);

            CREATE TABLE hosting_commercial_access_projections (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                workspace_id UUID NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
                state VARCHAR(32) NOT NULL DEFAULT 'serving',
                preserved_release_id UUID,
                source_identity VARCHAR(255) NOT NULL UNIQUE,
                CONSTRAINT hosting_commercial_access_projections_state_check
                    CHECK (state IN ('serving', 'continuity_required', 'suspended', 'restoration_required', 'restored'))
            );
            CREATE INDEX hosting_commercial_access_projections_state_updated_idx
                ON hosting_commercial_access_projections (state, updated_at);

            CREATE TABLE hosting_commercial_access_receipts (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                source_identity VARCHAR(255) NOT NULL UNIQUE,
                workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                resulting_state VARCHAR(32) NOT NULL,
                CONSTRAINT hosting_commercial_access_receipts_state_check
                    CHECK (resulting_state IN ('serving', 'continuity_required', 'suspended', 'restoration_required', 'restored'))
            );

            CREATE TABLE system_commercial_lifecycle_notification_deliveries (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                source_identity VARCHAR(255) NOT NULL,
                recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                channel VARCHAR(16) NOT NULL,
                state VARCHAR(16) NOT NULL DEFAULT 'pending',
                milestone VARCHAR(96) NOT NULL,
                notification_id UUID UNIQUE REFERENCES system_notifications(id) ON DELETE SET NULL,
                failure_code VARCHAR(128),
                failure_message VARCHAR(512),
                CONSTRAINT system_commercial_lifecycle_notification_channel_check CHECK (channel IN ('in_app', 'email')),
                CONSTRAINT system_commercial_lifecycle_notification_state_check
                    CHECK (state IN ('pending', 'sent', 'suppressed', 'failed')),
                CONSTRAINT system_commercial_lifecycle_notification_delivery_unique
                    UNIQUE (source_identity, recipient_user_id, channel)
            );
            CREATE INDEX system_commercial_lifecycle_notification_delivery_workspace_state_created_idx
                ON system_commercial_lifecycle_notification_deliveries (workspace_id, state, created_at);
            """
        )
    ]
