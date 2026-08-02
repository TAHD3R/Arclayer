from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0095_feedback_ticket_revision_and_message_idempotency")]

    initial = False

    operations = [
        ops.RunSQL(
            """
            ALTER TABLE system_plugin_artifacts
                ADD COLUMN trust_state VARCHAR(16) NOT NULL DEFAULT 'unknown',
                ADD COLUMN trust_evidence JSONB NOT NULL DEFAULT '[]'::jsonb;

            ALTER TABLE system_plugin_installations
                ADD COLUMN trust_state VARCHAR(16) NOT NULL DEFAULT 'unknown',
                ADD COLUMN trust_evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
                ADD COLUMN declared_dependencies JSONB NOT NULL DEFAULT '[]'::jsonb,
                ADD COLUMN consumer_evidence JSONB NOT NULL DEFAULT '{"state":"unknown","consumers":[]}'::jsonb;

            ALTER TABLE system_plugin_operations
                ADD COLUMN audit_correlation_id VARCHAR(128),
                ADD COLUMN recovery_of_operation_id UUID,
                ADD COLUMN requested_permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
                ADD COLUMN approved_permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
                ADD COLUMN provided_capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
                ADD COLUMN step_evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
                ADD COLUMN desired_enabled BOOLEAN NOT NULL DEFAULT FALSE;

            UPDATE system_plugin_artifacts
                SET trust_state = 'verified',
                    trust_evidence = '["legacy_signed_artifact"]'::jsonb
                WHERE provenance_status IN ('signed_catalog', 'signed_manual');

            UPDATE system_plugin_installations
                SET trust_state = 'verified',
                    trust_evidence = '["legacy_verified_provenance"]'::jsonb
                WHERE provenance_status IN ('signed_catalog', 'signed_manual');

            UPDATE system_plugin_operations
                SET desired_enabled = installation.desired_enabled,
                    requested_permissions = installation.requested_permissions,
                    approved_permissions = installation.approved_permissions,
                    provided_capabilities = installation.enabled_capabilities
                FROM system_plugin_installations AS installation
                WHERE installation.id = system_plugin_operations.installation_id;

            CREATE INDEX system_plugin_artifacts_trust_state_updated_at_idx
                ON system_plugin_artifacts (trust_state, updated_at);
            CREATE INDEX system_plugin_installations_trust_state_updated_at_idx
                ON system_plugin_installations (trust_state, updated_at);
            CREATE INDEX system_plugin_operations_recovery_of_operation_id_idx
                ON system_plugin_operations (recovery_of_operation_id);
            """
        )
    ]
