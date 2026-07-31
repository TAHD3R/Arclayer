from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0082_feature_access_convergence_outbox")]

    initial = False

    operations = [
        ops.RunSQL(
            """
            ALTER TABLE commerce_subscription_revision_transition_items
                ADD COLUMN convergence_id UUID
                    REFERENCES commerce_plan_access_convergences(id) ON DELETE RESTRICT,
                ADD COLUMN requires_convergence BOOLEAN NOT NULL DEFAULT FALSE,
                ADD CONSTRAINT commerce_subscription_transition_items_convergence_check CHECK (
                    (requires_convergence AND convergence_id IS NOT NULL)
                    OR (NOT requires_convergence AND convergence_id IS NULL)
                );
            CREATE UNIQUE INDEX commerce_subscription_transition_items_convergence_unique
                ON commerce_subscription_revision_transition_items (convergence_id)
                WHERE convergence_id IS NOT NULL;
            """
        )
    ]
