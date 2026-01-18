from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        CREATE TABLE IF NOT EXISTS "plugins" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "plugin_id" VARCHAR(128) NOT NULL UNIQUE,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "author" VARCHAR(200) NOT NULL,
    "version" VARCHAR(64) NOT NULL,
    "requires" VARCHAR(64) NOT NULL,
    "entrypoint" VARCHAR(255) NOT NULL,
    "website" VARCHAR(255),
    "repository" VARCHAR(255),
    "issues" VARCHAR(255),
    "license" VARCHAR(64),
    "status" VARCHAR(9) NOT NULL DEFAULT 'installed',
    "storage_path" VARCHAR(512) NOT NULL,
    "started_at" TIMESTAMPTZ,
    "permissions" JSONB,
    "config_schema" JSONB,
    "config" JSONB
);
CREATE INDEX IF NOT EXISTS "idx_plugins_created_0e8a12" ON "plugins" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_plugins_plugin__874e4a" ON "plugins" ("plugin_id");
CREATE INDEX IF NOT EXISTS "idx_plugins_status_5a8cc3" ON "plugins" ("status");
COMMENT ON COLUMN "plugins"."status" IS 'INSTALLED: installed\nSTARTED: started\nSTOPPED: stopped\nDISABLED: disabled\nFAILED: failed';"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        DROP TABLE IF EXISTS "plugins";"""


MODELS_STATE = (
    "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"
)
