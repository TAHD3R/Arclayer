from tortoise import migrations
from tortoise.migrations import operations as ops
from tortoise import fields

class Migration(migrations.Migration):
    dependencies = [('models', '0075_auto_20260723_2033')]

    initial = False

    operations = [
        ops.RemoveConstraint(
            model_name='Organization',
            name=None,
            fields=['kind', 'owner_user_id'],
        ),
        ops.AlterField(
            model_name='Organization',
            name='owner_user_id',
            field=fields.UUIDField(null=True, unique=True),
        ),
        ops.RemoveField(model_name='Organization', name='kind'),
        ops.RemoveField(model_name='Workspace', name='kind'),
    ]
