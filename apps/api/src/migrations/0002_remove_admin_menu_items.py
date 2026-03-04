from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    operations = [
        ops.DeleteModel(name="AdminMenuItem"),
    ]
