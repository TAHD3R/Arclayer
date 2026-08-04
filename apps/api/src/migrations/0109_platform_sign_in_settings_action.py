from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0108_upload_session_status_capacity")]
    initial = False
    operations = [
        ops.RunSQL(
            """
            INSERT INTO platform_action_policies (
                id, created_at, updated_at, code, permission_id, requires_step_up,
                required_assurance, freshness_seconds, policy_revision, is_active
            ) VALUES (
                md5('arclayer:platform-action:platform.access.change_sign_in_settings')::uuid,
                NOW(), NOW(), 'platform.access.change_sign_in_settings',
                md5('arclayer:platform-permission:platform:access-sign-in-settings:manage')::uuid,
                TRUE, 'phishing_resistant', 300, 1, TRUE
            )
            ON CONFLICT (code) DO NOTHING;
            """
        )
    ]
