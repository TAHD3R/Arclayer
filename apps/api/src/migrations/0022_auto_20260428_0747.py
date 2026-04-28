from tortoise import fields, migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0021_auto_20260428_0638")]

    operations = [
        ops.AddField(
            model_name="ContentModelDefinitionRecord",
            name="updated_by_user_id",
            field=fields.UUIDField(null=True, db_index=True),
        ),
    ]
