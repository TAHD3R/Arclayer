from tortoise import migrations
from tortoise.migrations import operations as ops
from tortoise import fields

class Migration(migrations.Migration):
    dependencies = [('models', '0017_auto_20260718_2214')]

    initial = False

    operations = [
        ops.AddField(
            model_name='AgentMessageV1Record',
            name='delegation_id',
            field=fields.CharField(null=True, db_index=True, max_length=192),
        ),
        ops.AddField(
            model_name='AgentMessageV1Record',
            name='parent_tool_call_id',
            field=fields.CharField(null=True, db_index=True, max_length=192),
        ),
        ops.AddField(
            model_name='AgentMessageV1Record',
            name='source_run_id',
            field=fields.CharField(null=True, db_index=True, max_length=192),
        ),
    ]
