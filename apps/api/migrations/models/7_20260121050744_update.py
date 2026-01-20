from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "user_credentials" RENAME COLUMN "user_id" TO "id";
        ALTER TABLE "user_credentials" ADD "user_id" UUID NOT NULL UNIQUE;"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "user_credentials" RENAME COLUMN "id" TO "user_id";
        ALTER TABLE "user_credentials" DROP COLUMN "user_id";"""


MODELS_STATE = (
    "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"
    "l22zL6oJPaqEHo9JmR/+BxMD4Oo="
)
