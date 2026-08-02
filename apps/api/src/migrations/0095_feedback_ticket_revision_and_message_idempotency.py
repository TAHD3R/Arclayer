from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0094_commerce_platform_operations_receipts")]

    initial = False

    operations = [
        ops.RunSQL(
            """
            ALTER TABLE product_feedback_tickets
                ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;

            ALTER TABLE product_feedback_messages
                ADD COLUMN client_request_id VARCHAR(128),
                ADD COLUMN request_fingerprint VARCHAR(64);
            UPDATE product_feedback_messages
                SET client_request_id = 'legacy:' || id::TEXT,
                    request_fingerprint = repeat('0', 64);
            ALTER TABLE product_feedback_messages
                ALTER COLUMN client_request_id SET NOT NULL,
                ALTER COLUMN request_fingerprint SET NOT NULL,
                ADD CONSTRAINT product_feedback_messages_ticket_client_request_unique
                    UNIQUE (ticket_id, client_request_id);

            ALTER TABLE notification_deliveries
                ALTER COLUMN campaign_id DROP NOT NULL,
                ALTER COLUMN variant_id DROP NOT NULL,
                ADD COLUMN source_kind VARCHAR(32) NOT NULL DEFAULT 'campaign',
                ADD COLUMN source_identity VARCHAR(256),
                ADD COLUMN last_operator_retry_key VARCHAR(128);
            UPDATE notification_deliveries
                SET source_identity = 'campaign:' || campaign_id::TEXT || ':variant:' || variant_id::TEXT;
            ALTER TABLE notification_deliveries
                ALTER COLUMN source_identity SET NOT NULL;
            CREATE INDEX notification_deliveries_source_identity_idx
                ON notification_deliveries (source_kind, source_identity);
            ALTER TABLE notification_deliveries
                DROP CONSTRAINT notification_deliveries_campaign_id_fkey,
                ADD CONSTRAINT notification_deliveries_campaign_id_fkey
                    FOREIGN KEY (campaign_id) REFERENCES notification_campaigns(id) ON DELETE RESTRICT;
            """
        )
    ]
