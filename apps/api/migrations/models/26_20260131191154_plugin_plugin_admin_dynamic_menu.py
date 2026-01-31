from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        CREATE TABLE IF NOT EXISTS "organization_invite_links" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "role_code" VARCHAR(64),
    "token_hash" VARCHAR(64) NOT NULL UNIQUE,
    "code" VARCHAR(32) NOT NULL UNIQUE,
    "expires_at" TIMESTAMPTZ,
    "disabled_at" TIMESTAMPTZ,
    "created_by_user_id" UUID,
    "uses_count" INT NOT NULL DEFAULT 0,
    "last_used_by_user_id" UUID,
    "last_used_at" TIMESTAMPTZ,
    "organization_id" UUID NOT NULL REFERENCES "organizations" ("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_organizatio_created_f68757" ON "organization_invite_links" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_organizatio_role_co_091370" ON "organization_invite_links" ("role_code");
CREATE INDEX IF NOT EXISTS "idx_organizatio_token_h_67d700" ON "organization_invite_links" ("token_hash");
CREATE INDEX IF NOT EXISTS "idx_organizatio_code_f5962b" ON "organization_invite_links" ("code");
CREATE INDEX IF NOT EXISTS "idx_organizatio_expires_fc943f" ON "organization_invite_links" ("expires_at");
CREATE INDEX IF NOT EXISTS "idx_organizatio_disable_bcc633" ON "organization_invite_links" ("disabled_at");
CREATE INDEX IF NOT EXISTS "idx_organizatio_created_e0e9b8" ON "organization_invite_links" ("created_by_user_id");
CREATE INDEX IF NOT EXISTS "idx_organizatio_last_us_e19e62" ON "organization_invite_links" ("last_used_by_user_id");
COMMENT ON TABLE "organization_invite_links" IS 'Reusable organization invite link.';"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        DROP TABLE IF EXISTS "organization_invite_links";"""


MODELS_STATE = (
    "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"
    "VkyN1iU2CN0Z1b/yO2eCoU/1jAx//P/wP6ruNT"
)
