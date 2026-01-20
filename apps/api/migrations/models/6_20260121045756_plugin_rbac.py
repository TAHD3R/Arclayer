from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        CREATE TABLE IF NOT EXISTS "rbac_bootstrap_state" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "key" VARCHAR(64) NOT NULL UNIQUE,
    "done" BOOL NOT NULL DEFAULT False,
    "done_at" TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS "idx_rbac_bootst_created_96b1a1" ON "rbac_bootstrap_state" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_rbac_bootst_key_8cb9bd" ON "rbac_bootstrap_state" ("key");
CREATE INDEX IF NOT EXISTS "idx_rbac_bootst_done_010fb9" ON "rbac_bootstrap_state" ("done");
        ALTER TABLE "user_credentials" RENAME COLUMN "id" TO "user_id";
        ALTER TABLE "user_credentials" DROP COLUMN "user_id";"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "user_credentials" RENAME COLUMN "user_id" TO "id";
        ALTER TABLE "user_credentials" ADD "user_id" UUID NOT NULL UNIQUE;
        DROP TABLE IF EXISTS "rbac_bootstrap_state";"""


MODELS_STATE = (
    "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"
    "L6oJPaqEHk9JmR/+B/34dSA="
)
