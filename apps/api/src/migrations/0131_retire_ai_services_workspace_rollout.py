from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0130_auto_20260806_0319")]
    initial = False

    operations = [
        ops.RunSQL(
            """
            DELETE FROM platform_workspace_capability_rollout_previews
            WHERE capability_id = 'ai-services';

            DELETE FROM platform_workspace_capability_rollouts
            WHERE capability_id = 'ai-services';
            """,
            reverse_sql=ops.RunSQL.noop,
        )
    ]
