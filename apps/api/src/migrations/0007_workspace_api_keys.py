from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0006_backfill_content_model_protocol_columns")]

    operations = [
        ops.RunSQL(
            sql="""
CREATE TABLE IF NOT EXISTS domain_api_keys (
    id UUID NOT NULL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    owner_user_id UUID NULL REFERENCES domain_users (id) ON DELETE CASCADE,
    workspace_id UUID NULL REFERENCES domain_workspaces (id) ON DELETE CASCADE,
    site_id UUID NULL REFERENCES domain_sites (id) ON DELETE CASCADE,
    key_family VARCHAR(32) NOT NULL,
    delivery_perspective VARCHAR(16) NULL,
    name VARCHAR(128) NOT NULL,
    description VARCHAR(512) NULL,
    token_public_id VARCHAR(32) NOT NULL,
    token_hash VARCHAR(64) NOT NULL,
    token_mask VARCHAR(128) NOT NULL,
    scopes JSONB NULL,
    created_by_user_id UUID NULL,
    last_used_at TIMESTAMPTZ NULL,
    expires_at TIMESTAMPTZ NULL,
    revoked_at TIMESTAMPTZ NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_domain_api_keys_token_public_id
    ON domain_api_keys (token_public_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_domain_api_keys_token_hash
    ON domain_api_keys (token_hash);

CREATE INDEX IF NOT EXISTS idx_domain_api_keys_owner_user_id
    ON domain_api_keys (owner_user_id);

CREATE INDEX IF NOT EXISTS idx_domain_api_keys_workspace_id
    ON domain_api_keys (workspace_id);

CREATE INDEX IF NOT EXISTS idx_domain_api_keys_site_id
    ON domain_api_keys (site_id);

CREATE INDEX IF NOT EXISTS idx_domain_api_keys_key_family
    ON domain_api_keys (key_family);

CREATE INDEX IF NOT EXISTS idx_domain_api_keys_delivery_perspective
    ON domain_api_keys (delivery_perspective);

CREATE INDEX IF NOT EXISTS idx_domain_api_keys_created_by_user_id
    ON domain_api_keys (created_by_user_id);

CREATE INDEX IF NOT EXISTS idx_domain_api_keys_last_used_at
    ON domain_api_keys (last_used_at);

CREATE INDEX IF NOT EXISTS idx_domain_api_keys_expires_at
    ON domain_api_keys (expires_at);

CREATE INDEX IF NOT EXISTS idx_domain_api_keys_revoked_at
    ON domain_api_keys (revoked_at);
""",
            reverse_sql="""
DROP INDEX IF EXISTS idx_domain_api_keys_revoked_at;
DROP INDEX IF EXISTS idx_domain_api_keys_expires_at;
DROP INDEX IF EXISTS idx_domain_api_keys_last_used_at;
DROP INDEX IF EXISTS idx_domain_api_keys_created_by_user_id;
DROP INDEX IF EXISTS idx_domain_api_keys_delivery_perspective;
DROP INDEX IF EXISTS idx_domain_api_keys_key_family;
DROP INDEX IF EXISTS idx_domain_api_keys_site_id;
DROP INDEX IF EXISTS idx_domain_api_keys_workspace_id;
DROP INDEX IF EXISTS idx_domain_api_keys_owner_user_id;
DROP INDEX IF EXISTS idx_domain_api_keys_token_hash;
DROP INDEX IF EXISTS idx_domain_api_keys_token_public_id;
DROP TABLE IF EXISTS domain_api_keys;
""",
        ),
    ]
