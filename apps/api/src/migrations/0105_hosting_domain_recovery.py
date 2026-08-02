from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0103_platform_invitation_mfa_activation")]

    initial = False

    operations = [
        ops.RunSQL(
            """
            CREATE TABLE hosting_delivery_operations (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                target_type VARCHAR(32) NOT NULL,
                target_id UUID NOT NULL,
                action VARCHAR(32) NOT NULL,
                actor_user_id UUID NOT NULL,
                idempotency_key VARCHAR(128) NOT NULL,
                source_revision TIMESTAMPTZ NOT NULL,
                before_state VARCHAR(64) NOT NULL,
                resulting_state VARCHAR(64),
                state VARCHAR(32) NOT NULL,
                verification_state VARCHAR(32) NOT NULL DEFAULT 'pending',
                source_operation_identity VARCHAR(255),
                result_reference_id UUID,
                failed_target_count INTEGER NOT NULL DEFAULT 0,
                evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
                failure_code VARCHAR(128),
                failure_message VARCHAR(512),
                completed_at TIMESTAMPTZ,
                CONSTRAINT hosting_delivery_operations_target_type_check CHECK (
                    target_type IN ('publish_job', 'hosting_continuity', 'domain_binding', 'storage_profile')
                ),
                CONSTRAINT hosting_delivery_operations_action_check CHECK (
                    action IN ('retry', 'reconcile', 'restore', 'verify_ownership', 'test_readiness')
                ),
                CONSTRAINT hosting_delivery_operations_state_check CHECK (
                    state IN ('running', 'source_confirmed', 'partial', 'outcome_unknown')
                ),
                CONSTRAINT hosting_delivery_operations_verification_state_check CHECK (
                    verification_state IN ('pending', 'confirmed', 'not_confirmed')
                ),
                CONSTRAINT hosting_delivery_operations_failed_target_count_check CHECK (
                    failed_target_count >= 0
                ),
                CONSTRAINT hosting_delivery_operations_terminal_state_check CHECK (
                    (
                        state = 'running'
                        AND verification_state = 'pending'
                        AND resulting_state IS NULL
                        AND failure_code IS NULL
                        AND failure_message IS NULL
                        AND completed_at IS NULL
                    )
                    OR
                    (
                        state IN ('source_confirmed', 'partial')
                        AND resulting_state IS NOT NULL
                        AND failure_code IS NULL
                        AND failure_message IS NULL
                        AND completed_at IS NOT NULL
                    )
                    OR
                    (
                        state = 'outcome_unknown'
                        AND verification_state = 'pending'
                        AND resulting_state IS NULL
                        AND failure_code IS NOT NULL
                        AND failure_message IS NOT NULL
                        AND completed_at IS NOT NULL
                    )
                ),
                CONSTRAINT hosting_delivery_operations_actor_key_unique UNIQUE (actor_user_id, idempotency_key)
            );
            CREATE INDEX hosting_delivery_operations_target_created_idx
                ON hosting_delivery_operations (target_type, target_id, created_at DESC);
            CREATE INDEX hosting_delivery_operations_state_updated_idx
                ON hosting_delivery_operations (state, updated_at DESC);
            """
        )
    ]
