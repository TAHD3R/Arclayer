from __future__ import annotations

from src.modules.tenancy.schema import TenantMigration

_TENANT_OWNED_TABLES = (
    "internal_settings",
    "content_model_definitions",
    "content_model_fields",
    "content_model_relations",
    "content_model_views",
    "content_items",
    "content_versions",
    "content_presentation_documents",
    "content_seo_profiles",
    "content_component_bindings",
    "content_route_bindings",
    "content_hierarchy_nodes",
    "content_releases",
    "content_published_graph",
    "content_publish_artifacts",
    "assets",
    "asset_folders",
    "asset_tags",
    "asset_tag_links",
    "asset_usages",
    "upload_sessions",
    "upload_parts",
)


def _clone_public_table_sql(table_name: str) -> str:
    return f"CREATE TABLE IF NOT EXISTS {{schema}}.{table_name} (LIKE public.{table_name} INCLUDING ALL)"


TENANT_CONTROL_MIGRATIONS = (
    TenantMigration.create(
        version=1,
        name="tenant_control_smoke",
        sql=(
            "CREATE TABLE IF NOT EXISTS {schema}.tenant_schema_migrations (version INT PRIMARY KEY, checksum VARCHAR(64) NOT NULL, applied_at TIMESTAMPTZ NULL, status VARCHAR(16) NOT NULL)",
            "CREATE TABLE IF NOT EXISTS {schema}.tenant_schema_smoke (id TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)",
        ),
    ),
    TenantMigration.create(
        version=2,
        name="tenant_owned_domain_tables",
        sql=tuple(_clone_public_table_sql(table_name) for table_name in _TENANT_OWNED_TABLES),
    ),
    TenantMigration.create(
        version=3,
        name="content_model_dual_identifiers",
        sql=(
            """
DO $$
DECLARE
    constraint_record record;
BEGIN
    FOR constraint_record IN
        SELECT con.conname
        FROM pg_constraint con
        WHERE con.conrelid = '{schema}.content_model_definitions'::regclass
          AND con.contype = 'u'
        GROUP BY con.conname, con.conkey, con.conrelid
        HAVING ARRAY(
            SELECT attr.attname::text
            FROM unnest(con.conkey) AS column_id
            JOIN pg_attribute attr ON attr.attrelid = con.conrelid AND attr.attnum = column_id
            ORDER BY attr.attname
        ) = ARRAY['key', 'site_id', 'workspace_id']
    LOOP
        EXECUTE format(
            'ALTER TABLE {schema}.content_model_definitions DROP CONSTRAINT %I',
            constraint_record.conname
        );
    END LOOP;
END $$;
""".strip(),
            "DROP INDEX IF EXISTS {schema}.idx_content_model_definitions_key",
            """
ALTER TABLE {schema}.content_model_definitions
    ADD COLUMN IF NOT EXISTS singular_key VARCHAR(64),
    ADD COLUMN IF NOT EXISTS plural_key VARCHAR(64)
""".strip(),
            """
DO $$
DECLARE
    constraint_record record;
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = replace('{schema}', '"', '')
          AND table_name = 'content_model_definitions'
          AND column_name = 'key'
    ) THEN
        UPDATE {schema}.content_model_definitions
        SET
            singular_key = COALESCE(singular_key, lower(trim(key))),
            plural_key = COALESCE(
                plural_key,
                CASE lower(trim(key))
                    WHEN 'category' THEN 'categories'
                    WHEN 'person' THEN 'people'
                    ELSE lower(trim(key)) || 's'
                END
            );
    END IF;
END $$;
""".strip(),
            """
ALTER TABLE {schema}.content_model_definitions
    ALTER COLUMN singular_key SET NOT NULL,
    ALTER COLUMN plural_key SET NOT NULL
""".strip(),
            """
CREATE INDEX IF NOT EXISTS idx_content_model_definitions_singular_key
    ON {schema}.content_model_definitions (singular_key)
""".strip(),
            """
CREATE INDEX IF NOT EXISTS idx_content_model_definitions_plural_key
    ON {schema}.content_model_definitions (plural_key)
""".strip(),
            """
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = '{schema}.content_model_definitions'::regclass
          AND conname = 'uq_content_model_definitions_singular_key'
    ) THEN
        ALTER TABLE {schema}.content_model_definitions
            ADD CONSTRAINT uq_content_model_definitions_singular_key
            UNIQUE (workspace_id, site_id, singular_key);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = '{schema}.content_model_definitions'::regclass
          AND conname = 'uq_content_model_definitions_plural_key'
    ) THEN
        ALTER TABLE {schema}.content_model_definitions
            ADD CONSTRAINT uq_content_model_definitions_plural_key
            UNIQUE (workspace_id, site_id, plural_key);
    END IF;
END $$;
""".strip(),
            """
ALTER TABLE {schema}.content_model_definitions
    DROP COLUMN IF EXISTS key
""".strip(),
        ),
    ),
    TenantMigration.create(
        version=4,
        name="content_model_update_actor",
        sql=(
            """
ALTER TABLE {schema}.content_model_definitions
    ADD COLUMN IF NOT EXISTS updated_by_user_id UUID NULL
""".strip(),
            """
CREATE INDEX IF NOT EXISTS idx_content_model_definitions_updated_by_user_id
    ON {schema}.content_model_definitions (updated_by_user_id)
""".strip(),
        ),
    ),
    TenantMigration.create(
        version=5,
        name="content_environment_scope",
        sql=(
            """
ALTER TABLE {schema}.content_model_definitions
    ADD COLUMN IF NOT EXISTS environment_id UUID NULL
""".strip(),
            """
ALTER TABLE {schema}.content_items
    ADD COLUMN IF NOT EXISTS environment_id UUID NULL
""".strip(),
            """
ALTER TABLE {schema}.content_route_bindings
    ADD COLUMN IF NOT EXISTS environment_id UUID NULL
""".strip(),
            """
UPDATE {schema}.content_model_definitions models
SET environment_id = env.id
FROM public.sites sites
JOIN public.project_environments env
  ON env.project_id = sites.project_id
 AND env.key = 'production'
WHERE models.site_id = sites.id
  AND models.environment_id IS NULL
""".strip(),
            """
UPDATE {schema}.content_items items
SET environment_id = env.id
FROM public.sites sites
JOIN public.project_environments env
  ON env.project_id = sites.project_id
 AND env.key = 'production'
WHERE items.site_id = sites.id
  AND items.environment_id IS NULL
""".strip(),
            """
UPDATE {schema}.content_route_bindings bindings
SET environment_id = items.environment_id
FROM {schema}.content_items items
WHERE bindings.item_id = items.id
  AND bindings.environment_id IS NULL
""".strip(),
            """
CREATE INDEX IF NOT EXISTS idx_content_model_definitions_environment_id
    ON {schema}.content_model_definitions (environment_id)
""".strip(),
            """
CREATE INDEX IF NOT EXISTS idx_content_items_environment_id
    ON {schema}.content_items (environment_id)
""".strip(),
            """
CREATE INDEX IF NOT EXISTS idx_content_route_bindings_environment_id
    ON {schema}.content_route_bindings (environment_id)
""".strip(),
            """
DO $$
DECLARE
    constraint_record record;
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = '{schema}.content_items'::regclass
          AND conname = 'uid_domain_con_model__b995f5'
    ) THEN
        ALTER TABLE {schema}.content_items
            DROP CONSTRAINT uid_domain_con_model__b995f5;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = '{schema}.content_model_definitions'::regclass
          AND conname = 'uq_content_model_definitions_singular_key'
    ) THEN
        ALTER TABLE {schema}.content_model_definitions
            DROP CONSTRAINT uq_content_model_definitions_singular_key;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = '{schema}.content_model_definitions'::regclass
          AND conname = 'uq_content_model_definitions_plural_key'
    ) THEN
        ALTER TABLE {schema}.content_model_definitions
            DROP CONSTRAINT uq_content_model_definitions_plural_key;
    END IF;

    FOR constraint_record IN
        SELECT con.conname
        FROM pg_constraint con
        WHERE con.conrelid = '{schema}.content_route_bindings'::regclass
          AND con.contype = 'u'
        GROUP BY con.conname, con.conkey, con.conrelid
        HAVING ARRAY(
            SELECT attr.attname::text
            FROM unnest(con.conkey) AS column_id
            JOIN pg_attribute attr ON attr.attrelid = con.conrelid AND attr.attnum = column_id
            ORDER BY attr.attname
        ) IN (
            ARRAY['locale', 'path', 'site_id'],
            ARRAY['item_id', 'locale']
        )
    LOOP
        EXECUTE format(
            'ALTER TABLE {schema}.content_route_bindings DROP CONSTRAINT %I',
            constraint_record.conname
        );
    END LOOP;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = '{schema}.content_model_definitions'::regclass
          AND conname = 'uq_content_model_definitions_env_singular_key'
    ) THEN
        ALTER TABLE {schema}.content_model_definitions
            ADD CONSTRAINT uq_content_model_definitions_env_singular_key
            UNIQUE (workspace_id, site_id, environment_id, singular_key);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = '{schema}.content_model_definitions'::regclass
          AND conname = 'uq_content_model_definitions_env_plural_key'
    ) THEN
        ALTER TABLE {schema}.content_model_definitions
            ADD CONSTRAINT uq_content_model_definitions_env_plural_key
            UNIQUE (workspace_id, site_id, environment_id, plural_key);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = '{schema}.content_items'::regclass
          AND conname = 'uq_content_items_env_slug'
    ) THEN
        ALTER TABLE {schema}.content_items
            ADD CONSTRAINT uq_content_items_env_slug
            UNIQUE (model_definition_id, environment_id, locale, slug);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = '{schema}.content_route_bindings'::regclass
          AND conname = 'uq_content_route_bindings_env_path'
    ) THEN
        ALTER TABLE {schema}.content_route_bindings
            ADD CONSTRAINT uq_content_route_bindings_env_path
            UNIQUE (site_id, environment_id, locale, path);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = '{schema}.content_route_bindings'::regclass
          AND conname = 'uq_content_route_bindings_env_item'
    ) THEN
        ALTER TABLE {schema}.content_route_bindings
            ADD CONSTRAINT uq_content_route_bindings_env_item
            UNIQUE (item_id, environment_id, locale);
    END IF;
END $$;
""".strip(),
        ),
    ),
    TenantMigration.create(
        version=6,
        name="scheduled_release_fields",
        sql=(
            """
ALTER TABLE {schema}.content_releases
    ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ NULL
""".strip(),
            """
ALTER TABLE {schema}.content_releases
    ALTER COLUMN activated_at DROP NOT NULL
""".strip(),
            """
CREATE INDEX IF NOT EXISTS idx_content_releases_status
    ON {schema}.content_releases (status)
""".strip(),
            """
CREATE INDEX IF NOT EXISTS idx_content_releases_scheduled_at
    ON {schema}.content_releases (scheduled_at)
""".strip(),
        ),
    ),
)
