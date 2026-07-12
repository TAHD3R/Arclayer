from tortoise import migrations
from tortoise.migrations import operations as ops
from tortoise.indexes import Index

class Migration(migrations.Migration):
    dependencies = [('models', '0007_auto_20260712_2109')]

    initial = False

    operations = [
        ops.AddIndex(
            model_name='AuditEvent',
            index=Index(fields=['project_id', 'occurred_at']),
        ),
    ]
