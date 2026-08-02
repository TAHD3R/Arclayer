from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0105_hosting_domain_recovery")]
    initial = False
    operations = [
        ops.RunSQL(
            """
            CREATE TABLE agent_run_recoveries (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                run_id UUID NOT NULL REFERENCES ai_runs(id) ON DELETE RESTRICT,
                source_job_id UUID NOT NULL REFERENCES background_jobs(id) ON DELETE RESTRICT,
                recovery_job_id UUID NULL UNIQUE REFERENCES background_jobs(id) ON DELETE RESTRICT,
                action VARCHAR(16) NOT NULL,
                status VARCHAR(16) NOT NULL DEFAULT 'accepted',
                generation INTEGER NOT NULL,
                source_run_sequence INTEGER NOT NULL,
                source_job_status VARCHAR(32) NOT NULL,
                actor_user_id UUID NOT NULL,
                idempotency_key_hash VARCHAR(64) NOT NULL UNIQUE,
                request_fingerprint VARCHAR(64) NOT NULL,
                correlation_id UUID NOT NULL,
                reason VARCHAR(512) NULL,
                accepted_at TIMESTAMPTZ NOT NULL,
                completed_at TIMESTAMPTZ NULL,
                evidence JSONB NULL,
                CONSTRAINT agent_run_recoveries_action_check
                    CHECK (action IN ('retry', 'reconcile')),
                CONSTRAINT agent_run_recoveries_status_check
                    CHECK (status IN ('accepted', 'running', 'succeeded', 'failed', 'cancelled')),
                CONSTRAINT agent_run_recoveries_generation_check CHECK (generation >= 1),
                CONSTRAINT agent_run_recoveries_source_sequence_check CHECK (source_run_sequence >= 1),
                CONSTRAINT agent_run_recoveries_job_identity_check
                    CHECK (recovery_job_id IS NULL OR recovery_job_id <> source_job_id),
                CONSTRAINT agent_run_recoveries_completion_check CHECK (
                    (status IN ('accepted', 'running') AND completed_at IS NULL)
                    OR (status IN ('succeeded', 'failed', 'cancelled')
                        AND completed_at IS NOT NULL AND evidence IS NOT NULL)
                ),
                UNIQUE (run_id, generation)
            );
            CREATE INDEX agent_run_recoveries_run_status_timeline_idx
                ON agent_run_recoveries(run_id, status, accepted_at);
            CREATE INDEX agent_run_recoveries_action_idx
                ON agent_run_recoveries(action);
            CREATE INDEX agent_run_recoveries_actor_idx
                ON agent_run_recoveries(actor_user_id);
            CREATE INDEX agent_run_recoveries_correlation_idx
                ON agent_run_recoveries(correlation_id);

            CREATE TABLE agent_run_execution_effects (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                run_id UUID NOT NULL REFERENCES ai_runs(id) ON DELETE RESTRICT,
                job_id UUID NOT NULL REFERENCES background_jobs(id) ON DELETE RESTRICT,
                owner_attempt_id UUID NOT NULL REFERENCES background_job_attempts(id) ON DELETE RESTRICT,
                effect_key VARCHAR(128) NOT NULL,
                request_hash VARCHAR(64) NOT NULL,
                disposition VARCHAR(16) NOT NULL DEFAULT 'active',
                outcome JSONB NULL,
                outcome_hash VARCHAR(64) NULL,
                error_code VARCHAR(192) NULL,
                registered_at TIMESTAMPTZ NOT NULL,
                settled_at TIMESTAMPTZ NULL,
                CONSTRAINT agent_run_execution_effects_disposition_check
                    CHECK (disposition IN ('active', 'committed', 'unknown')),
                CONSTRAINT agent_run_execution_effects_evidence_check CHECK (
                    (disposition = 'active' AND settled_at IS NULL AND outcome IS NULL
                        AND outcome_hash IS NULL AND error_code IS NULL)
                    OR (disposition = 'committed' AND settled_at IS NOT NULL AND outcome IS NOT NULL
                        AND outcome_hash IS NOT NULL AND error_code IS NULL)
                    OR (disposition = 'unknown' AND settled_at IS NOT NULL AND outcome IS NULL
                        AND outcome_hash IS NULL AND error_code IS NOT NULL)
                ),
                UNIQUE (job_id, owner_attempt_id, effect_key)
            );
            CREATE INDEX agent_run_execution_effects_run_disposition_timeline_idx
                ON agent_run_execution_effects(run_id, disposition, registered_at);
            CREATE INDEX agent_run_execution_effects_job_disposition_timeline_idx
                ON agent_run_execution_effects(job_id, disposition, registered_at);
            """
        )
    ]
