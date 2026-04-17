from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0007_workspace_api_keys")]

    operations = [
        ops.RunSQL(
            sql="""
CREATE TABLE IF NOT EXISTS domain_content_releases (
    id UUID NOT NULL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    workspace_id UUID NOT NULL REFERENCES domain_workspaces (id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES domain_sites (id) ON DELETE CASCADE,
    release_number INT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by_user_id UUID NULL,
    activated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uid_content_releases_site_release UNIQUE (site_id, release_number)
);

CREATE INDEX IF NOT EXISTS idx_domain_content_releases_workspace_id
    ON domain_content_releases (workspace_id);

CREATE INDEX IF NOT EXISTS idx_domain_content_releases_site_id
    ON domain_content_releases (site_id);

CREATE INDEX IF NOT EXISTS idx_domain_content_releases_is_active
    ON domain_content_releases (is_active);

CREATE INDEX IF NOT EXISTS idx_domain_content_releases_created_by_user_id
    ON domain_content_releases (created_by_user_id);

ALTER TABLE domain_content_published_graph
    ADD COLUMN IF NOT EXISTS release_id UUID NULL REFERENCES domain_content_releases (id) ON DELETE CASCADE;

ALTER TABLE domain_content_publish_artifacts
    ADD COLUMN IF NOT EXISTS release_id UUID NULL REFERENCES domain_content_releases (id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS uid_content_published_graph_release_route
    ON domain_content_published_graph (release_id, site_id, locale, route_path);

CREATE UNIQUE INDEX IF NOT EXISTS uid_content_published_graph_release_item_locale
    ON domain_content_published_graph (release_id, item_id, locale);

CREATE UNIQUE INDEX IF NOT EXISTS uid_content_publish_artifacts_release_item_version_kind_locale
    ON domain_content_publish_artifacts (release_id, site_id, item_id, version_id, artifact_kind, locale);

CREATE INDEX IF NOT EXISTS idx_domain_content_published_graph_release_id
    ON domain_content_published_graph (release_id);

CREATE INDEX IF NOT EXISTS idx_domain_content_publish_artifacts_release_id
    ON domain_content_publish_artifacts (release_id);

ALTER TABLE domain_content_published_graph
    DROP CONSTRAINT IF EXISTS domain_content_published_graph_site_id_locale_route_path_key;

ALTER TABLE domain_content_published_graph
    DROP CONSTRAINT IF EXISTS domain_content_published_graph_item_id_locale_key;

ALTER TABLE domain_content_publish_artifacts
    DROP CONSTRAINT IF EXISTS domain_content_publish_artifa_site_id_2a60cf_uniq;
""",
            reverse_sql="""
DROP INDEX IF EXISTS idx_domain_content_publish_artifacts_release_id;
DROP INDEX IF EXISTS idx_domain_content_published_graph_release_id;
DROP INDEX IF EXISTS uid_content_publish_artifacts_release_item_version_kind_locale;
DROP INDEX IF EXISTS uid_content_published_graph_release_item_locale;
DROP INDEX IF EXISTS uid_content_published_graph_release_route;

ALTER TABLE domain_content_publish_artifacts
    DROP COLUMN IF EXISTS release_id;

ALTER TABLE domain_content_published_graph
    DROP COLUMN IF EXISTS release_id;

DROP INDEX IF EXISTS idx_domain_content_releases_created_by_user_id;
DROP INDEX IF EXISTS idx_domain_content_releases_is_active;
DROP INDEX IF EXISTS idx_domain_content_releases_site_id;
DROP INDEX IF EXISTS idx_domain_content_releases_workspace_id;
DROP TABLE IF EXISTS domain_content_releases;
""",
        ),
    ]
