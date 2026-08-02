from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0092_workspace_capability_rollout")]

    initial = False

    operations = [
        ops.RunSQL(
            """
            DO $$
            DECLARE
                existing RECORD;
            BEGIN
                SELECT * INTO existing
                FROM platform_permissions
                WHERE code = 'platform:workspace-capability-rollout:apply';

                IF NOT FOUND THEN
                    INSERT INTO platform_permissions (
                        id, created_at, updated_at, code, owner_domain, name_i18n,
                        description_i18n, is_delegable, catalog_revision, is_active
                    ) VALUES (
                        md5('arclayer:platform-permission:platform:workspace-capability-rollout:apply')::uuid,
                        NOW(), NOW(), 'platform:workspace-capability-rollout:apply', 'capabilities',
                        'platform.permission.workspace_capability_rollout_apply.name',
                        'platform.permission.workspace_capability_rollout_apply.description',
                        TRUE, 1, TRUE
                    );
                ELSIF existing.id <> md5(
                    'arclayer:platform-permission:platform:workspace-capability-rollout:apply'
                )::uuid
                    OR existing.owner_domain <> 'capabilities'
                    OR existing.name_i18n <> 'platform.permission.workspace_capability_rollout_apply.name'
                    OR existing.description_i18n <> 'platform.permission.workspace_capability_rollout_apply.description'
                    OR existing.is_delegable IS NOT TRUE
                    OR existing.catalog_revision <> 1
                    OR existing.is_active IS NOT TRUE THEN
                    RAISE EXCEPTION 'Conflicting Platform permission catalog row: %',
                        'platform:workspace-capability-rollout:apply';
                END IF;
            END $$;
            """
        )
    ]
