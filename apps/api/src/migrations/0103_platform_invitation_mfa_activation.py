from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0102_notification_typed_targets")]
    initial = False
    operations = [
        ops.RunSQL(
            """
            ALTER TABLE platform_operator_invitations
                ADD COLUMN recipient_accepted_at TIMESTAMPTZ NULL,
                ADD COLUMN acceptance_idempotency_key VARCHAR(128) NULL,
                ADD COLUMN acceptance_correlation_id UUID NULL UNIQUE;

            CREATE INDEX platform_operator_invitations_acceptance_correlation_idx
                ON platform_operator_invitations(acceptance_correlation_id)
                WHERE acceptance_correlation_id IS NOT NULL;

            ALTER TABLE platform_operators
                ADD COLUMN setup_reason VARCHAR(32) NULL,
                ADD CONSTRAINT platform_operators_setup_reason_check CHECK (
                    (status = 'mfa_setup_required' AND setup_reason IN ('invitation', 'recovery'))
                    OR (status <> 'mfa_setup_required' AND setup_reason IS NULL)
                ) NOT VALID;
            UPDATE platform_operators
            SET setup_reason = 'recovery'
            WHERE status = 'mfa_setup_required';
            ALTER TABLE platform_operators
                VALIDATE CONSTRAINT platform_operators_setup_reason_check;

            ALTER TABLE platform_auth_flow_challenges
                ADD COLUMN invitation_id UUID NULL
                    REFERENCES platform_operator_invitations(id) ON DELETE CASCADE,
                ADD COLUMN invitation_revision BIGINT NULL,
                ADD COLUMN requires_phishing_resistant BOOLEAN NOT NULL DEFAULT FALSE,
                ADD CONSTRAINT platform_auth_flow_invitation_binding_check CHECK (
                    (invitation_id IS NULL AND invitation_revision IS NULL)
                    OR (invitation_id IS NOT NULL AND invitation_revision >= 1)
                );

            DROP INDEX platform_operator_invitations_one_pending_per_recipient;
            CREATE UNIQUE INDEX platform_operator_invitations_one_effective_per_recipient
                ON platform_operator_invitations (recipient_user_id)
                WHERE status IN ('pending', 'mfa_setup_required');

            CREATE INDEX platform_auth_flow_challenges_invitation_idx
                ON platform_auth_flow_challenges(invitation_id, consumed_at, expires_at)
                WHERE invitation_id IS NOT NULL;
            """
        )
    ]
