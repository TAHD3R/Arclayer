from tortoise import fields, migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0022_auto_20260428_0747")]

    operations = [
        ops.AddField(
            model_name="RolePermission",
            name="conditions",
            field=fields.JSONField(default=list),
        ),
    ]
