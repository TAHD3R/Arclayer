from tortoise import migrations
from tortoise.migrations import operations as ops
from tortoise.indexes import Index

class Migration(migrations.Migration):
    dependencies = [('models', '0013_auto_20260717_0426')]

    initial = False

    operations = [
        ops.AddIndex(
            model_name='UploadSessionRecord',
            index=Index(fields=['completion_lease_until']),
        ),
    ]
