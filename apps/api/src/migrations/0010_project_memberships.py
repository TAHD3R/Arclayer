from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0009_published_graph_route_contract")]

    operations = [
        ops.RunSQL(
            sql="""
CREATE TABLE IF NOT EXISTS domain_projects (
    id UUID NOT NULL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    workspace_id UUID NOT NULL REFERENCES domain_workspaces (id) ON DELETE CASCADE,
    slug VARCHAR(64) NOT NULL,
    name VARCHAR(128) NOT NULL,
    description VARCHAR(256) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by_user_id UUID NULL,
    CONSTRAINT uid_domain_projects_workspace_slug UNIQUE (workspace_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_domain_projects_workspace_id
    ON domain_projects (workspace_id);

CREATE INDEX IF NOT EXISTS idx_domain_projects_slug
    ON domain_projects (slug);

CREATE INDEX IF NOT EXISTS idx_domain_projects_is_active
    ON domain_projects (is_active);

CREATE INDEX IF NOT EXISTS idx_domain_projects_created_by_user_id
    ON domain_projects (created_by_user_id);

CREATE TABLE IF NOT EXISTS domain_project_runtimes (
    id UUID NOT NULL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    project_id UUID NOT NULL REFERENCES domain_projects (id) ON DELETE CASCADE,
    kind VARCHAR(16) NOT NULL,
    name VARCHAR(64) NOT NULL DEFAULT 'Primary',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT uid_domain_project_runtimes_project_kind UNIQUE (project_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_domain_project_runtimes_project_id
    ON domain_project_runtimes (project_id);

CREATE INDEX IF NOT EXISTS idx_domain_project_runtimes_kind
    ON domain_project_runtimes (kind);

CREATE INDEX IF NOT EXISTS idx_domain_project_runtimes_is_active
    ON domain_project_runtimes (is_active);

CREATE TABLE IF NOT EXISTS domain_project_memberships (
    id UUID NOT NULL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    project_id UUID NOT NULL REFERENCES domain_projects (id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES domain_users (id) ON DELETE CASCADE,
    role VARCHAR(16) NOT NULL,
    created_by_user_id UUID NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_domain_project_memberships_project_user
    ON domain_project_memberships (project_id, user_id);

CREATE INDEX IF NOT EXISTS idx_domain_project_memberships_project_id
    ON domain_project_memberships (project_id);

CREATE INDEX IF NOT EXISTS idx_domain_project_memberships_user_id
    ON domain_project_memberships (user_id);

CREATE INDEX IF NOT EXISTS idx_domain_project_memberships_role
    ON domain_project_memberships (role);
""",
            reverse_sql="""
DROP INDEX IF EXISTS idx_domain_project_memberships_role;
DROP INDEX IF EXISTS idx_domain_project_memberships_user_id;
DROP INDEX IF EXISTS idx_domain_project_memberships_project_id;
DROP INDEX IF EXISTS idx_domain_project_memberships_project_user;
DROP TABLE IF EXISTS domain_project_memberships;

DROP INDEX IF EXISTS idx_domain_project_runtimes_is_active;
DROP INDEX IF EXISTS idx_domain_project_runtimes_kind;
DROP INDEX IF EXISTS idx_domain_project_runtimes_project_id;
DROP TABLE IF EXISTS domain_project_runtimes;

DROP INDEX IF EXISTS idx_domain_projects_created_by_user_id;
DROP INDEX IF EXISTS idx_domain_projects_is_active;
DROP INDEX IF EXISTS idx_domain_projects_slug;
DROP INDEX IF EXISTS idx_domain_projects_workspace_id;
DROP TABLE IF EXISTS domain_projects;

""",
        ),
    ]
