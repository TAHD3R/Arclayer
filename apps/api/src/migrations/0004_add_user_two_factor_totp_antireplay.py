from tortoise import fields, migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0003_add_user_two_factor")]

    operations = [
        ops.AddField(
            model_name="UserTwoFactor",
            name="last_totp_counter",
            field=fields.BigIntField(null=True),
        ),
        ops.AddField(
            model_name="UserTwoFactor",
            name="last_totp_used_at",
            field=fields.DatetimeField(null=True, auto_now=False, auto_now_add=False),
        ),
    ]
