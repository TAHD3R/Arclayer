from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        CREATE TABLE IF NOT EXISTS "org_departments" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "code" VARCHAR(64) UNIQUE,
    "name" VARCHAR(128) NOT NULL,
    "sort" INT NOT NULL DEFAULT 0,
    "is_active" BOOL NOT NULL DEFAULT True,
    "description" TEXT,
    "parent_id" UUID REFERENCES "org_departments" ("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "idx_org_departm_created_efe009" ON "org_departments" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_org_departm_code_e29b53" ON "org_departments" ("code");
CREATE INDEX IF NOT EXISTS "idx_org_departm_sort_5fcf4b" ON "org_departments" ("sort");
CREATE INDEX IF NOT EXISTS "idx_org_departm_is_acti_3cb65e" ON "org_departments" ("is_active");
        CREATE TABLE IF NOT EXISTS "org_positions" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "code" VARCHAR(64) NOT NULL UNIQUE,
    "name" VARCHAR(128) NOT NULL,
    "sort" INT NOT NULL DEFAULT 0,
    "is_active" BOOL NOT NULL DEFAULT True,
    "description" TEXT
);
CREATE INDEX IF NOT EXISTS "idx_org_positio_created_ead606" ON "org_positions" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_org_positio_code_2b5609" ON "org_positions" ("code");
CREATE INDEX IF NOT EXISTS "idx_org_positio_sort_f37f80" ON "org_positions" ("sort");
CREATE INDEX IF NOT EXISTS "idx_org_positio_is_acti_078288" ON "org_positions" ("is_active");
        CREATE TABLE IF NOT EXISTS "org_user_departments" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_primary" BOOL NOT NULL DEFAULT False,
    "department_id" UUID NOT NULL REFERENCES "org_departments" ("id") ON DELETE CASCADE,
    "user_id" UUID NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
    CONSTRAINT "uid_org_user_de_user_id_852b8a" UNIQUE ("user_id", "department_id")
);
CREATE INDEX IF NOT EXISTS "idx_org_user_de_created_901728" ON "org_user_departments" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_org_user_de_is_prim_119458" ON "org_user_departments" ("is_primary");
        CREATE TABLE IF NOT EXISTS "org_user_positions" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "position_id" UUID NOT NULL REFERENCES "org_positions" ("id") ON DELETE CASCADE,
    "user_id" UUID NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
    CONSTRAINT "uid_org_user_po_user_id_3f07fc" UNIQUE ("user_id", "position_id")
);
CREATE INDEX IF NOT EXISTS "idx_org_user_po_created_53bcb4" ON "org_user_positions" ("created_at");"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        DROP TABLE IF EXISTS "org_positions";
        DROP TABLE IF EXISTS "org_user_positions";
        DROP TABLE IF EXISTS "org_user_departments";
        DROP TABLE IF EXISTS "org_departments";"""


MODELS_STATE = (
    "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"
    "WemxTsr8+D94SMPx"
)
