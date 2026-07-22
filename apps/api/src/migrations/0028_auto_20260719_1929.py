from tortoise import migrations
from tortoise.migrations import operations as ops
from tortoise import fields

class Migration(migrations.Migration):
    dependencies = [('models', '0027_auto_20260719_1804')]

    initial = False

    operations = [
        ops.AddField(
            model_name='AgentThreadV1Record',
            name='creation_idempotency_key',
            field=fields.CharField(null=True, max_length=192),
        ),
    ]
