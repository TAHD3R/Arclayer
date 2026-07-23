from tortoise import migrations
from tortoise.migrations import operations as ops

FORWARD_SQL = """
WITH obsolete_jobs AS (
    SELECT id
    FROM background_jobs
    WHERE job_type = 'system.plugin.lifecycle'
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
        error_code = 'PLUGIN_JOB_VERSION_UNSUPPORTED',
        error_message = 'Plugin lifecycle Job v1 cannot resume after the signed artifact contract upgrade.'
    WHERE attempt.job_id IN (SELECT id FROM obsolete_jobs)
      AND attempt.status IN ('claimed', 'running', 'interrupted')
    RETURNING attempt.id
), terminated_dispatches AS (
    UPDATE background_job_dispatch_outbox AS dispatch
    SET status = 'dead_lettered',
        lease_until = NULL,
        heartbeat_at = NULL,
        last_error = 'Plugin lifecycle Job v1 was terminated during the signed artifact contract upgrade.',
        updated_at = NOW()
    WHERE dispatch.job_id IN (SELECT id FROM obsolete_jobs)
      AND dispatch.status IN ('pending', 'dispatching', 'dispatched', 'retry_scheduled')
    RETURNING dispatch.id
), terminated_jobs AS (
    UPDATE background_jobs AS job
    SET internal_status = 'failed',
        completed_at = COALESCE(job.completed_at, NOW()),
        error_code = 'PLUGIN_JOB_VERSION_UNSUPPORTED',
        error_message = 'This plugin operation used lifecycle Job v1. Review the plugin package again and retry the operation.',
        updated_at = NOW()
    WHERE job.id IN (SELECT id FROM obsolete_jobs)
    RETURNING job.id
), failed_operations AS (
    UPDATE system_plugin_operations AS operation
    SET state = 'failed',
        failure_code = 'PLUGIN_JOB_VERSION_UNSUPPORTED',
        failure_summary = 'The operation used lifecycle Job v1. Review the plugin package again and retry.',
        retryable = FALSE,
        completed_at = COALESCE(operation.completed_at, NOW()),
        updated_at = NOW()
    WHERE operation.job_id IN (SELECT id FROM terminated_jobs)
      AND operation.state IN ('queued', 'running', 'waiting_for_restart')
    RETURNING operation.installation_id, operation.id
)
UPDATE system_plugin_installations AS installation
SET lifecycle_state = 'failed',
    runtime_activation_state = 'failed',
    current_operation_id = NULL,
    current_job_id = NULL,
    last_failure_code = 'PLUGIN_JOB_VERSION_UNSUPPORTED',
    last_failure_summary = 'Review the plugin package again and retry the lifecycle operation.',
    updated_at = NOW()
WHERE EXISTS (
    SELECT 1
    FROM failed_operations
    WHERE failed_operations.installation_id = installation.id
);
"""

REVERSE_SQL = """
-- Terminated durable execution cannot be reconstructed without inventing lease and attempt state.
SELECT 1;
"""


class Migration(migrations.Migration):
    dependencies = [("models", "0071_auto_20260723_1807")]
    initial = False
    operations = [ops.RunSQL(FORWARD_SQL, REVERSE_SQL)]
