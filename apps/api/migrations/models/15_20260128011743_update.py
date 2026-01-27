from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        CREATE TABLE IF NOT EXISTS "organizations" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "slug" VARCHAR(64) NOT NULL UNIQUE,
    "name" VARCHAR(128) NOT NULL,
    "logo_url" VARCHAR(512),
    "is_active" BOOL NOT NULL DEFAULT True
);
CREATE INDEX IF NOT EXISTS "idx_organizatio_created_8e6745" ON "organizations" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_organizatio_slug_81ed67" ON "organizations" ("slug");
CREATE INDEX IF NOT EXISTS "idx_organizatio_is_acti_fea722" ON "organizations" ("is_active");
COMMENT ON TABLE "organizations" IS 'Tenant boundary (workspace/site).';
        CREATE TABLE IF NOT EXISTS "memberships" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" VARCHAR(8) NOT NULL DEFAULT 'active',
    "invited_by_user_id" UUID,
    "organization_id" UUID NOT NULL REFERENCES "organizations" ("id") ON DELETE CASCADE,
    "user_id" UUID NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
    CONSTRAINT "uid_memberships_user_id_1030f0" UNIQUE ("user_id", "organization_id")
);
CREATE INDEX IF NOT EXISTS "idx_memberships_created_760064" ON "memberships" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_memberships_status_24c9b3" ON "memberships" ("status");
CREATE INDEX IF NOT EXISTS "idx_memberships_invited_c6e188" ON "memberships" ("invited_by_user_id");
COMMENT ON COLUMN "memberships"."status" IS 'ACTIVE: active\nINVITED: invited\nDISABLED: disabled';
COMMENT ON TABLE "memberships" IS 'User membership in an organization (identity under a tenant).';
        CREATE TABLE IF NOT EXISTS "membership_roles" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "membership_id" UUID NOT NULL REFERENCES "memberships" ("id") ON DELETE CASCADE,
    "role_id" UUID NOT NULL REFERENCES "roles" ("id") ON DELETE CASCADE,
    CONSTRAINT "uid_membership__members_48f3bd" UNIQUE ("membership_id", "role_id")
);
CREATE INDEX IF NOT EXISTS "idx_membership__created_5f7665" ON "membership_roles" ("created_at");"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        DROP TABLE IF EXISTS "membership_roles";
        DROP TABLE IF EXISTS "memberships";
        DROP TABLE IF EXISTS "organizations";"""


MODELS_STATE = (
    "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"
)
