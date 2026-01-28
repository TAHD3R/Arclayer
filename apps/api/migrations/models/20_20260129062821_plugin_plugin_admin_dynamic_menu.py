from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        CREATE TABLE IF NOT EXISTS "asset_folders" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "org_id" UUID NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "sort_order" INT NOT NULL DEFAULT 0,
    "parent_id" UUID REFERENCES "asset_folders" ("id") ON DELETE SET NULL,
    CONSTRAINT "uid_asset_folde_org_id_7a5a92" UNIQUE ("org_id", "parent_id", "name")
);
CREATE INDEX IF NOT EXISTS "idx_asset_folde_created_8bb214" ON "asset_folders" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_asset_folde_org_id_11d5d1" ON "asset_folders" ("org_id");
COMMENT ON TABLE "asset_folders" IS 'Asset folder (org-scoped).';
        CREATE TABLE IF NOT EXISTS "asset_tags" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "org_id" UUID NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    CONSTRAINT "uid_asset_tags_org_id_a7e226" UNIQUE ("org_id", "name")
);
CREATE INDEX IF NOT EXISTS "idx_asset_tags_created_468ce5" ON "asset_tags" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_asset_tags_org_id_695194" ON "asset_tags" ("org_id");
COMMENT ON TABLE "asset_tags" IS 'Simple asset tag (org-scoped).';
        CREATE TABLE IF NOT EXISTS "asset_tag_links" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "asset_id" UUID NOT NULL REFERENCES "assets" ("id") ON DELETE CASCADE,
    "tag_id" UUID NOT NULL REFERENCES "asset_tags" ("id") ON DELETE CASCADE,
    CONSTRAINT "uid_asset_tag_l_asset_i_857181" UNIQUE ("asset_id", "tag_id")
);
CREATE INDEX IF NOT EXISTS "idx_asset_tag_l_created_dbf81f" ON "asset_tag_links" ("created_at");
COMMENT ON TABLE "asset_tag_links" IS 'Many-to-many link between assets and tags.';
        ALTER TABLE "assets" ADD "folder_id" UUID;
        ALTER TABLE "assets" ADD CONSTRAINT "fk_assets_asset_fo_c7b6826a" FOREIGN KEY ("folder_id") REFERENCES "asset_folders" ("id") ON DELETE SET NULL;"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "assets" DROP CONSTRAINT IF EXISTS "fk_assets_asset_fo_c7b6826a";
        ALTER TABLE "assets" DROP COLUMN "folder_id";
        DROP TABLE IF EXISTS "asset_tag_links";
        DROP TABLE IF EXISTS "asset_folders";
        DROP TABLE IF EXISTS "asset_tags";"""


MODELS_STATE = (
    "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"
)
