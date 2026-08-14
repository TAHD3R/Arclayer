from tortoise import migrations
from tortoise.migrations import operations as ops

FORWARD_SQL = """
WITH obsolete_jobs AS (
    SELECT id
    FROM background_jobs
    WHERE job_type IN ('skill.github.import', 'skill.github.refresh')
      AND job_type_version = 1
      AND internal_status IN (
          'pending_dispatch',
          'queued',
          'running',
          'retry_scheduled',
          'waiting_for_user'
      )
), terminated_attempts AS (
    UPDATE background_job_attempts AS attempt
    SET status = 'failed',
        completed_at = COALESCE(attempt.completed_at, NOW()),
        error_code = 'SKILL_GITHUB_JOB_VERSION_UNSUPPORTED',
        error_message = 'Workspace GitHub Skill Job v1 cannot resume after automatic package discovery was introduced.'
    WHERE attempt.job_id IN (SELECT id FROM obsolete_jobs)
      AND attempt.status IN ('claimed', 'running', 'interrupted')
    RETURNING attempt.id
), terminated_dispatches AS (
    UPDATE background_job_dispatch_outbox AS dispatch
    SET status = 'dead_lettered',
        lease_until = NULL,
        heartbeat_at = NULL,
        last_error = 'Workspace GitHub Skill Job v1 was terminated during the automatic package discovery upgrade.',
        updated_at = NOW()
    WHERE dispatch.job_id IN (SELECT id FROM obsolete_jobs)
      AND dispatch.status IN ('pending', 'dispatching', 'dispatched', 'retry_scheduled')
    RETURNING dispatch.id
)
UPDATE background_jobs AS job
SET internal_status = 'failed',
    completed_at = COALESCE(job.completed_at, NOW()),
    error_code = 'SKILL_GITHUB_JOB_VERSION_UNSUPPORTED',
    error_message = 'This GitHub Skill operation used Job v1. Import or refresh the Skill again.',
    updated_at = NOW()
WHERE job.id IN (SELECT id FROM obsolete_jobs);
"""

REVERSE_SQL = """
-- Terminated durable execution cannot be reconstructed without inventing lease and attempt state.
SELECT 1;
"""


class Migration(migrations.Migration):
    dependencies = [("models", "0139_builder_draft_checkpoints_and_content_retention")]
    initial = False
    operations = [ops.RunSQL(FORWARD_SQL, REVERSE_SQL)]
