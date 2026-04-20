from tortoise import migrations
from tortoise.migrations import operations as ops

class Migration(migrations.Migration):
    dependencies = [('models', '0015_site_runtime_columns')]

    initial = False

    operations = [
        ops.RemoveField(model_name='Workspace', name='slug'),
    ]
