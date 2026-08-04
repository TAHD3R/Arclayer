from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0111_ai_services_default_rollout")]
    initial = False
    operations = [
        ops.RunSQL(
            """
            INSERT INTO platform_action_policies (
                id, created_at, updated_at, code, permission_id, requires_step_up,
                required_assurance, freshness_seconds, policy_revision, is_active
            ) VALUES (
                md5('arclayer:platform-action:platform.access.manage_current_mfa')::uuid,
                NOW(), NOW(), 'platform.access.manage_current_mfa',
                md5('arclayer:platform-permission:platform:access-mfa:reset')::uuid,
                TRUE, 'local_mfa', 300, 1, TRUE
            )
            ON CONFLICT (code) DO NOTHING;
            """
        )
    ]
