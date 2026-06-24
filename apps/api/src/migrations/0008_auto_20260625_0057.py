from tortoise import migrations
from tortoise.migrations import operations as ops
from tortoise import fields

class Migration(migrations.Migration):
    dependencies = [('models', '0007_rename_all_tables')]

    initial = False

    operations = [
        ops.AddField(
            model_name='Workspace',
            name='extension_revision',
            field=fields.BigIntField(default=1),
        ),
    ]
