from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0133_ai_policy_permissions")]
    initial = False

    operations = [
        ops.RunSQL(
            """
            CREATE TABLE IF NOT EXISTS ai_run_knowledge_snapshots (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                run_id UUID NOT NULL UNIQUE REFERENCES ai_runs(id) ON DELETE CASCADE,
                workspace_id UUID NOT NULL,
                project_id UUID NULL,
                workspace_revision_id UUID NULL,
                project_revision_id UUID NULL,
                context_hash VARCHAR(71) NOT NULL,
                context_snapshot JSONB NOT NULL,
                context_byte_size INTEGER NOT NULL,
                source_snapshot_count INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS ai_run_knowledge_snapshots_workspace_created_idx
                ON ai_run_knowledge_snapshots (workspace_id, created_at);
            CREATE INDEX IF NOT EXISTS ai_run_knowledge_snapshots_project_created_idx
                ON ai_run_knowledge_snapshots (project_id, created_at);
            CREATE INDEX IF NOT EXISTS ai_run_knowledge_snapshots_workspace_revision_created_idx
                ON ai_run_knowledge_snapshots (workspace_revision_id, created_at);
            CREATE INDEX IF NOT EXISTS ai_run_knowledge_snapshots_project_revision_created_idx
                ON ai_run_knowledge_snapshots (project_revision_id, created_at);

            CREATE TABLE IF NOT EXISTS ai_run_knowledge_source_snapshots (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                run_id UUID NOT NULL REFERENCES ai_runs(id) ON DELETE CASCADE,
                source_order INTEGER NOT NULL,
                knowledge_base_id UUID NOT NULL,
                policy_revision INTEGER NOT NULL,
                source_id UUID NOT NULL,
                source_version_id UUID NOT NULL,
                source_name VARCHAR(160) NOT NULL,
                source_version_content_hash VARCHAR(71) NOT NULL,
                UNIQUE (run_id, source_id)
            );

            CREATE INDEX IF NOT EXISTS ai_run_knowledge_source_snapshots_run_order_idx
                ON ai_run_knowledge_source_snapshots (run_id, source_order);
            CREATE INDEX IF NOT EXISTS ai_run_knowledge_source_snapshots_knowledge_base_created_idx
                ON ai_run_knowledge_source_snapshots (knowledge_base_id, created_at);
            CREATE INDEX IF NOT EXISTS ai_run_knowledge_source_snapshots_source_version_created_idx
                ON ai_run_knowledge_source_snapshots (source_version_id, created_at);
            """,
            reverse_sql="""
            DROP TABLE IF EXISTS ai_run_knowledge_source_snapshots;
            DROP TABLE IF EXISTS ai_run_knowledge_snapshots;
            """,
        ),
    ]
