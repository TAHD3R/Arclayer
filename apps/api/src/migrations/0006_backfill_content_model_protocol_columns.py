from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0005_auto_20260417_0558")]

    operations = [
        ops.RunSQL(
            sql="""
ALTER TABLE domain_content_model_definitions
    ADD COLUMN IF NOT EXISTS protocol_key VARCHAR(64) NULL;

ALTER TABLE domain_content_model_definitions
    ADD COLUMN IF NOT EXISTS protocol_version INT NOT NULL DEFAULT 1;

ALTER TABLE domain_content_model_definitions
    ADD COLUMN IF NOT EXISTS is_system_managed BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE domain_content_model_definitions
    ADD COLUMN IF NOT EXISTS system_field_keys JSONB NULL;

ALTER TABLE domain_content_model_definitions
    ADD COLUMN IF NOT EXISTS draft_contract_revision INT NOT NULL DEFAULT 1;

ALTER TABLE domain_content_model_definitions
    ADD COLUMN IF NOT EXISTS published_contract_revision INT NULL;

ALTER TABLE domain_content_model_definitions
    ADD COLUMN IF NOT EXISTS published_contract_snapshot JSONB NULL;

CREATE INDEX IF NOT EXISTS idx_domain_content_model_definitions_protocol_key
    ON domain_content_model_definitions (protocol_key);

CREATE INDEX IF NOT EXISTS idx_domain_content_model_definitions_is_system_managed
    ON domain_content_model_definitions (is_system_managed);

UPDATE domain_content_model_definitions
SET
    protocol_key = key,
    is_system_managed = TRUE
WHERE key IN ('article', 'page', 'reusable-section', 'category')
  AND protocol_key IS NULL;
""",
            reverse_sql="""
DROP INDEX IF EXISTS idx_domain_content_model_definitions_is_system_managed;
DROP INDEX IF EXISTS idx_domain_content_model_definitions_protocol_key;

ALTER TABLE domain_content_model_definitions
    DROP COLUMN IF EXISTS published_contract_snapshot;

ALTER TABLE domain_content_model_definitions
    DROP COLUMN IF EXISTS published_contract_revision;

ALTER TABLE domain_content_model_definitions
    DROP COLUMN IF EXISTS draft_contract_revision;

ALTER TABLE domain_content_model_definitions
    DROP COLUMN IF EXISTS system_field_keys;

ALTER TABLE domain_content_model_definitions
    DROP COLUMN IF EXISTS is_system_managed;

ALTER TABLE domain_content_model_definitions
    DROP COLUMN IF EXISTS protocol_version;

ALTER TABLE domain_content_model_definitions
    DROP COLUMN IF EXISTS protocol_key;
""",
        ),
    ]
