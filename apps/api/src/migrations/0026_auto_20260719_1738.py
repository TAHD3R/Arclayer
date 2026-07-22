from tortoise import migrations
from tortoise.migrations import operations as ops
from tortoise import fields

class Migration(migrations.Migration):
    dependencies = [('models', '0025_auto_20260719_1701')]

    initial = False

    operations = [
        ops.AddField(
            model_name='AgentToolResponseV1Record',
            name='expected_sequence',
            field=fields.IntField(),
        ),
    ]
