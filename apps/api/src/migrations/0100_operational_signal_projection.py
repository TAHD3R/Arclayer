from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0099_platform_identity_access_lifecycle")]
    initial = False
    operations = [
        ops.RunSQL(
            """
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM operational_signal_triage
                    WHERE signal_id <> source_job_id
                ) THEN
                    RAISE EXCEPTION '0100 operational signal projection blocked: triage source identity is ambiguous';
                END IF;

                IF EXISTS (
                    SELECT 1
                    FROM operational_signal_triage AS triage
                    LEFT JOIN background_jobs AS job ON job.id = triage.source_job_id
                    WHERE job.id IS NULL
                ) THEN
                    RAISE EXCEPTION '0100 operational signal projection blocked: triage source job is missing';
                END IF;

                IF EXISTS (
                    SELECT 1
                    FROM operational_signal_triage AS triage
                    JOIN background_jobs AS job ON job.id = triage.source_job_id
                    WHERE job.internal_status NOT IN ('failed', 'dead_lettered', 'succeeded', 'cancelled')
                ) THEN
                    RAISE EXCEPTION '0100 operational signal projection blocked: triage source lifecycle is not terminal';
                END IF;
            END $$;

            CREATE TABLE operational_signal_projections (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                source_domain VARCHAR(64) NOT NULL,
                signal_type VARCHAR(128) NOT NULL,
                source_reference_type VARCHAR(96) NOT NULL,
                source_reference_id UUID NOT NULL,
                severity VARCHAR(16) NOT NULL,
                detected_at TIMESTAMPTZ NOT NULL,
                source_observed_at TIMESTAMPTZ NOT NULL,
                priority_rank INTEGER NOT NULL,
                priority_reason_keys JSONB NOT NULL,
                title_key VARCHAR(192) NOT NULL,
                explanation_key VARCHAR(192) NOT NULL,
                impact_key VARCHAR(192) NOT NULL,
                sanitized_evidence JSONB NOT NULL,
                required_permission VARCHAR(128) NOT NULL,
                destination_target VARCHAR(192) NOT NULL,
                affected_scope JSONB NOT NULL,
                workspace_id UUID NULL,
                project_id UUID NULL,
                site_id UUID NULL,
                source_lifecycle VARCHAR(16) NOT NULL DEFAULT 'unresolved',
                resolution_condition_key VARCHAR(192) NOT NULL,
                resolved_at TIMESTAMPTZ NULL,
                policy_id VARCHAR(128) NOT NULL,
                policy_revision INTEGER NOT NULL,
                CONSTRAINT operational_signal_projection_source_identity_unique
                    UNIQUE (source_domain, signal_type, source_reference_type, source_reference_id),
                CONSTRAINT operational_signal_projection_severity_check
                    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
                CONSTRAINT operational_signal_projection_priority_rank_check
                    CHECK (priority_rank >= 0),
                CONSTRAINT operational_signal_projection_policy_revision_check
                    CHECK (policy_revision >= 1),
                CONSTRAINT operational_signal_projection_priority_reason_keys_check
                    CHECK (jsonb_typeof(priority_reason_keys) = 'array' AND jsonb_array_length(priority_reason_keys) > 0),
                CONSTRAINT operational_signal_projection_evidence_check
                    CHECK (jsonb_typeof(sanitized_evidence) = 'object'),
                CONSTRAINT operational_signal_projection_scope_check
                    CHECK (jsonb_typeof(affected_scope) = 'object'),
                CONSTRAINT operational_signal_projection_lifecycle_check
                    CHECK (source_lifecycle IN ('unresolved', 'resolved')),
                CONSTRAINT operational_signal_projection_resolution_check CHECK (
                    (source_lifecycle = 'unresolved' AND resolved_at IS NULL)
                    OR (source_lifecycle = 'resolved' AND resolved_at IS NOT NULL)
                )
            );
            CREATE INDEX operational_signal_projection_active_priority_idx
                ON operational_signal_projections(source_lifecycle, priority_rank, detected_at);
            CREATE INDEX operational_signal_projection_domain_lifecycle_idx
                ON operational_signal_projections(source_domain, source_lifecycle, detected_at);
            CREATE INDEX operational_signal_projection_workspace_lifecycle_idx
                ON operational_signal_projections(workspace_id, source_lifecycle);
            CREATE INDEX operational_signal_projection_project_lifecycle_idx
                ON operational_signal_projections(project_id, source_lifecycle);
            CREATE INDEX operational_signal_projection_site_lifecycle_idx
                ON operational_signal_projections(site_id, source_lifecycle);

            INSERT INTO operational_signal_projections (
                id, created_at, updated_at, source_domain, signal_type,
                source_reference_type, source_reference_id, severity, detected_at,
                source_observed_at, priority_rank, priority_reason_keys,
                title_key, explanation_key, impact_key, sanitized_evidence,
                required_permission, destination_target, affected_scope,
                workspace_id, project_id, site_id, source_lifecycle,
                resolution_condition_key, resolved_at, policy_id, policy_revision
            )
            SELECT
                job.id,
                job.created_at,
                NOW(),
                'jobs',
                'background_job_failed',
                'background_job',
                job.id,
                'high',
                CASE
                    WHEN job.internal_status IN ('failed', 'dead_lettered')
                        THEN COALESCE(job.completed_at, job.updated_at)
                    ELSE triage.created_at
                END,
                NOW(),
                300,
                jsonb_build_array('inbox:BACKGROUND_JOB_FAILED_PRIORITY'),
                'inbox:BACKGROUND_JOB_FAILED_TITLE',
                'inbox:BACKGROUND_JOB_FAILED_EXPLANATION',
                'inbox:BACKGROUND_JOB_FAILED_IMPACT',
                jsonb_strip_nulls(jsonb_build_object(
                    'jobType', job.job_type,
                    'workloadClass', job.workload_class,
                    'attemptCount', job.attempt_count,
                    'errorCode', job.error_code,
                    'statusKey', job.status_key,
                    'detectionTimeProvenance', CASE
                        WHEN job.internal_status IN ('failed', 'dead_lettered') THEN 'source_terminal_at'
                        ELSE 'legacy_triage_created_at'
                    END
                )),
                'platform:jobs:manage',
                'operations.jobs',
                jsonb_strip_nulls(jsonb_build_object(
                    'workspaceId', job.workspace_id,
                    'projectId', job.project_id,
                    'siteId', job.site_id
                )),
                job.workspace_id,
                job.project_id,
                job.site_id,
                CASE
                    WHEN job.internal_status IN ('failed', 'dead_lettered') THEN 'unresolved'
                    ELSE 'resolved'
                END,
                'inbox:BACKGROUND_JOB_RESOLUTION_CONDITION',
                CASE
                    WHEN job.internal_status IN ('failed', 'dead_lettered') THEN NULL
                    ELSE COALESCE(job.completed_at, job.updated_at)
                END,
                'jobs.background_job_failed',
                1
            FROM background_jobs AS job
            LEFT JOIN operational_signal_triage AS triage ON triage.source_job_id = job.id
            WHERE job.internal_status IN ('failed', 'dead_lettered')
                OR triage.id IS NOT NULL;

            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM operational_signal_triage AS triage
                    LEFT JOIN operational_signal_projections AS projection ON projection.id = triage.signal_id
                    WHERE projection.id IS NULL
                ) THEN
                    RAISE EXCEPTION '0100 operational signal projection blocked: triage projection backfill is incomplete';
                END IF;
            END $$;

            ALTER TABLE operational_signal_triage
                DROP CONSTRAINT operational_signal_triage_signal_source_check,
                DROP CONSTRAINT operational_signal_triage_source_job_id_fkey,
                DROP COLUMN source_job_id;
            ALTER TABLE operational_signal_triage
                RENAME COLUMN signal_id TO projection_id;
            ALTER TABLE operational_signal_triage
                RENAME CONSTRAINT operational_signal_triage_signal_id_key
                TO operational_signal_triage_projection_id_key;
            ALTER TABLE operational_signal_triage
                ADD CONSTRAINT operational_signal_triage_projection_id_fkey
                FOREIGN KEY (projection_id)
                REFERENCES operational_signal_projections(id) ON DELETE RESTRICT;
            """
        )
    ]
