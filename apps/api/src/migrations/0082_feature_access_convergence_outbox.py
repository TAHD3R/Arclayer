from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0081_commercial_access_fact_consumers")]

    initial = False

    operations = [
        ops.RunSQL(
            """
            CREATE TABLE commerce_feature_access_convergence_outbox (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                convergence_id UUID NOT NULL UNIQUE
                    REFERENCES commerce_plan_access_convergences(id) ON DELETE CASCADE,
                workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                fingerprint VARCHAR(64) NOT NULL,
                payload JSONB NOT NULL,
                effective_at TIMESTAMPTZ NOT NULL
            );
            CREATE INDEX commerce_feature_access_convergence_outbox_workspace_created_idx
                ON commerce_feature_access_convergence_outbox (workspace_id, created_at);
            """
        )
    ]
