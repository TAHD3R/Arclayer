from tortoise import migrations
from tortoise.migrations import operations as ops
from tortoise import fields

class Migration(migrations.Migration):
    dependencies = [('models', '0023_auto_20260719_1518')]

    initial = False

    operations = [
        ops.AddField(
            model_name='AgentThreadV1Record',
            name='deleted_at',
            field=fields.DatetimeField(null=True, db_index=True, auto_now=False, auto_now_add=False),
        ),
    ]
