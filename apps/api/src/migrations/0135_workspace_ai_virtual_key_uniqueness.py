from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0134_ai_run_knowledge_snapshots")]
    initial = False

    operations = [
        ops.RunSQL(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS ai_api_keys_workspace_virtual_active_idx
                ON ai_api_keys (owner_id, provider)
                WHERE owner_type = 'workspace'
                  AND key_type = 'virtual_key'
                  AND is_active = TRUE;
            """,
            reverse_sql="DROP INDEX IF EXISTS ai_api_keys_workspace_virtual_active_idx;",
        ),
    ]
