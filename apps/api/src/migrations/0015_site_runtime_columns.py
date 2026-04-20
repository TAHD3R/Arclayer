from orjson import loads
from tortoise import fields, migrations
from tortoise.fields.base import OnDelete
from tortoise.fields.data import JSON_DUMPS
from tortoise.migrations import operations as ops
from tortoise.migrations.constraints import UniqueConstraint
from tortoise.migrations.operations import TortoiseOperation

from src.common.utils.ids import uuid7
from src.models.automation.flow import (
    AutomationFlowStatus,
    AutomationOperationKind,
    AutomationRunLogLevel,
    AutomationRunStatus,
    AutomationTriggerKind,
)


class StateOnly(TortoiseOperation):
    def __init__(self, operation: TortoiseOperation) -> None:
        self.operation = operation

    def describe(self) -> str:
        return f"State only: {self.operation.describe()}"

    def state_forward(self, app_label: str, state) -> None:  # type: ignore[override]
        self.operation.state_forward(app_label, state)


class Migration(migrations.Migration):
    dependencies = [
        ("models", "0014_auto_20260419_1922"),
        ("models", "0014_automation_flows"),
    ]

    operations = [
        ops.RunSQL(
            sql="""
ALTER TABLE domain_sites
    ADD COLUMN IF NOT EXISTS project_id UUID NULL;

ALTER TABLE domain_sites
    ADD COLUMN IF NOT EXISTS runtime_id UUID NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'domain_sites'::regclass
          AND conname = 'domain_sites_project_id_fkey'
    ) THEN
        ALTER TABLE domain_sites
            ADD CONSTRAINT domain_sites_project_id_fkey
            FOREIGN KEY (project_id)
            REFERENCES domain_projects (id)
            ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'domain_sites'::regclass
          AND conname = 'domain_sites_runtime_id_fkey'
    ) THEN
        ALTER TABLE domain_sites
            ADD CONSTRAINT domain_sites_runtime_id_fkey
            FOREIGN KEY (runtime_id)
            REFERENCES domain_project_runtimes (id)
            ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_domain_sites_project_id
    ON domain_sites (project_id);

CREATE INDEX IF NOT EXISTS idx_domain_sites_runtime_id
    ON domain_sites (runtime_id);

ALTER TABLE domain_sites
    DROP CONSTRAINT IF EXISTS uid_domain_site_workspa_9c2ac6;

ALTER TABLE domain_sites
    DROP CONSTRAINT IF EXISTS domain_sites_workspace_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uid_domain_sites_runtime_id
    ON domain_sites (runtime_id);

ALTER TABLE domain_workspaces
    DROP CONSTRAINT IF EXISTS uid_domain_workspac_slug_1a00aa;

ALTER TABLE domain_workspaces
    DROP CONSTRAINT IF EXISTS domain_workspaces_slug_key;

ALTER TABLE domain_workspaces
    DROP COLUMN IF EXISTS slug;
""",
            reverse_sql="""
ALTER TABLE domain_workspaces
    ADD COLUMN IF NOT EXISTS slug VARCHAR(64);

UPDATE domain_workspaces
SET slug = CONCAT('workspace-', REPLACE(id::text, '-', ''))
WHERE slug IS NULL OR slug = '';

ALTER TABLE domain_workspaces
    ALTER COLUMN slug SET NOT NULL;

ALTER TABLE domain_workspaces
    ADD CONSTRAINT uid_domain_workspac_slug_1a00aa UNIQUE (slug);

DROP INDEX IF EXISTS uid_domain_sites_runtime_id;
DROP INDEX IF EXISTS idx_domain_sites_runtime_id;
DROP INDEX IF EXISTS idx_domain_sites_project_id;

ALTER TABLE domain_sites
    DROP CONSTRAINT IF EXISTS domain_sites_runtime_id_fkey;

ALTER TABLE domain_sites
    DROP CONSTRAINT IF EXISTS domain_sites_project_id_fkey;

ALTER TABLE domain_sites
    DROP COLUMN IF EXISTS runtime_id;

ALTER TABLE domain_sites
    DROP COLUMN IF EXISTS project_id;

ALTER TABLE domain_sites
    ADD CONSTRAINT uid_domain_site_workspa_9c2ac6 UNIQUE (workspace_id);
""",
        ),
        StateOnly(
            ops.CreateModel(
                name="AutomationFlowRecord",
                fields=[
                    ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                    ("created_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                    ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
                    (
                        "workspace",
                        fields.ForeignKeyField(
                            "models.Workspace",
                            source_field="workspace_id",
                            db_constraint=True,
                            to_field="id",
                            related_name="automation_flows",
                            on_delete=OnDelete.CASCADE,
                        ),
                    ),
                    ("name", fields.CharField(max_length=128)),
                    ("description", fields.CharField(null=True, max_length=512)),
                    (
                        "status",
                        fields.CharEnumField(
                            default=AutomationFlowStatus.ACTIVE,
                            description="ACTIVE: active\nDISABLED: disabled",
                            enum_type=AutomationFlowStatus,
                            max_length=16,
                        ),
                    ),
                    (
                        "trigger_kind",
                        fields.CharEnumField(
                            db_index=True,
                            description=(
                                "PUBLISH_COMPLETED: publish_completed\n"
                                "CONTENT_TRANSITIONED: content_transitioned\n"
                                "API_KEY_ROTATED: api_key_rotated\n"
                                "PREVIEW_TOKEN_CREATED: preview_token_created"
                            ),
                            enum_type=AutomationTriggerKind,
                            max_length=32,
                        ),
                    ),
                    ("trigger_event", fields.CharField(db_index=True, max_length=128)),
                    ("retry_limit", fields.IntField(default=0)),
                    ("dead_letter_enabled", fields.BooleanField(default=True)),
                    ("credential_binding", fields.JSONField(null=True, encoder=JSON_DUMPS, decoder=loads)),
                    ("created_by_user_id", fields.UUIDField(null=True, db_index=True)),
                    ("updated_by_user_id", fields.UUIDField(null=True, db_index=True)),
                ],
                options={
                    "table": "domain_automation_flows",
                    "app": "models",
                    "unique_together": (("workspace_id", "name"),),
                    "pk_attr": "id",
                    "table_description": "Workspace-scoped automation flow definition.",
                },
                bases=["BaseModel"],
            )
        ),
        StateOnly(
            ops.CreateModel(
                name="AutomationOperationRecord",
                fields=[
                    ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                    ("created_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                    ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
                    (
                        "flow",
                        fields.ForeignKeyField(
                            "models.AutomationFlowRecord",
                            source_field="flow_id",
                            db_constraint=True,
                            to_field="id",
                            related_name="operations",
                            on_delete=OnDelete.CASCADE,
                        ),
                    ),
                    ("name", fields.CharField(max_length=128)),
                    (
                        "kind",
                        fields.CharEnumField(
                            db_index=True,
                            description=(
                                "WEBHOOK: webhook\n"
                                "HTTP_REQUEST: http_request\n"
                                "CONTENT_READ: content_read\n"
                                "CONTENT_UPDATE: content_update\n"
                                "RELEASE_PUBLISH: release_publish\n"
                                "NOTIFICATION: notification"
                            ),
                            enum_type=AutomationOperationKind,
                            max_length=32,
                        ),
                    ),
                    ("config", fields.JSONField(null=True, encoder=JSON_DUMPS, decoder=loads)),
                    ("sort_order", fields.IntField(default=0)),
                ],
                options={
                    "table": "domain_automation_operations",
                    "app": "models",
                    "pk_attr": "id",
                    "table_description": "Ordered operation inside an automation flow.",
                },
                bases=["BaseModel"],
            )
        ),
        StateOnly(
            ops.CreateModel(
                name="AutomationRunRecord",
                fields=[
                    ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                    ("created_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                    ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
                    (
                        "workspace",
                        fields.ForeignKeyField(
                            "models.Workspace",
                            source_field="workspace_id",
                            db_constraint=True,
                            to_field="id",
                            related_name="automation_runs",
                            on_delete=OnDelete.CASCADE,
                        ),
                    ),
                    (
                        "flow",
                        fields.ForeignKeyField(
                            "models.AutomationFlowRecord",
                            source_field="flow_id",
                            db_constraint=True,
                            to_field="id",
                            related_name="runs",
                            on_delete=OnDelete.CASCADE,
                        ),
                    ),
                    ("trigger_event", fields.CharField(db_index=True, max_length=128)),
                    (
                        "status",
                        fields.CharEnumField(
                            db_index=True,
                            description=(
                                "QUEUED: queued\n"
                                "RUNNING: running\n"
                                "SUCCEEDED: succeeded\n"
                                "FAILED: failed\n"
                                "DEAD_LETTER: dead_letter"
                            ),
                            enum_type=AutomationRunStatus,
                            max_length=16,
                        ),
                    ),
                    ("attempt", fields.IntField(default=1)),
                    ("max_attempts", fields.IntField(default=1)),
                    ("event_payload", fields.JSONField(null=True, encoder=JSON_DUMPS, decoder=loads)),
                    ("result_payload", fields.JSONField(null=True, encoder=JSON_DUMPS, decoder=loads)),
                    ("error", fields.CharField(null=True, max_length=512)),
                    ("started_at", fields.DatetimeField(null=True, db_index=True, auto_now=False, auto_now_add=False)),
                    (
                        "completed_at",
                        fields.DatetimeField(null=True, db_index=True, auto_now=False, auto_now_add=False),
                    ),
                ],
                options={
                    "table": "domain_automation_runs",
                    "app": "models",
                    "pk_attr": "id",
                    "table_description": "Execution record for one triggered flow run.",
                },
                bases=["BaseModel"],
            )
        ),
        StateOnly(
            ops.CreateModel(
                name="AutomationRunLogRecord",
                fields=[
                    ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                    ("created_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                    ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
                    (
                        "workspace",
                        fields.ForeignKeyField(
                            "models.Workspace",
                            source_field="workspace_id",
                            db_constraint=True,
                            to_field="id",
                            related_name="automation_run_logs",
                            on_delete=OnDelete.CASCADE,
                        ),
                    ),
                    (
                        "run",
                        fields.ForeignKeyField(
                            "models.AutomationRunRecord",
                            source_field="run_id",
                            db_constraint=True,
                            to_field="id",
                            related_name="logs",
                            on_delete=OnDelete.CASCADE,
                        ),
                    ),
                    (
                        "operation",
                        fields.ForeignKeyField(
                            "models.AutomationOperationRecord",
                            source_field="operation_id",
                            null=True,
                            db_constraint=True,
                            to_field="id",
                            related_name="run_logs",
                            on_delete=OnDelete.SET_NULL,
                        ),
                    ),
                    (
                        "level",
                        fields.CharEnumField(
                            db_index=True,
                            description="INFO: info\nERROR: error",
                            enum_type=AutomationRunLogLevel,
                            max_length=16,
                        ),
                    ),
                    ("message", fields.CharField(max_length=512)),
                    ("payload", fields.JSONField(null=True, encoder=JSON_DUMPS, decoder=loads)),
                ],
                options={
                    "table": "domain_automation_run_logs",
                    "app": "models",
                    "pk_attr": "id",
                    "table_description": "Structured execution log row for automation run diagnostics.",
                },
                bases=["BaseModel"],
            )
        ),
        StateOnly(
            ops.RemoveConstraint(
                model_name="SiteRecord",
                fields=["workspace_id"],
            )
        ),
        StateOnly(
            ops.AddField(
                model_name="SiteRecord",
                name="project",
                field=fields.ForeignKeyField(
                    "models.ProjectRecord",
                    source_field="project_id",
                    null=True,
                    db_constraint=True,
                    to_field="id",
                    related_name="sites",
                    on_delete=OnDelete.CASCADE,
                ),
            )
        ),
        StateOnly(
            ops.AddField(
                model_name="SiteRecord",
                name="runtime",
                field=fields.ForeignKeyField(
                    "models.ProjectRuntimeRecord",
                    source_field="runtime_id",
                    null=True,
                    db_constraint=True,
                    to_field="id",
                    related_name="sites",
                    on_delete=OnDelete.CASCADE,
                ),
            )
        ),
        StateOnly(
            ops.AddConstraint(
                model_name="SiteRecord",
                constraint=UniqueConstraint(fields=("runtime_id",), name=None),
            )
        ),
    ]
