from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0113_knowledge_guidance_tables")]
    initial = False
    operations = [
        ops.RunSQL(
            """
            INSERT INTO platform_permissions (
                id, created_at, updated_at, code, owner_domain, name_i18n,
                description_i18n, is_delegable, catalog_revision, is_active
            ) VALUES
                (
                    md5('arclayer:platform-permission:platform:ai-skills:read')::uuid,
                    NOW(), NOW(), 'platform:ai-skills:read', 'ai',
                    'platform.permission.ai_skills_read.name',
                    'platform.permission.ai_skills_read.description',
                    TRUE, 1, TRUE
                ),
                (
                    md5('arclayer:platform-permission:platform:ai-skills:manage')::uuid,
                    NOW(), NOW(), 'platform:ai-skills:manage', 'ai',
                    'platform.permission.ai_skills_manage.name',
                    'platform.permission.ai_skills_manage.description',
                    TRUE, 1, TRUE
                )
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
