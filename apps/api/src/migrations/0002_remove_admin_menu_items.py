from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    operations = [
        # NOTE: AdminMenuItem had a self-referential FK ("parent"). Tortoise migration state
        # requires removing the reference before deleting the model, otherwise it raises:
        # IncompatibleStateError: models.AdminMenuItem is still referenced from models.AdminMenuItem
        ops.RemoveField(model_name="AdminMenuItem", name="parent"),
        ops.DeleteModel(name="AdminMenuItem"),
    ]
