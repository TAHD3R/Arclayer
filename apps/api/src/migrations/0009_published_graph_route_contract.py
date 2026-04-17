from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0008_content_releases")]

    operations = [
        ops.RunSQL(
            sql="""
ALTER TABLE domain_content_published_graph
    ADD COLUMN IF NOT EXISTS route_contract JSONB NULL;
""",
            reverse_sql="""
ALTER TABLE domain_content_published_graph
    DROP COLUMN IF EXISTS route_contract;
""",
        ),
    ]
