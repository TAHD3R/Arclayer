from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0093_workspace_capability_rollout_permission")]

    initial = False

    operations = [
        ops.RunSQL(
            """
            ALTER TABLE commerce_subscription_revision_transitions
                ADD COLUMN revision BIGINT NOT NULL DEFAULT 1,
                ADD CONSTRAINT commerce_subscription_revision_transitions_revision_check CHECK (revision >= 1);

            CREATE TABLE commerce_dunning_policy_command_receipts (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                provider VARCHAR(32) NOT NULL,
                provider_mode VARCHAR(8) NOT NULL,
                idempotency_key_hash VARCHAR(64) NOT NULL,
                request_fingerprint VARCHAR(64) NOT NULL,
                policy_id UUID NOT NULL REFERENCES commerce_dunning_policies(id) ON DELETE RESTRICT,
                audit_event_id UUID NOT NULL REFERENCES analytics_audit_events(id) ON DELETE RESTRICT,
                CONSTRAINT commerce_dunning_policy_command_receipts_mode_check CHECK (provider_mode IN ('test', 'live')),
                CONSTRAINT commerce_dunning_policy_command_receipts_identity_unique
                    UNIQUE (provider, provider_mode, idempotency_key_hash)
            );

            CREATE TABLE commerce_credit_adjustment_receipts (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
                idempotency_key_hash VARCHAR(64) NOT NULL,
                request_fingerprint VARCHAR(64) NOT NULL,
                result_snapshot JSONB NOT NULL,
                ledger_entry_id UUID NOT NULL REFERENCES commerce_workspace_credit_ledger(id) ON DELETE RESTRICT,
                audit_event_id UUID NOT NULL REFERENCES analytics_audit_events(id) ON DELETE RESTRICT,
                CONSTRAINT commerce_credit_adjustment_receipts_identity_unique
                    UNIQUE (workspace_id, idempotency_key_hash)
            );
            """
        )
    ]
