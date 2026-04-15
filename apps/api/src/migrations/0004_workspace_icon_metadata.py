from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0003_backfill_org_workspace_identity_columns")]

    operations = [
        ops.RunSQL(
            sql="""
ALTER TABLE domain_workspaces
    ADD COLUMN IF NOT EXISTS icon_mode VARCHAR(16) NOT NULL DEFAULT 'initials';

ALTER TABLE domain_workspaces
    ADD COLUMN IF NOT EXISTS icon_color VARCHAR(16) NOT NULL DEFAULT '#337ea9';

ALTER TABLE domain_workspaces
    ADD COLUMN IF NOT EXISTS icon_glyph VARCHAR(64) NULL;

ALTER TABLE domain_workspaces
    ADD COLUMN IF NOT EXISTS icon_emoji VARCHAR(32) NULL;

UPDATE domain_workspaces
SET icon_mode = 'image'
WHERE icon_url IS NOT NULL
  AND trim(icon_url) <> '';
""",
            reverse_sql="""
ALTER TABLE domain_workspaces
    DROP COLUMN IF EXISTS icon_emoji;

ALTER TABLE domain_workspaces
    DROP COLUMN IF EXISTS icon_glyph;

ALTER TABLE domain_workspaces
    DROP COLUMN IF EXISTS icon_color;

ALTER TABLE domain_workspaces
    DROP COLUMN IF EXISTS icon_mode;
""",
        ),
    ]
