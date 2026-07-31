from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0085_operational_signal_triage")]
    initial = False
    operations = [ops.RunSQL("""
        CREATE TABLE platform_saved_views (
            id UUID PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL,
            actor_user_id UUID NOT NULL, capability_id VARCHAR(128) NOT NULL, name VARCHAR(128) NOT NULL,
            filter_schema_revision VARCHAR(64) NOT NULL, column_schema_revision VARCHAR(64) NOT NULL,
            filters JSONB NOT NULL, ordering JSONB NOT NULL, visible_columns JSONB NOT NULL,
            column_order JSONB NOT NULL, density VARCHAR(32) NOT NULL, revision BIGINT NOT NULL DEFAULT 1,
            CONSTRAINT platform_saved_views_actor_capability_name UNIQUE (actor_user_id, capability_id, name)
        );
        CREATE INDEX platform_saved_views_actor_capability_idx ON platform_saved_views(actor_user_id, capability_id);
    """)]
