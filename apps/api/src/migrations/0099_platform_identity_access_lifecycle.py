from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0098_operational_signal_triage_lifecycle")]
    initial = False
    operations = [
        ops.RunSQL(
            """
            CREATE TABLE platform_role_change_previews (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                role_id UUID NOT NULL REFERENCES platform_roles(id) ON DELETE CASCADE,
                actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
                expected_role_revision_id UUID NOT NULL REFERENCES platform_role_revisions(id) ON DELETE RESTRICT,
                proposed_name VARCHAR(128) NOT NULL,
                proposed_description TEXT NULL,
                proposed_permission_codes JSONB NOT NULL,
                assignment_fingerprint VARCHAR(64) NOT NULL,
                catalog_fingerprint VARCHAR(64) NOT NULL
            );
            CREATE INDEX platform_role_change_previews_role_created_idx
                ON platform_role_change_previews(role_id, created_at);
            CREATE INDEX platform_role_change_previews_actor_created_idx
                ON platform_role_change_previews(actor_user_id, created_at);

            CREATE TABLE platform_identity_mutation_receipts (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
                action VARCHAR(64) NOT NULL,
                idempotency_key VARCHAR(128) NOT NULL,
                request_fingerprint VARCHAR(64) NOT NULL,
                entity_id UUID NOT NULL,
                correlation_id UUID NOT NULL UNIQUE,
                UNIQUE(actor_user_id, action, idempotency_key)
            );

            UPDATE platform_action_policies
            SET freshness_seconds = 300, updated_at = NOW()
            WHERE requires_step_up = TRUE AND freshness_seconds IS NULL;
            """
        )
    ]
