from tortoise import fields, migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0002_auto_20260502_1844")]

    initial = False

    operations = [
        ops.AddField(
            model_name="User",
            name="email_verified_at",
            field=fields.DatetimeField(null=True, db_index=True, auto_now=False, auto_now_add=False),
        ),
        ops.RunSQL(
            sql="UPDATE users SET email_verified_at = updated_at WHERE email IS NOT NULL AND email_verified_at IS NULL",
            reverse_sql="UPDATE users SET email_verified_at = NULL",
        ),
    ]
