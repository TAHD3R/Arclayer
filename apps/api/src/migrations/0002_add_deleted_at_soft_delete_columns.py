from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0001_initial")]

    operations = [
        ops.RunSQL(
            sql="""
ALTER TABLE domain_assets
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_domain_assets_deleted_at
    ON domain_assets (deleted_at);

ALTER TABLE domain_organizations
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_domain_organizations_deleted_at
    ON domain_organizations (deleted_at);

ALTER TABLE domain_workspaces
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_domain_workspaces_deleted_at
    ON domain_workspaces (deleted_at);
""",
            reverse_sql="""
DROP INDEX IF EXISTS idx_domain_workspaces_deleted_at;
ALTER TABLE domain_workspaces
    DROP COLUMN IF EXISTS deleted_at;

DROP INDEX IF EXISTS idx_domain_organizations_deleted_at;
ALTER TABLE domain_organizations
    DROP COLUMN IF EXISTS deleted_at;

DROP INDEX IF EXISTS idx_domain_assets_deleted_at;
ALTER TABLE domain_assets
    DROP COLUMN IF EXISTS deleted_at;
""",
        ),
    ]
