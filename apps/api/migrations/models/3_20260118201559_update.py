from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        CREATE TABLE IF NOT EXISTS "permissions" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "code" VARCHAR(128) NOT NULL UNIQUE,
    "name" VARCHAR(128) NOT NULL,
    "description" TEXT,
    "plugin_id" VARCHAR(128)
);
CREATE INDEX IF NOT EXISTS "idx_permissions_created_d3f1fc" ON "permissions" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_permissions_code_8330fb" ON "permissions" ("code");
CREATE INDEX IF NOT EXISTS "idx_permissions_plugin__f896e4" ON "permissions" ("plugin_id");
        CREATE TABLE IF NOT EXISTS "roles" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "code" VARCHAR(64) NOT NULL UNIQUE,
    "name" VARCHAR(128) NOT NULL,
    "description" TEXT,
    "is_default" BOOL NOT NULL DEFAULT False,
    "is_superuser" BOOL NOT NULL DEFAULT False
);
CREATE INDEX IF NOT EXISTS "idx_roles_created_d2c0eb" ON "roles" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_roles_code_4f0799" ON "roles" ("code");
CREATE INDEX IF NOT EXISTS "idx_roles_is_defa_a30952" ON "roles" ("is_default");
CREATE INDEX IF NOT EXISTS "idx_roles_is_supe_43b615" ON "roles" ("is_superuser");
        CREATE TABLE IF NOT EXISTS "role_permissions" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "permission_id" UUID NOT NULL REFERENCES "permissions" ("id") ON DELETE CASCADE,
    "role_id" UUID NOT NULL REFERENCES "roles" ("id") ON DELETE CASCADE,
    CONSTRAINT "uid_role_permis_role_id_6a25fe" UNIQUE ("role_id", "permission_id")
);
CREATE INDEX IF NOT EXISTS "idx_role_permis_created_eaa972" ON "role_permissions" ("created_at");
        CREATE TABLE IF NOT EXISTS "user_roles" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "role_id" UUID NOT NULL REFERENCES "roles" ("id") ON DELETE CASCADE,
    "user_id" UUID NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
    CONSTRAINT "uid_user_roles_user_id_63f1a8" UNIQUE ("user_id", "role_id")
);
CREATE INDEX IF NOT EXISTS "idx_user_roles_created_cc803e" ON "user_roles" ("created_at");"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        DROP TABLE IF EXISTS "permissions";
        DROP TABLE IF EXISTS "user_roles";
        DROP TABLE IF EXISTS "role_permissions";
        DROP TABLE IF EXISTS "roles";"""


MODELS_STATE = (
    "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"
    "4LaXFOpD/jZeU0h+qDroKBN0PCZZfvgFiY9jog=="
)
