from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0100_operational_signal_projection")]

    initial = False

    operations = [
        ops.RunSQL(
            """
            CREATE TABLE hosting_continuity_policy_previews (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                expected_revision BIGINT NOT NULL CHECK (expected_revision >= 0),
                proposed_continuity_window_seconds INTEGER NOT NULL
                    CHECK (proposed_continuity_window_seconds > 0),
                snapshot_hash VARCHAR(64) NOT NULL,
                snapshot JSONB NOT NULL,
                applied_policy_revision BIGINT,
                applied_actor_user_id UUID,
                applied_idempotency_key VARCHAR(128),
                applied_at TIMESTAMPTZ,
                CONSTRAINT hosting_continuity_policy_previews_apply_fields_check CHECK (
                    (applied_policy_revision IS NULL
                     AND applied_actor_user_id IS NULL
                     AND applied_idempotency_key IS NULL
                     AND applied_at IS NULL)
                    OR
                    (applied_policy_revision IS NOT NULL
                     AND applied_actor_user_id IS NOT NULL
                     AND applied_idempotency_key IS NOT NULL
                     AND applied_at IS NOT NULL)
                ),
                CONSTRAINT hosting_continuity_policy_previews_actor_key_unique
                    UNIQUE (applied_actor_user_id, applied_idempotency_key)
            );
            CREATE INDEX hosting_continuity_policy_previews_pending_idx
                ON hosting_continuity_policy_previews (expected_revision, created_at)
                WHERE applied_policy_revision IS NULL;
            """
        )
    ]
