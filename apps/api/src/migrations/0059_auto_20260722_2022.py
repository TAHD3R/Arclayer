from orjson import loads
from tortoise import fields, migrations
from tortoise.fields.data import JSON_DUMPS
from tortoise.migrations import operations as ops

from src.models.system.notification import NotificationCategory


class Migration(migrations.Migration):
    dependencies = [("models", "0058_auto_20260722_1728")]

    initial = False

    operations = [
        ops.AddField(
            model_name="BuilderGenerationRecord",
            name="design_context",
            field=fields.JSONField(null=True, encoder=JSON_DUMPS, decoder=loads),
        ),
        ops.AlterField(
            model_name="NotificationRecord",
            name="category",
            field=fields.CharEnumField(
                db_index=True,
                description="TEAM: team\nSECURITY: security\nTASK: task\nSYSTEM: system",
                enum_type=NotificationCategory,
                max_length=8,
            ),
        ),
    ]
