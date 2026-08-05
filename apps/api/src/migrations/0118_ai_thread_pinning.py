from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0117_workspace_member_credit_command_receipts")]
    initial = False
    operations = [
        ops.RunSQL(
            """
            ALTER TABLE ai_threads
                ADD COLUMN is_pinned BOOLEAN NOT NULL DEFAULT FALSE;
            CREATE INDEX ai_threads_owner_pinned_updated_idx
                ON ai_threads (workspace_id, owner_user_id, is_pinned, updated_at, id);
            """
        )
    ]
