from tortoise import fields, migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0004_add_user_two_factor_totp_antireplay")]

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
