from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "users" ADD "token_version" INT NOT NULL DEFAULT 0;
        CREATE INDEX IF NOT EXISTS "idx_users_token_v_83e7d7" ON "users" ("token_version");"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        DROP INDEX IF EXISTS "idx_users_token_v_83e7d7";
        ALTER TABLE "users" DROP COLUMN "token_version";"""


MODELS_STATE = (
    "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"
    "TIIg=="
)
