from tortoise import migrations
from tortoise.migrations import operations as ops

class Migration(migrations.Migration):
    dependencies = [('models', '0064_auto_20260723_0651')]

    initial = False

    operations = [
        ops.RunSQL(
            """
            INSERT INTO access_restrictions (
                id, created_at, updated_at, entity_type, entity_id, restriction_type, state,
                reason_category, reason_code, operator_note, effective_at, revision
            )
            SELECT
                md5('arclayer:access-restriction:user:' || id::text)::uuid,
                NOW(), NOW(), 'user', id, 'user_disabled', 'active', 'other',
                'legacy_state_migration',
                'Migrated from the disabled user state during the access-restriction hard cut.',
                COALESCE(updated_at, NOW()), 1
            FROM users
            WHERE status = 'disabled'
            ON CONFLICT (entity_type, entity_id, restriction_type) DO NOTHING;

            INSERT INTO access_restrictions (
                id, created_at, updated_at, entity_type, entity_id, restriction_type, state,
                reason_category, reason_code, operator_note, effective_at, revision
            )
            SELECT
                md5('arclayer:access-restriction:workspace-archived:' || id::text)::uuid,
                NOW(), NOW(), 'workspace', id, 'workspace_archived', 'active', 'owner_request',
                'legacy_state_migration',
                'Migrated from the archived workspace lifecycle state during the access-restriction hard cut.',
                COALESCE(archived_at, updated_at, NOW()), 1
            FROM workspaces
            WHERE archived_at IS NOT NULL AND deleted_at IS NULL
            ON CONFLICT (entity_type, entity_id, restriction_type) DO NOTHING;

            INSERT INTO access_restrictions (
                id, created_at, updated_at, entity_type, entity_id, restriction_type, state,
                reason_category, reason_code, operator_note, effective_at, revision
            )
            SELECT
                md5('arclayer:access-restriction:workspace-suspended:' || id::text)::uuid,
                NOW(), NOW(), 'workspace', id, 'workspace_suspended', 'active', 'other',
                'legacy_state_migration',
                'Migrated from the inactive workspace state during the access-restriction hard cut.',
                COALESCE(updated_at, NOW()), 1
            FROM workspaces
            WHERE is_active = FALSE AND deleted_at IS NULL
            ON CONFLICT (entity_type, entity_id, restriction_type) DO NOTHING;

            UPDATE workspaces
            SET is_active = TRUE, updated_at = NOW()
            WHERE is_active = FALSE AND deleted_at IS NULL;

            INSERT INTO access_restrictions (
                id, created_at, updated_at, entity_type, entity_id, restriction_type, state,
                reason_category, reason_code, operator_note, effective_at, revision
            )
            SELECT
                md5('arclayer:access-restriction:project-suspended:' || project.id::text)::uuid,
                NOW(), NOW(), 'project', project.id, 'project_suspended', 'active', 'other',
                'legacy_state_migration',
                'Migrated from an inactive project without a lifecycle archive event.',
                COALESCE(project.updated_at, NOW()), 1
            FROM projects AS project
            WHERE project.is_active = FALSE
              AND NOT EXISTS (
                  SELECT 1
                  FROM analytics_audit_events AS event
                  WHERE event.entity_type = 'project'
                    AND event.entity_id = project.id
                    AND event.event_name = 'project.archived'
              )
            ON CONFLICT (entity_type, entity_id, restriction_type) DO NOTHING;
            """,
            """
            UPDATE workspaces AS workspace
            SET is_active = FALSE, updated_at = NOW()
            WHERE EXISTS (
                SELECT 1
                FROM access_restrictions AS restriction
                WHERE restriction.entity_type = 'workspace'
                  AND restriction.entity_id = workspace.id
                  AND restriction.restriction_type = 'workspace_suspended'
                  AND restriction.reason_code = 'legacy_state_migration'
            );

            DELETE FROM access_restrictions
            WHERE reason_code = 'legacy_state_migration';
            """,
        ),
    ]
