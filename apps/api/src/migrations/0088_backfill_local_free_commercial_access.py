from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0087_wave7_platform_permission_hard_cut")]
    initial = False
    operations = [
        ops.RunSQL(
            """
            INSERT INTO commerce_workspace_commercial_access (
                id, created_at, updated_at, workspace_id, subscription_id,
                state, deadline_at, state_revision, source_identity
            )
            SELECT
                md5('arclayer:commerce-commercial-access:' || subscriptions.workspace_id::text)::uuid,
                NOW(),
                NOW(),
                subscriptions.workspace_id,
                subscriptions.id,
                CASE
                    WHEN subscriptions.status = 'active' THEN 'normal'
                    ELSE 'payment_restricted'
                END,
                NULL,
                1,
                'migration:0088:commercial-access:' || subscriptions.workspace_id::text
            FROM commerce_workspace_subscriptions AS subscriptions
            LEFT JOIN commerce_workspace_commercial_access AS access
                ON access.workspace_id = subscriptions.workspace_id
            WHERE access.id IS NULL
            ON CONFLICT DO NOTHING;
            """
        )
    ]
