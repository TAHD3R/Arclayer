from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0002_add_deleted_at_soft_delete_columns")]

    operations = [
        ops.RunSQL(
            sql="""
ALTER TABLE domain_organizations
    ADD COLUMN IF NOT EXISTS kind VARCHAR(8) NOT NULL DEFAULT 'team';
CREATE INDEX IF NOT EXISTS idx_domain_organizations_kind
    ON domain_organizations (kind);

ALTER TABLE domain_organizations
    ADD COLUMN IF NOT EXISTS owner_user_id UUID NULL;
CREATE INDEX IF NOT EXISTS idx_domain_organizations_owner_user_id
    ON domain_organizations (owner_user_id);

ALTER TABLE domain_organizations
    ADD COLUMN IF NOT EXISTS logo_url VARCHAR(512) NULL;

ALTER TABLE domain_organizations
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
CREATE INDEX IF NOT EXISTS idx_domain_organizations_is_active
    ON domain_organizations (is_active);

ALTER TABLE domain_organizations
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_domain_organizations_deleted_at
    ON domain_organizations (deleted_at);

ALTER TABLE domain_workspaces
    ADD COLUMN IF NOT EXISTS kind VARCHAR(8) NOT NULL DEFAULT 'team';
CREATE INDEX IF NOT EXISTS idx_domain_workspaces_kind
    ON domain_workspaces (kind);

ALTER TABLE domain_workspaces
    ADD COLUMN IF NOT EXISTS owner_user_id UUID NULL;
CREATE INDEX IF NOT EXISTS idx_domain_workspaces_owner_user_id
    ON domain_workspaces (owner_user_id);

ALTER TABLE domain_workspaces
    ADD COLUMN IF NOT EXISTS description VARCHAR(256) NULL;

ALTER TABLE domain_workspaces
    ADD COLUMN IF NOT EXISTS icon_url VARCHAR(1024) NULL;

ALTER TABLE domain_workspaces
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
CREATE INDEX IF NOT EXISTS idx_domain_workspaces_is_active
    ON domain_workspaces (is_active);

ALTER TABLE domain_workspaces
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_domain_workspaces_archived_at
    ON domain_workspaces (archived_at);

ALTER TABLE domain_workspaces
    ADD COLUMN IF NOT EXISTS archived_by_user_id UUID NULL;
CREATE INDEX IF NOT EXISTS idx_domain_workspaces_archived_by_user_id
    ON domain_workspaces (archived_by_user_id);

ALTER TABLE domain_workspaces
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_domain_workspaces_deleted_at
    ON domain_workspaces (deleted_at);
""",
            reverse_sql="""
DROP INDEX IF EXISTS idx_domain_workspaces_deleted_at;
ALTER TABLE domain_workspaces
    DROP COLUMN IF EXISTS deleted_at;

DROP INDEX IF EXISTS idx_domain_workspaces_archived_by_user_id;
ALTER TABLE domain_workspaces
    DROP COLUMN IF EXISTS archived_by_user_id;

DROP INDEX IF EXISTS idx_domain_workspaces_archived_at;
ALTER TABLE domain_workspaces
    DROP COLUMN IF EXISTS archived_at;

DROP INDEX IF EXISTS idx_domain_workspaces_is_active;
ALTER TABLE domain_workspaces
    DROP COLUMN IF EXISTS is_active;

ALTER TABLE domain_workspaces
    DROP COLUMN IF EXISTS icon_url;

ALTER TABLE domain_workspaces
    DROP COLUMN IF EXISTS description;

DROP INDEX IF EXISTS idx_domain_workspaces_owner_user_id;
ALTER TABLE domain_workspaces
    DROP COLUMN IF EXISTS owner_user_id;

DROP INDEX IF EXISTS idx_domain_workspaces_kind;
ALTER TABLE domain_workspaces
    DROP COLUMN IF EXISTS kind;

DROP INDEX IF EXISTS idx_domain_organizations_deleted_at;
ALTER TABLE domain_organizations
    DROP COLUMN IF EXISTS deleted_at;

DROP INDEX IF EXISTS idx_domain_organizations_is_active;
ALTER TABLE domain_organizations
    DROP COLUMN IF EXISTS is_active;

ALTER TABLE domain_organizations
    DROP COLUMN IF EXISTS logo_url;

DROP INDEX IF EXISTS idx_domain_organizations_owner_user_id;
ALTER TABLE domain_organizations
    DROP COLUMN IF EXISTS owner_user_id;

DROP INDEX IF EXISTS idx_domain_organizations_kind;
ALTER TABLE domain_organizations
    DROP COLUMN IF EXISTS kind;
""",
        ),
    ]
