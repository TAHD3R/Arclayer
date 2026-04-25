from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0016_auto_20260420_2257")]

    operations = [
        ops.RunSQL(
            sql="""
ALTER TABLE domain_assets
    ADD COLUMN IF NOT EXISTS project_id UUID NULL;
CREATE INDEX IF NOT EXISTS idx_domain_assets_project_id
    ON domain_assets (project_id);

ALTER TABLE domain_asset_folders
    ADD COLUMN IF NOT EXISTS project_id UUID NULL;
CREATE INDEX IF NOT EXISTS idx_domain_asset_folders_project_id
    ON domain_asset_folders (project_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_domain_asset_folders_project_parent_name
    ON domain_asset_folders (project_id, parent_id, name)
    WHERE project_id IS NOT NULL;

ALTER TABLE domain_asset_tags
    ADD COLUMN IF NOT EXISTS project_id UUID NULL;
CREATE INDEX IF NOT EXISTS idx_domain_asset_tags_project_id
    ON domain_asset_tags (project_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_domain_asset_tags_project_name
    ON domain_asset_tags (project_id, name)
    WHERE project_id IS NOT NULL;

ALTER TABLE domain_asset_usages
    ADD COLUMN IF NOT EXISTS project_id UUID NULL;
CREATE INDEX IF NOT EXISTS idx_domain_asset_usages_project_id
    ON domain_asset_usages (project_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_domain_asset_usages_project_ref
    ON domain_asset_usages (project_id, entity_type, entity_id, field_key)
    WHERE project_id IS NOT NULL;

ALTER TABLE domain_upload_sessions
    ADD COLUMN IF NOT EXISTS project_id UUID NULL;
CREATE INDEX IF NOT EXISTS idx_domain_upload_sessions_project_id
    ON domain_upload_sessions (project_id);
""",
            reverse_sql="""
DROP INDEX IF EXISTS idx_domain_upload_sessions_project_id;
ALTER TABLE domain_upload_sessions
    DROP COLUMN IF EXISTS project_id;

DROP INDEX IF EXISTS uq_domain_asset_usages_project_ref;
DROP INDEX IF EXISTS idx_domain_asset_usages_project_id;
ALTER TABLE domain_asset_usages
    DROP COLUMN IF EXISTS project_id;

DROP INDEX IF EXISTS uq_domain_asset_tags_project_name;
DROP INDEX IF EXISTS idx_domain_asset_tags_project_id;
ALTER TABLE domain_asset_tags
    DROP COLUMN IF EXISTS project_id;

DROP INDEX IF EXISTS uq_domain_asset_folders_project_parent_name;
DROP INDEX IF EXISTS idx_domain_asset_folders_project_id;
ALTER TABLE domain_asset_folders
    DROP COLUMN IF EXISTS project_id;

DROP INDEX IF EXISTS idx_domain_assets_project_id;
ALTER TABLE domain_assets
    DROP COLUMN IF EXISTS project_id;
""",
        ),
    ]
