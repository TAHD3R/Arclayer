from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        CREATE TABLE IF NOT EXISTS "admin_menu_items" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "code" VARCHAR(64) NOT NULL UNIQUE,
    "title" VARCHAR(128) NOT NULL,
    "title_i18n" VARCHAR(128),
    "icon" VARCHAR(64),
    "type" VARCHAR(5) NOT NULL DEFAULT 'item',
    "path" VARCHAR(256),
    "name" VARCHAR(128),
    "component_key" VARCHAR(128),
    "redirect" VARCHAR(256),
    "sort" INT NOT NULL DEFAULT 0,
    "is_active" BOOL NOT NULL DEFAULT True,
    "permission_code" VARCHAR(128),
    "meta" JSONB,
    "deleted_at" TIMESTAMPTZ,
    "parent_id" UUID REFERENCES "admin_menu_items" ("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "idx_admin_menu__created_4c3912" ON "admin_menu_items" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_admin_menu__code_db88ef" ON "admin_menu_items" ("code");
CREATE INDEX IF NOT EXISTS "idx_admin_menu__type_228537" ON "admin_menu_items" ("type");
CREATE INDEX IF NOT EXISTS "idx_admin_menu__name_60cc64" ON "admin_menu_items" ("name");
CREATE INDEX IF NOT EXISTS "idx_admin_menu__sort_0d2aee" ON "admin_menu_items" ("sort");
CREATE INDEX IF NOT EXISTS "idx_admin_menu__is_acti_f54fa6" ON "admin_menu_items" ("is_active");
CREATE INDEX IF NOT EXISTS "idx_admin_menu__permiss_6b6a12" ON "admin_menu_items" ("permission_code");
CREATE INDEX IF NOT EXISTS "idx_admin_menu__deleted_9a73e5" ON "admin_menu_items" ("deleted_at");
COMMENT ON COLUMN "admin_menu_items"."type" IS 'GROUP: group\nITEM: item';
COMMENT ON TABLE "admin_menu_items" IS 'Admin menu item stored in DB for dynamic routing.';
        ALTER TABLE "org_departments" ADD "depth" INT NOT NULL DEFAULT 0;
        ALTER TABLE "org_departments" ADD "path" VARCHAR(1024);
        ALTER TABLE "org_departments" ADD "deleted_at" TIMESTAMPTZ;
        CREATE INDEX IF NOT EXISTS "idx_org_departm_depth_194f8d" ON "org_departments" ("depth");
        CREATE INDEX IF NOT EXISTS "idx_org_departm_path_6fca61" ON "org_departments" ("path");
        CREATE INDEX IF NOT EXISTS "idx_org_departm_deleted_4f7b8b" ON "org_departments" ("deleted_at");"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        DROP INDEX IF EXISTS "idx_org_departm_deleted_4f7b8b";
        DROP INDEX IF EXISTS "idx_org_departm_path_6fca61";
        DROP INDEX IF EXISTS "idx_org_departm_depth_194f8d";
        ALTER TABLE "org_departments" DROP COLUMN "depth";
        ALTER TABLE "org_departments" DROP COLUMN "path";
        ALTER TABLE "org_departments" DROP COLUMN "deleted_at";
        DROP TABLE IF EXISTS "admin_menu_items";"""


MODELS_STATE = (
    "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"
    "LBuOKV3mmFLg123n17/+D1G0ftU="
)
