from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        CREATE TABLE IF NOT EXISTS "organization_invitations" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email" VARCHAR(255) NOT NULL,
    "role_code" VARCHAR(64),
    "token_hash" VARCHAR(64) NOT NULL UNIQUE,
    "expires_at" TIMESTAMPTZ,
    "invited_by_user_id" UUID,
    "accepted_by_user_id" UUID,
    "accepted_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,
    "organization_id" UUID NOT NULL REFERENCES "organizations" ("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_organizatio_created_85b029" ON "organization_invitations" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_organizatio_email_b33be4" ON "organization_invitations" ("email");
CREATE INDEX IF NOT EXISTS "idx_organizatio_role_co_28b9c7" ON "organization_invitations" ("role_code");
CREATE INDEX IF NOT EXISTS "idx_organizatio_token_h_28892b" ON "organization_invitations" ("token_hash");
CREATE INDEX IF NOT EXISTS "idx_organizatio_expires_ea4bfe" ON "organization_invitations" ("expires_at");
CREATE INDEX IF NOT EXISTS "idx_organizatio_invited_6dba71" ON "organization_invitations" ("invited_by_user_id");
CREATE INDEX IF NOT EXISTS "idx_organizatio_accepte_c67ca8" ON "organization_invitations" ("accepted_by_user_id");
COMMENT ON TABLE "organization_invitations" IS 'Organization invitation for onboarding new members without public registration.';"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        DROP TABLE IF EXISTS "organization_invitations";"""


MODELS_STATE = (
    "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"
)
