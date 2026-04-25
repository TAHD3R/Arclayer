from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0017_project_asset_scope")]

    operations = [
        ops.RunSQL(
            sql="""
ALTER TABLE domain_content_model_definitions
    ADD COLUMN IF NOT EXISTS model_kind VARCHAR(32) NOT NULL DEFAULT 'collection_type';
CREATE INDEX IF NOT EXISTS idx_domain_content_model_definitions_model_kind
    ON domain_content_model_definitions (model_kind);
""",
            reverse_sql="""
DROP INDEX IF EXISTS idx_domain_content_model_definitions_model_kind;
ALTER TABLE domain_content_model_definitions
    DROP COLUMN IF EXISTS model_kind;
""",
        ),
    ]
