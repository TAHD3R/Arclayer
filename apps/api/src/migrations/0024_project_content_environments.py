from tortoise import fields, migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0023_role_permission_conditions")]

    operations = [
        ops.CreateTable(
            model_name="ProjectEnvironmentAliasRecord",
            table_name="domain_project_environment_aliases",
            fields=[
                ("id", fields.UUIDField(pk=True)),
                ("created_at", fields.DatetimeField(auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True)),
                ("key", fields.CharField(max_length=64, db_index=True)),
                ("name", fields.CharField(max_length=64)),
                ("created_by_user_id", fields.UUIDField(null=True, db_index=True)),
                ("switched_by_user_id", fields.UUIDField(null=True, db_index=True)),
                ("switched_at", fields.DatetimeField(null=True, db_index=True)),
                (
                    "project",
                    fields.ForeignKeyField(
                        "models.ProjectRecord",
                        related_name="environment_aliases",
                        on_delete=fields.CASCADE,
                    ),
                ),
                (
                    "target_environment",
                    fields.ForeignKeyField(
                        "models.ProjectEnvironmentRecord",
                        related_name="aliases",
                        on_delete=fields.CASCADE,
                    ),
                ),
            ],
            unique_together=(("project_id", "key"),),
        ),
        ops.AddField(
            model_name="ContentModelDefinitionRecord",
            name="environment",
            field=fields.ForeignKeyField(
                "models.ProjectEnvironmentRecord",
                related_name="content_model_definitions",
                on_delete=fields.CASCADE,
                null=True,
            ),
        ),
        ops.AddField(
            model_name="ContentItemRecord",
            name="environment",
            field=fields.ForeignKeyField(
                "models.ProjectEnvironmentRecord",
                related_name="content_items",
                on_delete=fields.CASCADE,
                null=True,
            ),
        ),
        ops.AddField(
            model_name="RouteBindingRecord",
            name="environment",
            field=fields.ForeignKeyField(
                "models.ProjectEnvironmentRecord",
                related_name="content_route_bindings",
                on_delete=fields.CASCADE,
                null=True,
            ),
        ),
        ops.RunSQL(
            """
INSERT INTO domain_project_environment_aliases (
    id,
    created_at,
    updated_at,
    project_id,
    target_environment_id,
    key,
    name,
    created_by_user_id
)
SELECT
    gen_random_uuid(),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    env.project_id,
    env.id,
    'master',
    'Master',
    env.created_by_user_id
FROM domain_project_environments env
WHERE env.key = 'production'
  AND NOT EXISTS (
      SELECT 1
      FROM domain_project_environment_aliases alias
      WHERE alias.project_id = env.project_id
        AND alias.key = 'master'
  )
""".strip(),
        ),
        ops.RunSQL(
            """
UPDATE domain_content_model_definitions models
SET environment_id = env.id
FROM domain_sites sites
JOIN domain_project_environments env
  ON env.project_id = sites.project_id
 AND env.key = 'production'
WHERE models.site_id = sites.id
  AND models.environment_id IS NULL
""".strip(),
        ),
        ops.RunSQL(
            """
UPDATE domain_content_items items
SET environment_id = env.id
FROM domain_sites sites
JOIN domain_project_environments env
  ON env.project_id = sites.project_id
 AND env.key = 'production'
WHERE items.site_id = sites.id
  AND items.environment_id IS NULL
""".strip(),
        ),
        ops.RunSQL(
            """
UPDATE domain_content_route_bindings bindings
SET environment_id = items.environment_id
FROM domain_content_items items
WHERE bindings.item_id = items.id
  AND bindings.environment_id IS NULL
""".strip(),
        ),
        ops.RunSQL(
            """
CREATE INDEX IF NOT EXISTS idx_domain_content_route_bindings_environment_id
    ON domain_content_route_bindings (environment_id)
""".strip(),
        ),
        ops.RunSQL(
            """
DO $$
DECLARE
    constraint_record record;
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'domain_content_model_definitions'::regclass
          AND conname = 'uq_domain_content_model_definitions_singular_key'
    ) THEN
        ALTER TABLE domain_content_model_definitions
            DROP CONSTRAINT uq_domain_content_model_definitions_singular_key;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'domain_content_model_definitions'::regclass
          AND conname = 'uq_domain_content_model_definitions_plural_key'
    ) THEN
        ALTER TABLE domain_content_model_definitions
            DROP CONSTRAINT uq_domain_content_model_definitions_plural_key;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'domain_content_items'::regclass
          AND conname = 'uid_domain_con_model__b995f5'
    ) THEN
        ALTER TABLE domain_content_items
            DROP CONSTRAINT uid_domain_con_model__b995f5;
    END IF;

    FOR constraint_record IN
        SELECT con.conname
        FROM pg_constraint con
        WHERE con.conrelid = 'domain_content_route_bindings'::regclass
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
            'ALTER TABLE domain_content_route_bindings DROP CONSTRAINT %I',
            constraint_record.conname
        );
    END LOOP;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'domain_content_model_definitions'::regclass
          AND conname = 'uq_domain_content_model_definitions_env_singular_key'
    ) THEN
        ALTER TABLE domain_content_model_definitions
            ADD CONSTRAINT uq_domain_content_model_definitions_env_singular_key
            UNIQUE (workspace_id, site_id, environment_id, singular_key);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'domain_content_model_definitions'::regclass
          AND conname = 'uq_domain_content_model_definitions_env_plural_key'
    ) THEN
        ALTER TABLE domain_content_model_definitions
            ADD CONSTRAINT uq_domain_content_model_definitions_env_plural_key
            UNIQUE (workspace_id, site_id, environment_id, plural_key);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'domain_content_items'::regclass
          AND conname = 'uq_domain_content_items_env_slug'
    ) THEN
        ALTER TABLE domain_content_items
            ADD CONSTRAINT uq_domain_content_items_env_slug
            UNIQUE (model_definition_id, environment_id, locale, slug);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'domain_content_route_bindings'::regclass
          AND conname = 'uq_domain_content_route_bindings_env_path'
    ) THEN
        ALTER TABLE domain_content_route_bindings
            ADD CONSTRAINT uq_domain_content_route_bindings_env_path
            UNIQUE (site_id, environment_id, locale, path);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'domain_content_route_bindings'::regclass
          AND conname = 'uq_domain_content_route_bindings_env_item'
    ) THEN
        ALTER TABLE domain_content_route_bindings
            ADD CONSTRAINT uq_domain_content_route_bindings_env_item
            UNIQUE (item_id, environment_id, locale);
    END IF;
END $$;
""".strip(),
        ),
    ]
