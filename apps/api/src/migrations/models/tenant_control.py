from __future__ import annotations

from src.modules.tenancy.schema import TenantMigration

_TENANT_OWNED_TABLES = (
    "internal_settings",
    "domain_content_model_definitions",
    "domain_content_model_fields",
    "domain_content_model_relations",
    "domain_content_model_views",
    "domain_content_items",
    "domain_content_versions",
    "domain_content_presentation_documents",
    "domain_content_seo_profiles",
    "domain_content_component_bindings",
    "domain_content_route_bindings",
    "domain_content_hierarchy_nodes",
    "domain_content_releases",
    "domain_content_published_graph",
    "domain_content_publish_artifacts",
    "domain_assets",
    "domain_asset_folders",
    "domain_asset_tags",
    "domain_asset_tag_links",
    "domain_asset_usages",
    "domain_upload_sessions",
    "domain_upload_parts",
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
        WHERE con.conrelid = '{schema}.domain_content_model_definitions'::regclass
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
            'ALTER TABLE {schema}.domain_content_model_definitions DROP CONSTRAINT %I',
            constraint_record.conname
        );
    END LOOP;
END $$;
""".strip(),
            "DROP INDEX IF EXISTS {schema}.idx_domain_content_model_definitions_key",
            """
ALTER TABLE {schema}.domain_content_model_definitions
    ADD COLUMN IF NOT EXISTS singular_key VARCHAR(64),
    ADD COLUMN IF NOT EXISTS plural_key VARCHAR(64)
""".strip(),
            """
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = replace('{schema}', '"', '')
          AND table_name = 'domain_content_model_definitions'
          AND column_name = 'key'
    ) THEN
        UPDATE {schema}.domain_content_model_definitions
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
ALTER TABLE {schema}.domain_content_model_definitions
    ALTER COLUMN singular_key SET NOT NULL,
    ALTER COLUMN plural_key SET NOT NULL
""".strip(),
            """
CREATE INDEX IF NOT EXISTS idx_domain_content_model_definitions_singular_key
    ON {schema}.domain_content_model_definitions (singular_key)
""".strip(),
            """
CREATE INDEX IF NOT EXISTS idx_domain_content_model_definitions_plural_key
    ON {schema}.domain_content_model_definitions (plural_key)
""".strip(),
            """
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = '{schema}.domain_content_model_definitions'::regclass
          AND conname = 'uq_domain_content_model_definitions_singular_key'
    ) THEN
        ALTER TABLE {schema}.domain_content_model_definitions
            ADD CONSTRAINT uq_domain_content_model_definitions_singular_key
            UNIQUE (workspace_id, site_id, singular_key);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = '{schema}.domain_content_model_definitions'::regclass
          AND conname = 'uq_domain_content_model_definitions_plural_key'
    ) THEN
        ALTER TABLE {schema}.domain_content_model_definitions
            ADD CONSTRAINT uq_domain_content_model_definitions_plural_key
            UNIQUE (workspace_id, site_id, plural_key);
    END IF;
END $$;
""".strip(),
            """
ALTER TABLE {schema}.domain_content_model_definitions
    DROP COLUMN IF EXISTS key
""".strip(),
        ),
    ),
    TenantMigration.create(
        version=4,
        name="content_model_update_actor",
        sql=(
            """
ALTER TABLE {schema}.domain_content_model_definitions
    ADD COLUMN IF NOT EXISTS updated_by_user_id UUID NULL
""".strip(),
            """
CREATE INDEX IF NOT EXISTS idx_domain_content_model_definitions_updated_by_user_id
    ON {schema}.domain_content_model_definitions (updated_by_user_id)
""".strip(),
        ),
    ),
)
