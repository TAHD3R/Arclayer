from tortoise import migrations
from tortoise.migrations import operations as ops
from orjson import loads
from tortoise.fields.data import JSON_DUMPS
from tortoise import fields

class Migration(migrations.Migration):
    dependencies = [('models', '0026_auto_20260719_1738')]

    initial = False

    operations = [
        ops.AddField(
            model_name='BackgroundJobRecord',
            name='continuation_reference',
            field=fields.JSONField(null=True, encoder=JSON_DUMPS, decoder=loads),
        ),
    ]
