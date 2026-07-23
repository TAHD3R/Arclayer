from tortoise import migrations
from tortoise.migrations import operations as ops
from tortoise import fields

class Migration(migrations.Migration):
    dependencies = [('models', '0072_terminate_plugin_lifecycle_v1_jobs')]

    initial = False

    operations = [
        ops.AlterField(
            model_name='User',
            name='last_login_at',
            field=fields.DatetimeField(null=True, db_index=True, auto_now=False, auto_now_add=False),
        ),
    ]
