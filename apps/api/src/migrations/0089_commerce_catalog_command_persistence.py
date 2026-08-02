from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0088_backfill_local_free_commercial_access")]
    initial = False
    operations = [
        ops.RunSQL(
            """
            ALTER TABLE commerce_plan_revisions
                ADD COLUMN revision BIGINT NOT NULL DEFAULT 1,
                ADD CONSTRAINT commerce_plan_revisions_revision_check CHECK (revision >= 1);

            CREATE TABLE commerce_catalog_command_receipts (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                action VARCHAR(32) NOT NULL,
                idempotency_key_hash VARCHAR(64) NOT NULL,
                request_fingerprint VARCHAR(64) NOT NULL,
                actor_user_id UUID NULL,
                actor_session_id UUID NULL,
                target_plan_code VARCHAR(48) NOT NULL,
                plan_id UUID NOT NULL REFERENCES commerce_plans(id) ON DELETE RESTRICT,
                plan_revision_id UUID NULL REFERENCES commerce_plan_revisions(id) ON DELETE RESTRICT,
                result_revision BIGINT NOT NULL,
                result_snapshot JSONB NOT NULL,
                audit_event_id UUID NOT NULL REFERENCES analytics_audit_events(id) ON DELETE RESTRICT,
                CONSTRAINT commerce_catalog_command_receipts_action_check CHECK (
                    action IN ('create_plan', 'create_draft', 'update_draft', 'publish_draft')
                ),
                CONSTRAINT commerce_catalog_command_receipts_result_revision_check CHECK (result_revision >= 0),
                CONSTRAINT commerce_catalog_command_receipts_identity_unique
                    UNIQUE (target_plan_code, action, idempotency_key_hash)
            );
            CREATE INDEX commerce_catalog_command_receipts_plan_created_idx
                ON commerce_catalog_command_receipts (plan_id, created_at);
            CREATE INDEX commerce_catalog_command_receipts_revision_created_idx
                ON commerce_catalog_command_receipts (plan_revision_id, created_at);
            """
        )
    ]
