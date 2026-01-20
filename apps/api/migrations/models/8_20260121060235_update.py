from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "plugins" ADD "package_filename" VARCHAR(255);
        ALTER TABLE "plugins" ADD "package_size" BIGINT;
        ALTER TABLE "plugins" ADD "package_checksum" VARCHAR(128);"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "plugins" DROP COLUMN "package_filename";
        ALTER TABLE "plugins" DROP COLUMN "package_size";
        ALTER TABLE "plugins" DROP COLUMN "package_checksum";"""


MODELS_STATE = (
    "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"
    "cT1ekjI//w9eQC6x"
)
