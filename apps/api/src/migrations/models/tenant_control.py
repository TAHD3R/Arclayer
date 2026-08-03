from __future__ import annotations

from src.modules.tenancy.schema import TenantMigration

_TENANT_OWNED_TABLES = (
    "system_settings",
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
    "knowledge_bases",
    "knowledge_access_policies",
    "knowledge_sources",
    "knowledge_source_versions",
    "knowledge_source_version_states",
    "knowledge_chunks",
    "skill_packages",
    "skill_versions",
    "skill_resources",
    "skill_validation_results",
    "skill_installations",
    "skill_github_imports",
    "skill_update_previews",
    "skill_installation_removals",
    "design_systems",
    "design_system_versions",
    "design_system_version_states",
    "design_system_validation_results",
    "workspace_design_system_defaults",
    "workspace_design_system_default_commands",
    "content_structure_revisions",
    "site_revision_manifests",
    "site_revision_statuses",
    "builder_initialization_commands",
    "builder_change_sets",
    "builder_change_set_commands",
    "builder_change_set_approvals",
    "builder_generations",
    "builder_composition_sagas",
    "design_system_concept_generations",
)

# system_settings is cloned into tenant schemas with the same name as the
# public.settings table (src.models.system.setting.SettingRecord). This is
# intentional -- tenant-scoped setting access is routed by isolation_mode
# and schema_name, not by table name.


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
        name="tenant_owned_tables",
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
    TenantMigration.create(
        version=7,
        name="workspace_knowledge_tables",
        sql=tuple(
            _clone_public_table_sql(table_name)
            for table_name in (
                "knowledge_bases",
                "knowledge_access_policies",
                "knowledge_sources",
                "knowledge_source_versions",
                "knowledge_source_version_states",
                "knowledge_chunks",
            )
        ),
    ),
    TenantMigration.create(
        version=8,
        name="workspace_knowledge_index_job_handoff",
        sql=(
            """
ALTER TABLE {schema}.knowledge_source_version_states
    ADD COLUMN IF NOT EXISTS index_job_id UUID NULL
""".strip(),
            """
CREATE INDEX IF NOT EXISTS idx_knowledge_version_states_index_job_id
    ON {schema}.knowledge_source_version_states (index_job_id)
            """.strip(),
        ),
    ),
    TenantMigration.create(
        version=9,
        name="workspace_knowledge_version_provenance_identity",
        sql=(
            """
DO $$
DECLARE
    constraint_record record;
BEGIN
    FOR constraint_record IN
        SELECT con.conname
        FROM pg_constraint con
        WHERE con.conrelid = '{schema}.knowledge_source_versions'::regclass
          AND con.contype = 'u'
        GROUP BY con.conname, con.conkey, con.conrelid
        HAVING ARRAY(
            SELECT attr.attname::text
            FROM unnest(con.conkey) AS column_id
            JOIN pg_attribute attr ON attr.attrelid = con.conrelid AND attr.attnum = column_id
            ORDER BY attr.attname
        ) = ARRAY['normalized_content_hash', 'source_id']
    LOOP
        EXECUTE format(
            'ALTER TABLE {schema}.knowledge_source_versions DROP CONSTRAINT %I',
            constraint_record.conname
        );
    END LOOP;
END $$;
""".strip(),
        ),
    ),
    TenantMigration.create(
        version=10,
        name="workspace_skill_tables",
        sql=tuple(
            _clone_public_table_sql(table_name)
            for table_name in (
                "skill_packages",
                "skill_versions",
                "skill_resources",
                "skill_validation_results",
                "skill_installations",
            )
        ),
    ),
    TenantMigration.create(
        version=11,
        name="workspace_skill_github_imports",
        sql=(_clone_public_table_sql("skill_github_imports"),),
    ),
    TenantMigration.create(
        version=12,
        name="workspace_skill_update_previews",
        sql=(_clone_public_table_sql("skill_update_previews"),),
    ),
    TenantMigration.create(
        version=13,
        name="workspace_skill_installation_removals",
        sql=(_clone_public_table_sql("skill_installation_removals"),),
    ),
    TenantMigration.create(
        version=14,
        name="workspace_skill_package_archive_evidence",
        sql=(
            _clone_public_table_sql("skill_package_archives"),
            """
ALTER TABLE {schema}.skill_packages
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS archived_by_user_id UUID NULL
""".strip(),
            """
CREATE INDEX IF NOT EXISTS idx_skill_packages_archived_at
    ON {schema}.skill_packages (archived_at)
""".strip(),
            """
CREATE INDEX IF NOT EXISTS idx_skill_packages_archived_by_user_id
    ON {schema}.skill_packages (archived_by_user_id)
""".strip(),
        ),
    ),
    TenantMigration.create(
        version=15,
        name="workspace_design_system_foundation",
        sql=tuple(
            _clone_public_table_sql(table_name)
            for table_name in (
                "design_systems",
                "design_system_versions",
                "design_system_validation_results",
                "workspace_design_system_defaults",
                "workspace_design_system_default_commands",
            )
        ),
    ),
    TenantMigration.create(
        version=16,
        name="project_design_system_authority",
        sql=(
            """
ALTER TABLE {schema}.design_systems
    ADD COLUMN IF NOT EXISTS forked_from_system_id UUID NULL,
    ADD COLUMN IF NOT EXISTS forked_from_version_id UUID NULL,
    ADD COLUMN IF NOT EXISTS forked_from_manifest_checksum VARCHAR(71) NULL
""".strip(),
            """
CREATE INDEX IF NOT EXISTS idx_design_systems_forked_from_system_id
    ON {schema}.design_systems (forked_from_system_id)
""".strip(),
            """
CREATE INDEX IF NOT EXISTS idx_design_systems_forked_from_version_id
    ON {schema}.design_systems (forked_from_version_id)
""".strip(),
            _clone_public_table_sql("project_design_system_assignments"),
            _clone_public_table_sql("project_design_system_commands"),
        ),
    ),
    TenantMigration.create(
        version=17,
        name="site_builder_foundation",
        sql=tuple(
            _clone_public_table_sql(table_name)
            for table_name in (
                "content_structure_revisions",
                "site_revision_manifests",
                "site_revision_statuses",
                "builder_initialization_commands",
            )
        ),
    ),
    TenantMigration.create(
        version=18,
        name="builder_change_set_preview",
        sql=tuple(
            _clone_public_table_sql(table_name)
            for table_name in (
                "builder_change_sets",
                "builder_change_set_commands",
            )
        ),
    ),
    TenantMigration.create(
        version=19,
        name="builder_change_set_approval",
        sql=(_clone_public_table_sql("builder_change_set_approvals"),),
    ),
    TenantMigration.create(
        version=20,
        name="builder_generation",
        sql=(_clone_public_table_sql("builder_generations"),),
    ),
    TenantMigration.create(
        version=21,
        name="design_system_version_lifecycle",
        sql=(
            _clone_public_table_sql("design_system_version_states"),
            """
INSERT INTO {schema}.design_system_version_states (
    id,
    created_at,
    updated_at,
    design_system_version_id,
    workspace_id,
    status,
    status_revision,
    superseded_by_version_id,
    status_changed_at,
    status_changed_by_user_id
)
SELECT
    version.id,
    version.created_at,
    COALESCE(latest_validation.created_at, version.created_at),
    version.id,
    version.workspace_id,
    COALESCE(latest_validation.status, 'candidate'),
    CASE
        WHEN version.source = 'fork' THEN GREATEST(1, validation_count.total)
        ELSE 1 + validation_count.total
    END,
    NULL,
    COALESCE(latest_validation.created_at, version.created_at),
    COALESCE(latest_validation.actor_user_id, version.created_by_user_id)
FROM {schema}.design_system_versions AS version
LEFT JOIN LATERAL (
    SELECT validation.status, validation.created_at, validation.actor_user_id
    FROM {schema}.design_system_validation_results AS validation
    WHERE validation.design_system_version_id = version.id
      AND validation.profile = 'foundation'
    ORDER BY validation.created_at DESC, validation.id DESC
    LIMIT 1
) AS latest_validation ON TRUE
LEFT JOIN LATERAL (
    SELECT COUNT(*)::INT AS total
    FROM {schema}.design_system_validation_results AS validation
    WHERE validation.design_system_version_id = version.id
      AND validation.profile = 'foundation'
) AS validation_count ON TRUE
ON CONFLICT (design_system_version_id) DO NOTHING
""".strip(),
        ),
    ),
    TenantMigration.create(
        version=22,
        name="design_system_concept_generation",
        sql=(_clone_public_table_sql("design_system_concept_generations"),),
    ),
    TenantMigration.create(
        version=23,
        name="design_system_concept_generation_agent_context",
        sql=(
            """
ALTER TABLE {schema}.design_system_concept_generations
    ALTER COLUMN agent_run_id DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS agent_assignment_id UUID NULL,
    ADD COLUMN IF NOT EXISTS agent_id UUID NULL,
    ADD COLUMN IF NOT EXISTS agent_version_id UUID NULL,
    ADD COLUMN IF NOT EXISTS builder_context JSONB NULL,
    ADD COLUMN IF NOT EXISTS design_system_context JSONB NULL
""".strip(),
            """
CREATE INDEX IF NOT EXISTS idx_design_system_concept_generations_agent_assignment_id
    ON {schema}.design_system_concept_generations (agent_assignment_id)
""".strip(),
            """
CREATE INDEX IF NOT EXISTS idx_design_system_concept_generations_agent_id
    ON {schema}.design_system_concept_generations (agent_id)
""".strip(),
            """
CREATE INDEX IF NOT EXISTS idx_design_system_concept_generations_agent_version_id
    ON {schema}.design_system_concept_generations (agent_version_id)
            """.strip(),
        ),
    ),
    TenantMigration.create(
        version=24,
        name="builder_agent_generation_context",
        sql=(
            """
ALTER TABLE {schema}.builder_change_sets
    ADD COLUMN IF NOT EXISTS agent_assignment_id UUID NULL,
    ADD COLUMN IF NOT EXISTS agent_id UUID NULL,
    ADD COLUMN IF NOT EXISTS agent_version_id UUID NULL
""".strip(),
            """
ALTER TABLE {schema}.builder_generations
    ALTER COLUMN agent_run_id DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS agent_assignment_id UUID NULL,
    ADD COLUMN IF NOT EXISTS agent_id UUID NULL,
    ADD COLUMN IF NOT EXISTS agent_version_id UUID NULL,
    ADD COLUMN IF NOT EXISTS builder_context JSONB NULL,
    ADD COLUMN IF NOT EXISTS composition_context JSONB NULL
""".strip(),
            """
ALTER TABLE {schema}.content_structure_revisions
    ADD COLUMN IF NOT EXISTS agent_assignment_id UUID NULL,
    ADD COLUMN IF NOT EXISTS agent_id UUID NULL,
    ADD COLUMN IF NOT EXISTS agent_version_id UUID NULL
""".strip(),
            """
ALTER TABLE {schema}.site_revision_manifests
    ADD COLUMN IF NOT EXISTS agent_assignment_id UUID NULL,
    ADD COLUMN IF NOT EXISTS agent_id UUID NULL,
    ADD COLUMN IF NOT EXISTS agent_version_id UUID NULL
""".strip(),
            *(
                f"""
CREATE INDEX IF NOT EXISTS idx_{table_name}_{column_name}
    ON {{schema}}.{table_name} ({column_name})
""".strip()
                for table_name in (
                    "builder_change_sets",
                    "builder_generations",
                    "content_structure_revisions",
                    "site_revision_manifests",
                )
                for column_name in (
                    "agent_assignment_id",
                    "agent_id",
                    "agent_version_id",
                )
            ),
        ),
    ),
    TenantMigration.create(
        version=25,
        name="builder_global_section_version_pins",
        sql=(
            """
ALTER TABLE {schema}.site_revision_manifests
    ADD COLUMN IF NOT EXISTS global_section_version_pins JSONB NOT NULL DEFAULT '[]'::JSONB
            """.strip(),
        ),
    ),
    TenantMigration.create(
        version=26,
        name="builder_generation_typed_targets",
        sql=(
            """
DO $migration$
DECLARE
    old_name TEXT := 'selected_page_ids';
    new_name TEXT := 'targets';
    old_column_exists BOOLEAN;
    new_column_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM pg_attribute
        WHERE attrelid = '{schema}.builder_generations'::regclass
          AND attname = old_name
          AND NOT attisdropped
    ) INTO old_column_exists;
    SELECT EXISTS (
        SELECT 1
        FROM pg_attribute
        WHERE attrelid = '{schema}.builder_generations'::regclass
          AND attname = new_name
          AND NOT attisdropped
    ) INTO new_column_exists;
    IF old_column_exists AND NOT new_column_exists THEN
        EXECUTE format(
            'ALTER TABLE %s.builder_generations RENAME COLUMN %I TO %I',
            '{schema}',
            old_name,
            new_name
        );
    END IF;
END
$migration$
""".strip(),
            """
DO $migration$
DECLARE
    old_name TEXT := 'wireframe_context';
    new_name TEXT := 'composition_context';
    old_column_exists BOOLEAN;
    new_column_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM pg_attribute
        WHERE attrelid = '{schema}.builder_generations'::regclass
          AND attname = old_name
          AND NOT attisdropped
    ) INTO old_column_exists;
    SELECT EXISTS (
        SELECT 1
        FROM pg_attribute
        WHERE attrelid = '{schema}.builder_generations'::regclass
          AND attname = new_name
          AND NOT attisdropped
    ) INTO new_column_exists;
    IF old_column_exists AND NOT new_column_exists THEN
        EXECUTE format(
            'ALTER TABLE %s.builder_generations RENAME COLUMN %I TO %I',
            '{schema}',
            old_name,
            new_name
        );
    END IF;
END
$migration$
            """.strip(),
        ),
    ),
    TenantMigration.create(
        version=27,
        name="builder_composition_saga",
        sql=(
            _clone_public_table_sql("builder_composition_sagas"),
            """
ALTER TABLE {schema}.builder_generations
    ADD COLUMN IF NOT EXISTS composition_saga_id UUID NULL,
    ADD COLUMN IF NOT EXISTS composition_saga_phase VARCHAR(16) NULL,
    ADD COLUMN IF NOT EXISTS planning_context JSONB NULL
""".strip(),
            """
CREATE INDEX IF NOT EXISTS idx_builder_generations_composition_saga_id
    ON {schema}.builder_generations (composition_saga_id)
""".strip(),
        ),
    ),
    TenantMigration.create(
        version=28,
        name="builder_design_generation_context",
        sql=(
            """
ALTER TABLE {schema}.builder_generations
    ADD COLUMN IF NOT EXISTS design_context JSONB NULL
            """.strip(),
        ),
    ),
    TenantMigration.create(
        version=29,
        name="upload_session_status_capacity",
        sql=(
            """
ALTER TABLE {schema}.upload_sessions
    ALTER COLUMN status TYPE VARCHAR(32)
    USING status::VARCHAR(32)
            """.strip(),
        ),
    ),
)
