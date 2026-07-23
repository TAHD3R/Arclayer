from orjson import loads
from tortoise import fields, migrations
from tortoise.fields.data import JSON_DUMPS
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0069_plugin_installation_operations")]

    initial = False

    operations = [
        ops.AddField(
            model_name="PluginInstallationRecord",
            name="configuration",
            field=fields.JSONField(default=dict, encoder=JSON_DUMPS, decoder=loads),
        )
    ]
