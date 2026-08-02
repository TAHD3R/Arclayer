from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0090_hosting_continuity_lifecycle")]

    initial = False

    operations = [
        ops.RunSQL(
            """
            ALTER TABLE system_commercial_lifecycle_notification_deliveries
                ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0,
                ADD COLUMN processing_at TIMESTAMPTZ,
                ADD COLUMN claim_job_attempt_id UUID,
                ADD COLUMN claim_fencing_token UUID,
                ADD COLUMN claim_lease_until TIMESTAMPTZ,
                ADD COLUMN is_retryable BOOLEAN NOT NULL DEFAULT FALSE;
            ALTER TABLE system_commercial_lifecycle_notification_deliveries
                DROP CONSTRAINT system_commercial_lifecycle_notification_state_check,
                ADD CONSTRAINT system_commercial_lifecycle_notification_state_check
                    CHECK (state IN ('pending', 'processing', 'sent', 'suppressed', 'failed'));
            CREATE INDEX system_commercial_lifecycle_notification_delivery_retry_idx
                ON system_commercial_lifecycle_notification_deliveries (state, is_retryable)
                WHERE state = 'failed' AND is_retryable;
            CREATE INDEX system_commercial_lifecycle_notification_delivery_claim_lease_idx
                ON system_commercial_lifecycle_notification_deliveries (claim_lease_until)
                WHERE state = 'processing';

            CREATE TABLE system_commercial_lifecycle_notification_delivery_attempts (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                delivery_id UUID NOT NULL
                    REFERENCES system_commercial_lifecycle_notification_deliveries(id) ON DELETE CASCADE,
                attempt_number INTEGER NOT NULL,
                state VARCHAR(16) NOT NULL,
                completed_at TIMESTAMPTZ,
                failure_code VARCHAR(128),
                failure_message VARCHAR(512),
                CONSTRAINT system_commercial_lifecycle_notification_delivery_attempt_state_check
                    CHECK (state IN ('processing', 'sent', 'suppressed', 'failed')),
                CONSTRAINT system_commercial_lifecycle_notification_delivery_attempt_unique
                    UNIQUE (delivery_id, attempt_number)
            );
            CREATE INDEX system_commercial_lifecycle_notification_delivery_attempt_timeline_idx
                ON system_commercial_lifecycle_notification_delivery_attempts (delivery_id, attempt_number);

            CREATE TABLE system_commercial_lifecycle_notification_critical_failures (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                source_identity VARCHAR(255) NOT NULL UNIQUE,
                milestone VARCHAR(96) NOT NULL,
                failure_code VARCHAR(128) NOT NULL,
                billing_contact_count INTEGER NOT NULL CHECK (billing_contact_count > 0)
            );
            """
        )
    ]
