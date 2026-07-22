from tortoise import migrations
from tortoise.migrations import operations as ops
from orjson import loads
from tortoise.fields.data import JSON_DUMPS
from tortoise import fields

class Migration(migrations.Migration):
    dependencies = [('models', '0052_auto_20260722_0500')]

    initial = False

    operations = [
        ops.AddField(
            model_name='SiteRevisionManifestRecord',
            name='global_section_version_pins',
            field=fields.JSONField(default=list, encoder=JSON_DUMPS, decoder=loads),
        ),
    ]
