from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0086_platform_saved_views")]
    initial = False
    operations = [
        ops.RunSQL(
            """
            DELETE FROM platform_role_revision_permissions
            WHERE permission_id IN (
                SELECT id FROM platform_permissions WHERE code IN (
                    'platform:commerce-plans:read', 'platform:commerce-plans:manage',
                    'platform:commerce-subscriptions:read', 'platform:commerce-subscriptions:manage',
                    'platform:commerce-credits:read', 'platform:commerce-credits:correct',
                    'platform:commerce-settings:read', 'platform:commerce-settings:manage'
                )
            );
            DELETE FROM platform_permissions WHERE code IN (
                'platform:commerce-plans:read', 'platform:commerce-plans:manage',
                'platform:commerce-subscriptions:read', 'platform:commerce-subscriptions:manage',
                'platform:commerce-credits:read', 'platform:commerce-credits:correct',
                'platform:commerce-settings:read', 'platform:commerce-settings:manage'
            );
            INSERT INTO platform_permissions (
                id, created_at, updated_at, code, owner_domain, name_i18n,
                description_i18n, is_delegable, catalog_revision, is_active
            ) VALUES
                (md5('arclayer:platform-permission:platform:commerce:read')::uuid, NOW(), NOW(), 'platform:commerce:read', 'commerce', 'platform.permission.commerce_read.name', 'platform.permission.commerce_read.description', TRUE, 1, TRUE),
                (md5('arclayer:platform-permission:platform:commerce:catalog-manage')::uuid, NOW(), NOW(), 'platform:commerce:catalog-manage', 'commerce', 'platform.permission.commerce_catalog_manage.name', 'platform.permission.commerce_catalog_manage.description', TRUE, 1, TRUE),
                (md5('arclayer:platform-permission:platform:commerce:subscriptions-manage')::uuid, NOW(), NOW(), 'platform:commerce:subscriptions-manage', 'commerce', 'platform.permission.commerce_subscriptions_manage.name', 'platform.permission.commerce_subscriptions_manage.description', TRUE, 1, TRUE),
                (md5('arclayer:platform-permission:platform:commerce:credits-adjust')::uuid, NOW(), NOW(), 'platform:commerce:credits-adjust', 'commerce', 'platform.permission.commerce_credits_adjust.name', 'platform.permission.commerce_credits_adjust.description', TRUE, 1, TRUE),
                (md5('arclayer:platform-permission:platform:commerce:provider-manage')::uuid, NOW(), NOW(), 'platform:commerce:provider-manage', 'commerce', 'platform.permission.commerce_provider_manage.name', 'platform.permission.commerce_provider_manage.description', TRUE, 1, TRUE),
                (md5('arclayer:platform-permission:platform:commerce:events-reconcile')::uuid, NOW(), NOW(), 'platform:commerce:events-reconcile', 'commerce', 'platform.permission.commerce_events_reconcile.name', 'platform.permission.commerce_events_reconcile.description', TRUE, 1, TRUE),
                (md5('arclayer:platform-permission:platform:ai-tasks:read')::uuid, NOW(), NOW(), 'platform:ai-tasks:read', 'ai', 'platform.permission.ai_tasks_read.name', 'platform.permission.ai_tasks_read.description', TRUE, 1, TRUE),
                (md5('arclayer:platform-permission:platform:ai-tasks:recover')::uuid, NOW(), NOW(), 'platform:ai-tasks:recover', 'ai', 'platform.permission.ai_tasks_recover.name', 'platform.permission.ai_tasks_recover.description', TRUE, 1, TRUE);
            """
        )
    ]
