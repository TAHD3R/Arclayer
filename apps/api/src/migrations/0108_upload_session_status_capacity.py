from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0107_product_account_webauthn")]

    initial = False

    operations = [
        ops.RunSQL(
            """
            ALTER TABLE upload_sessions
                ALTER COLUMN status TYPE VARCHAR(32)
                USING status::VARCHAR(32);
            """
        )
    ]
