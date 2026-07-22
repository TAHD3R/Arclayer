from tortoise import migrations
from tortoise.indexes import Index
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0015_auto_20260717_1019")]

    initial = False

    operations = [
        ops.AddIndex(
            model_name="StorageProfile",
            index=Index(fields=["tombstoned_at"]),
        ),
    ]
