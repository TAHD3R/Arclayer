from tortoise import migrations
from tortoise.migrations import operations as ops
from tortoise.indexes import Index

class Migration(migrations.Migration):
    dependencies = [('models', '0062_auto_20260723_0618')]

    initial = False

    operations = [
        ops.AddIndex(
            model_name='HTTPRequestRecord',
            index=Index(fields=['service_name', 'environment', 'occurred_at']),
        ),
        ops.AddIndex(
            model_name='HTTPRequestRecord',
            index=Index(fields=['error_code', 'occurred_at']),
        ),
    ]
