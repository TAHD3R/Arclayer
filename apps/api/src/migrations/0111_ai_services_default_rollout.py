from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0110_ai_provider_upstream_credential")]
    initial = False
    operations = [
        ops.RunSQL(
            """
            UPDATE platform_workspace_capability_rollouts
            SET stage = 'all_eligible',
                revision = revision + 1,
                updated_at = NOW()
            WHERE capability_id = 'ai-services'
              AND stage = 'not_available';
            """
        )
    ]
