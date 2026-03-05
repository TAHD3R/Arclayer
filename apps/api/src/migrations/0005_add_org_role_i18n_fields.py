from tortoise import fields, migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    operations = [
        ops.AddField(
            model_name="OrganizationRole",
            name="name_i18n",
            field=fields.CharField(max_length=200, null=True),
        ),
        ops.AddField(
            model_name="OrganizationRole",
            name="description_i18n",
            field=fields.CharField(max_length=200, null=True),
        ),
    ]
