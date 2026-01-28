from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        CREATE TABLE IF NOT EXISTS "asset_share_links" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "org_id" UUID NOT NULL,
    "token" VARCHAR(64) NOT NULL UNIQUE,
    "expires_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,
    "created_by_user_id" UUID,
    "asset_id" UUID NOT NULL REFERENCES "assets" ("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_asset_share_created_b1e9a3" ON "asset_share_links" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_asset_share_org_id_088c5e" ON "asset_share_links" ("org_id");
CREATE INDEX IF NOT EXISTS "idx_asset_share_token_3aca7d" ON "asset_share_links" ("token");
CREATE INDEX IF NOT EXISTS "idx_asset_share_expires_5d7ae7" ON "asset_share_links" ("expires_at");
CREATE INDEX IF NOT EXISTS "idx_asset_share_revoked_a9ff80" ON "asset_share_links" ("revoked_at");
CREATE INDEX IF NOT EXISTS "idx_asset_share_created_6387ca" ON "asset_share_links" ("created_by_user_id");
COMMENT ON TABLE "asset_share_links" IS 'Link-only share access for a single asset.';"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        DROP TABLE IF EXISTS "asset_share_links";"""


MODELS_STATE = (
    "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"
    "zu3FTjyOIpkWe8gE/95/8DmVlX2Q=="
)
