from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        CREATE TABLE IF NOT EXISTS "assets" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "org_id" UUID NOT NULL,
    "owner_user_id" UUID,
    "purpose" VARCHAR(13) NOT NULL,
    "visibility" VARCHAR(7) NOT NULL DEFAULT 'public',
    "indexable" BOOL NOT NULL DEFAULT False,
    "title" VARCHAR(256),
    "slug" VARCHAR(128),
    "original_filename" VARCHAR(255),
    "mime" VARCHAR(128),
    "ext" VARCHAR(32),
    "size_bytes" BIGINT NOT NULL DEFAULT 0,
    "checksum_sha256" VARCHAR(64),
    "storage_provider" VARCHAR(32) NOT NULL DEFAULT 'local',
    "object_key" VARCHAR(1024) NOT NULL,
    "variants" JSONB,
    "meta" JSONB,
    "deleted_at" TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS "idx_assets_created_ec37b5" ON "assets" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_assets_org_id_945e19" ON "assets" ("org_id");
CREATE INDEX IF NOT EXISTS "idx_assets_owner_u_1fc153" ON "assets" ("owner_user_id");
CREATE INDEX IF NOT EXISTS "idx_assets_purpose_0ef2e2" ON "assets" ("purpose");
CREATE INDEX IF NOT EXISTS "idx_assets_visibil_b3729c" ON "assets" ("visibility");
CREATE INDEX IF NOT EXISTS "idx_assets_indexab_9d7447" ON "assets" ("indexable");
CREATE INDEX IF NOT EXISTS "idx_assets_checksu_b016f0" ON "assets" ("checksum_sha256");
CREATE INDEX IF NOT EXISTS "idx_assets_deleted_fb184e" ON "assets" ("deleted_at");
COMMENT ON COLUMN "assets"."purpose" IS 'AVATAR: avatar\nSITE_LOGO: site_logo\nFAVICON: favicon\nLIBRARY: library\nATTACHMENT: attachment\nARTICLE_COVER: article_cover';
COMMENT ON COLUMN "assets"."visibility" IS 'PUBLIC: public\nPRIVATE: private\nSHARED: shared';
COMMENT ON TABLE "assets" IS 'Immutable blob metadata.';
        CREATE TABLE IF NOT EXISTS "upload_sessions" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "org_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "purpose" VARCHAR(64) NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "mime" VARCHAR(128),
    "size_bytes" BIGINT NOT NULL DEFAULT 0,
    "expected_sha256" VARCHAR(64),
    "chunk_size" INT NOT NULL DEFAULT 0,
    "total_parts" INT NOT NULL DEFAULT 0,
    "status" VARCHAR(10) NOT NULL DEFAULT 'initiated',
    "expires_at" TIMESTAMPTZ NOT NULL,
    "asset_id" UUID,
    "target_folder_id" UUID,
    "storage_provider" VARCHAR(32) NOT NULL DEFAULT 'local'
);
CREATE INDEX IF NOT EXISTS "idx_upload_sess_created_e67c5e" ON "upload_sessions" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_upload_sess_org_id_b4c386" ON "upload_sessions" ("org_id");
CREATE INDEX IF NOT EXISTS "idx_upload_sess_actor_u_cd6dfc" ON "upload_sessions" ("actor_user_id");
CREATE INDEX IF NOT EXISTS "idx_upload_sess_purpose_55770b" ON "upload_sessions" ("purpose");
CREATE INDEX IF NOT EXISTS "idx_upload_sess_status_ae7b52" ON "upload_sessions" ("status");
CREATE INDEX IF NOT EXISTS "idx_upload_sess_expires_3a131a" ON "upload_sessions" ("expires_at");
CREATE INDEX IF NOT EXISTS "idx_upload_sess_asset_i_37343c" ON "upload_sessions" ("asset_id");
CREATE INDEX IF NOT EXISTS "idx_upload_sess_target__0ad59a" ON "upload_sessions" ("target_folder_id");
COMMENT ON COLUMN "upload_sessions"."status" IS 'INITIATED: initiated\nUPLOADING: uploading\nCOMPLETING: completing\nCOMPLETED: completed\nABORTED: aborted\nEXPIRED: expired';
        CREATE TABLE IF NOT EXISTS "upload_parts" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "part_number" INT NOT NULL,
    "size_bytes" INT NOT NULL DEFAULT 0,
    "checksum_sha256" VARCHAR(64),
    "object_key" VARCHAR(1024) NOT NULL,
    "stored" BOOL NOT NULL DEFAULT False,
    "session_id" UUID NOT NULL REFERENCES "upload_sessions" ("id") ON DELETE CASCADE,
    CONSTRAINT "uid_upload_part_session_2252ce" UNIQUE ("session_id", "part_number")
);
CREATE INDEX IF NOT EXISTS "idx_upload_part_created_14a9e8" ON "upload_parts" ("created_at");
        ALTER TABLE "users" ADD "avatar_asset_id" UUID;
        CREATE INDEX IF NOT EXISTS "idx_users_avatar__0b9eb3" ON "users" ("avatar_asset_id");"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        DROP INDEX IF EXISTS "idx_users_avatar__0b9eb3";
        ALTER TABLE "users" DROP COLUMN "avatar_asset_id";
        DROP TABLE IF EXISTS "upload_parts";
        DROP TABLE IF EXISTS "assets";
        DROP TABLE IF EXISTS "upload_sessions";"""


MODELS_STATE = (
    "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"
)
