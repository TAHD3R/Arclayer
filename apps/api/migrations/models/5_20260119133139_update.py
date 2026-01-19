from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        DROP INDEX IF EXISTS "uid_users_phone_f72cc5";
        ALTER TABLE "users" DROP COLUMN "phone";"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "users" ADD "phone" VARCHAR(32) UNIQUE;"""


MODELS_STATE = (
    "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"
)
