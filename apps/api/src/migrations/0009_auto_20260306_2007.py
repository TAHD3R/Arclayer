from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    """
    Repair migration for early asset table naming mismatch.

    Historical note:
    - Some environments may have the asset table named `assetrecord` while runtime models use `assets`.
    - If `purpose` is still varchar(13), inserting `workspace_icon` (len=14) fails at runtime.
    - This migration force-expands purpose length on both possible tables.
    """

    dependencies = [("models", "0008_auto_20260306_1930")]

    initial = False

    operations = [
        ops.RunSQL(
            """
            ALTER TABLE IF EXISTS assets
              ALTER COLUMN purpose TYPE character varying(64);
            ALTER TABLE IF EXISTS assetrecord
              ALTER COLUMN purpose TYPE character varying(64);
            """,
            reverse_sql=None,
            atomic=True,
        ),
    ]
