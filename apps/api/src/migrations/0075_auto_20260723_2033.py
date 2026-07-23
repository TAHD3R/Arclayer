from tortoise import migrations
from tortoise.indexes import Index
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [('models', '0074_auto_20260723_2002')]

    initial = False

    operations = [
        ops.AddIndex(
            model_name='ProjectRecord',
            index=Index(fields=['updated_at']),
        ),
    ]
