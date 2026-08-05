from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0116_commerce_credit_sources_member_limits_and_payments")]
    initial = False
    operations = [
        ops.RunSQL(
            """
            CREATE TABLE commerce_workspace_member_credit_command_receipts (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                scope_kind VARCHAR(16) NOT NULL,
                membership_id UUID NULL,
                idempotency_key_hash VARCHAR(64) NOT NULL,
                request_fingerprint VARCHAR(64) NOT NULL,
                operation VARCHAR(16) NOT NULL,
                result_revision BIGINT NOT NULL,
                result_snapshot JSONB NOT NULL,
                audit_event_id UUID NOT NULL REFERENCES analytics_audit_events(id) ON DELETE RESTRICT,
                CONSTRAINT commerce_member_credit_receipt_scope_check CHECK (
                    (scope_kind = 'default' AND membership_id IS NULL)
                    OR (scope_kind = 'override' AND membership_id IS NOT NULL)
                ),
                CONSTRAINT commerce_member_credit_receipt_operation_check CHECK (
                    operation IN ('set_default', 'set_override', 'clear_override')
                ),
                CONSTRAINT commerce_member_credit_receipt_revision_check CHECK (result_revision >= 1),
                CONSTRAINT commerce_member_credit_receipt_identity_unique
                    UNIQUE (workspace_id, idempotency_key_hash)
            );
            CREATE INDEX commerce_member_credit_receipt_workspace_idx
                ON commerce_workspace_member_credit_command_receipts (workspace_id, created_at);
            CREATE INDEX commerce_member_credit_receipt_membership_idx
                ON commerce_workspace_member_credit_command_receipts (membership_id, created_at);
            """
        )
    ]
