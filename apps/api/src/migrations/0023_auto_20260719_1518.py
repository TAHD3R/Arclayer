from tortoise import migrations
from tortoise.migrations import operations as ops
from tortoise import fields

class Migration(migrations.Migration):
    dependencies = [('models', '0022_auto_20260719_1500')]

    initial = False

    operations = [
        ops.AddField(
            model_name='AgentRunV1Record',
            name='minimum_replay_cursor',
            field=fields.CharField(null=True, max_length=512),
        ),
        ops.AddField(
            model_name='AgentRunV1Record',
            name='minimum_replay_sequence',
            field=fields.IntField(default=1),
        ),
    ]
