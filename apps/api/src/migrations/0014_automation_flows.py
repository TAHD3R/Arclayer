from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0013_editorial_workflow_release_metadata")]

    operations = [
        ops.RunSQL(
            sql="""
CREATE TABLE IF NOT EXISTS domain_automation_flows (
    id UUID NOT NULL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    workspace_id UUID NOT NULL REFERENCES domain_workspaces (id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    description VARCHAR(512) NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    trigger_kind VARCHAR(32) NOT NULL,
    trigger_event VARCHAR(128) NOT NULL,
    retry_limit INT NOT NULL DEFAULT 0,
    dead_letter_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    credential_binding JSONB NULL,
    created_by_user_id UUID NULL,
    updated_by_user_id UUID NULL,
    CONSTRAINT uid_automation_flows_workspace_name UNIQUE (workspace_id, name)
);

CREATE INDEX IF NOT EXISTS idx_domain_automation_flows_workspace_id
    ON domain_automation_flows (workspace_id);
CREATE INDEX IF NOT EXISTS idx_domain_automation_flows_trigger_kind
    ON domain_automation_flows (trigger_kind);
CREATE INDEX IF NOT EXISTS idx_domain_automation_flows_trigger_event
    ON domain_automation_flows (trigger_event);
CREATE INDEX IF NOT EXISTS idx_domain_automation_flows_created_by_user_id
    ON domain_automation_flows (created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_domain_automation_flows_updated_by_user_id
    ON domain_automation_flows (updated_by_user_id);

CREATE TABLE IF NOT EXISTS domain_automation_operations (
    id UUID NOT NULL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    flow_id UUID NOT NULL REFERENCES domain_automation_flows (id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    kind VARCHAR(32) NOT NULL,
    config JSONB NULL,
    sort_order INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_domain_automation_operations_flow_id
    ON domain_automation_operations (flow_id);
CREATE INDEX IF NOT EXISTS idx_domain_automation_operations_kind
    ON domain_automation_operations (kind);

CREATE TABLE IF NOT EXISTS domain_automation_runs (
    id UUID NOT NULL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    workspace_id UUID NOT NULL REFERENCES domain_workspaces (id) ON DELETE CASCADE,
    flow_id UUID NOT NULL REFERENCES domain_automation_flows (id) ON DELETE CASCADE,
    trigger_event VARCHAR(128) NOT NULL,
    status VARCHAR(16) NOT NULL,
    attempt INT NOT NULL DEFAULT 1,
    max_attempts INT NOT NULL DEFAULT 1,
    event_payload JSONB NULL,
    result_payload JSONB NULL,
    error VARCHAR(512) NULL,
    started_at TIMESTAMPTZ NULL,
    completed_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_domain_automation_runs_workspace_id
    ON domain_automation_runs (workspace_id);
CREATE INDEX IF NOT EXISTS idx_domain_automation_runs_flow_id
    ON domain_automation_runs (flow_id);
CREATE INDEX IF NOT EXISTS idx_domain_automation_runs_trigger_event
    ON domain_automation_runs (trigger_event);
CREATE INDEX IF NOT EXISTS idx_domain_automation_runs_status
    ON domain_automation_runs (status);
CREATE INDEX IF NOT EXISTS idx_domain_automation_runs_started_at
    ON domain_automation_runs (started_at);
CREATE INDEX IF NOT EXISTS idx_domain_automation_runs_completed_at
    ON domain_automation_runs (completed_at);

CREATE TABLE IF NOT EXISTS domain_automation_run_logs (
    id UUID NOT NULL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    workspace_id UUID NOT NULL REFERENCES domain_workspaces (id) ON DELETE CASCADE,
    run_id UUID NOT NULL REFERENCES domain_automation_runs (id) ON DELETE CASCADE,
    operation_id UUID NULL REFERENCES domain_automation_operations (id) ON DELETE SET NULL,
    level VARCHAR(16) NOT NULL,
    message VARCHAR(512) NOT NULL,
    payload JSONB NULL
);

CREATE INDEX IF NOT EXISTS idx_domain_automation_run_logs_workspace_id
    ON domain_automation_run_logs (workspace_id);
CREATE INDEX IF NOT EXISTS idx_domain_automation_run_logs_run_id
    ON domain_automation_run_logs (run_id);
CREATE INDEX IF NOT EXISTS idx_domain_automation_run_logs_operation_id
    ON domain_automation_run_logs (operation_id);
CREATE INDEX IF NOT EXISTS idx_domain_automation_run_logs_level
    ON domain_automation_run_logs (level);
""",
            reverse_sql="""
DROP INDEX IF EXISTS idx_domain_automation_run_logs_level;
DROP INDEX IF EXISTS idx_domain_automation_run_logs_operation_id;
DROP INDEX IF EXISTS idx_domain_automation_run_logs_run_id;
DROP INDEX IF EXISTS idx_domain_automation_run_logs_workspace_id;
DROP TABLE IF EXISTS domain_automation_run_logs;

DROP INDEX IF EXISTS idx_domain_automation_runs_completed_at;
DROP INDEX IF EXISTS idx_domain_automation_runs_started_at;
DROP INDEX IF EXISTS idx_domain_automation_runs_status;
DROP INDEX IF EXISTS idx_domain_automation_runs_trigger_event;
DROP INDEX IF EXISTS idx_domain_automation_runs_flow_id;
DROP INDEX IF EXISTS idx_domain_automation_runs_workspace_id;
DROP TABLE IF EXISTS domain_automation_runs;

DROP INDEX IF EXISTS idx_domain_automation_operations_kind;
DROP INDEX IF EXISTS idx_domain_automation_operations_flow_id;
DROP TABLE IF EXISTS domain_automation_operations;

DROP INDEX IF EXISTS idx_domain_automation_flows_updated_by_user_id;
DROP INDEX IF EXISTS idx_domain_automation_flows_created_by_user_id;
DROP INDEX IF EXISTS idx_domain_automation_flows_trigger_event;
DROP INDEX IF EXISTS idx_domain_automation_flows_trigger_kind;
DROP INDEX IF EXISTS idx_domain_automation_flows_workspace_id;
DROP TABLE IF EXISTS domain_automation_flows;
""",
        ),
    ]
