from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0132_ai_global_policy_revisions")]
    initial = False

    operations = [
        ops.RunSQL(
            """
            INSERT INTO platform_permissions (
                id, created_at, updated_at, code, owner_domain, name_i18n,
                description_i18n, is_delegable, catalog_revision, is_active
            ) VALUES
                (md5('arclayer:platform-permission:platform:ai-policy:read')::uuid, NOW(), NOW(),
                 'platform:ai-policy:read', 'ai', 'platform.permission.ai_policy_read.name',
                 'platform.permission.ai_policy_read.description', TRUE, 1, TRUE),
                (md5('arclayer:platform-permission:platform:ai-policy:manage')::uuid, NOW(), NOW(),
                 'platform:ai-policy:manage', 'ai', 'platform.permission.ai_policy_manage.name',
                 'platform.permission.ai_policy_manage.description', TRUE, 1, TRUE)
            ON CONFLICT (code) DO NOTHING;
            """,
            reverse_sql=ops.RunSQL.noop,
        )
    ]
