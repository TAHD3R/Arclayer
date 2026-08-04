from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0114_platform_skill_permissions")]
    initial = False
    operations = [
        ops.RunSQL(
            """
            UPDATE platform_roles
            SET
                updated_at = NOW(),
                name = CASE code
                    WHEN 'access-security-operator' THEN 'Access & Security Manager'
                    WHEN 'platform-operations-reader' THEN 'Operations & Monitoring Manager'
                    WHEN 'tenant-governance-operator' THEN 'Tenant Operations Manager'
                    WHEN 'commerce-operations-operator' THEN 'Plans & Billing Manager'
                    ELSE name
                END,
                description = CASE code
                    WHEN 'access-security-operator' THEN 'Manages Platform team access, roles, sign-in policy, MFA recovery, and device sessions.'
                    WHEN 'platform-operations-reader' THEN 'Reviews requests, audit activity, jobs, and operational signals without changing access policy.'
                    WHEN 'tenant-governance-operator' THEN 'Operates tenant users, workspaces, projects, support access, and governed rollouts.'
                    WHEN 'commerce-operations-operator' THEN 'Manages plans, subscriptions, credits, billing providers, and commerce reconciliation.'
                    ELSE description
                END
            WHERE code IN (
                'access-security-operator',
                'platform-operations-reader',
                'tenant-governance-operator',
                'commerce-operations-operator'
            );

            UPDATE platform_role_revisions
            SET is_current = FALSE, superseded_at = NOW(), updated_at = NOW()
            WHERE role_id = md5('arclayer:platform-role:commerce-operations-operator')::uuid
              AND is_current = TRUE;

            INSERT INTO platform_role_revisions (
                id, created_at, updated_at, role_id, sequence, is_current,
                created_by_user_id, superseded_at
            ) VALUES (
                md5('arclayer:platform-role-revision:commerce-operations-operator:2')::uuid,
                NOW(), NOW(),
                md5('arclayer:platform-role:commerce-operations-operator')::uuid,
                2, TRUE, NULL, NULL
            );

            INSERT INTO platform_role_revision_permissions (
                id, created_at, updated_at, role_revision_id, permission_id
            )
            SELECT
                md5('arclayer:platform-role-permission:commerce-operations-operator:2:' || permission.code)::uuid,
                NOW(), NOW(),
                md5('arclayer:platform-role-revision:commerce-operations-operator:2')::uuid,
                permission.id
            FROM platform_permissions AS permission
            WHERE permission.code IN (
                'platform:commerce:read',
                'platform:commerce:catalog-manage',
                'platform:commerce:subscriptions-manage',
                'platform:commerce:credits-adjust',
                'platform:commerce:provider-manage',
                'platform:commerce:events-reconcile'
            );
            """
        )
    ]
