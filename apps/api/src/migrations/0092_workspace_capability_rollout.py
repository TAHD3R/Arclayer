from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0091_commercial_lifecycle_notification_delivery_attempts")]

    initial = False

    operations = [
        ops.RunSQL(
            """
            CREATE TABLE platform_workspace_capability_rollouts (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                capability_id VARCHAR(128) NOT NULL UNIQUE,
                stage VARCHAR(32) NOT NULL,
                revision BIGINT NOT NULL DEFAULT 0,
                selection_revision BIGINT NOT NULL DEFAULT 0,
                CONSTRAINT platform_workspace_capability_rollouts_stage_check
                    CHECK (stage IN ('not_available', 'selected_workspaces', 'all_eligible'))
            );
            CREATE TABLE platform_workspace_capability_rollout_selections (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                rollout_id UUID NOT NULL REFERENCES platform_workspace_capability_rollouts(id) ON DELETE CASCADE,
                workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                CONSTRAINT platform_workspace_capability_rollout_selections_unique UNIQUE (rollout_id, workspace_id)
            );
            CREATE INDEX platform_workspace_capability_rollout_selections_workspace_rollout_idx
                ON platform_workspace_capability_rollout_selections (workspace_id, rollout_id);

            CREATE TABLE platform_workspace_capability_rollout_previews (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                capability_id VARCHAR(128) NOT NULL,
                source_revision BIGINT NOT NULL,
                source_selection_revision BIGINT NOT NULL,
                capability_revision BIGINT NOT NULL,
                eligibility_revision BIGINT NOT NULL,
                eligibility_snapshot_hash VARCHAR(64) NOT NULL,
                proposed_stage VARCHAR(32) NOT NULL,
                proposed_workspace_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
                snapshot JSONB NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL,
                applied_actor_user_id UUID,
                applied_idempotency_key VARCHAR(128),
                applied_rollout_revision BIGINT,
                applied_selection_revision BIGINT,
                applied_at TIMESTAMPTZ,
                CONSTRAINT platform_workspace_capability_rollout_previews_stage_check
                    CHECK (proposed_stage IN ('not_available', 'selected_workspaces', 'all_eligible')),
                CONSTRAINT platform_workspace_capability_rollout_previews_idempotency_pair_check
                    CHECK (
                        (applied_actor_user_id IS NULL AND applied_idempotency_key IS NULL)
                        OR (applied_actor_user_id IS NOT NULL AND applied_idempotency_key IS NOT NULL)
                    )
            );
            CREATE INDEX platform_workspace_capability_rollout_previews_capability_created_idx
                ON platform_workspace_capability_rollout_previews (capability_id, created_at);
            CREATE INDEX platform_workspace_capability_rollout_previews_capability_revision_idx
                ON platform_workspace_capability_rollout_previews (capability_id, source_revision);
            CREATE UNIQUE INDEX platform_workspace_capability_rollout_previews_actor_idempotency_unique
                ON platform_workspace_capability_rollout_previews (applied_actor_user_id, applied_idempotency_key)
                WHERE applied_actor_user_id IS NOT NULL AND applied_idempotency_key IS NOT NULL;
            """
        )
    ]
