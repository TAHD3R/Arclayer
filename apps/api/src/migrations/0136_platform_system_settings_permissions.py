from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0135_workspace_ai_virtual_key_uniqueness")]
    initial = False

    operations = [
        ops.RunSQL(
            """
            INSERT INTO platform_permissions (
                id, created_at, updated_at, code, owner_domain, name_i18n,
                description_i18n, is_delegable, catalog_revision, is_active
            ) VALUES
                (md5('arclayer:platform-permission:platform:system-settings:read')::uuid, NOW(), NOW(),
                 'platform:system-settings:read', 'system-settings',
                 'platform.permission.system_settings_read.name',
                 'platform.permission.system_settings_read.description', TRUE, 1, TRUE),
                (md5('arclayer:platform-permission:platform:system-settings:manage')::uuid, NOW(), NOW(),
                 'platform:system-settings:manage', 'system-settings',
                 'platform.permission.system_settings_manage.name',
                 'platform.permission.system_settings_manage.description', TRUE, 1, TRUE)
            ON CONFLICT (code) DO UPDATE SET
                updated_at = EXCLUDED.updated_at,
                owner_domain = EXCLUDED.owner_domain,
                name_i18n = EXCLUDED.name_i18n,
                description_i18n = EXCLUDED.description_i18n,
                is_delegable = EXCLUDED.is_delegable,
                catalog_revision = EXCLUDED.catalog_revision,
                is_active = EXCLUDED.is_active;
            """
        )
    ]
