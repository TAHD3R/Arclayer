from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        CREATE TABLE IF NOT EXISTS "settings" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "namespace" VARCHAR(128) NOT NULL UNIQUE,
    "value" JSONB,
    "updated_by" UUID
);
CREATE INDEX IF NOT EXISTS "idx_settings_created_d2a912" ON "settings" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_settings_namespa_ce7f73" ON "settings" ("namespace");"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        DROP TABLE IF EXISTS "settings";"""


MODELS_STATE = (
    "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"
    "zoASy7LiwbzqZY5mwK4Nd159e//g/UZEJf"
)
