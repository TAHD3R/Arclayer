from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        CREATE TABLE IF NOT EXISTS "rbac_org_department_roles" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "department_id" UUID NOT NULL REFERENCES "org_departments" ("id") ON DELETE CASCADE,
    "role_id" UUID NOT NULL REFERENCES "roles" ("id") ON DELETE CASCADE,
    CONSTRAINT "uid_rbac_org_de_departm_2bb039" UNIQUE ("department_id", "role_id")
);
CREATE INDEX IF NOT EXISTS "idx_rbac_org_de_created_453fba" ON "rbac_org_department_roles" ("created_at");
        CREATE TABLE IF NOT EXISTS "rbac_org_position_roles" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "position_id" UUID NOT NULL REFERENCES "org_positions" ("id") ON DELETE CASCADE,
    "role_id" UUID NOT NULL REFERENCES "roles" ("id") ON DELETE CASCADE,
    CONSTRAINT "uid_rbac_org_po_positio_19fd87" UNIQUE ("position_id", "role_id")
);
CREATE INDEX IF NOT EXISTS "idx_rbac_org_po_created_4c5c7d" ON "rbac_org_position_roles" ("created_at");"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        DROP TABLE IF EXISTS "rbac_org_department_roles";
        DROP TABLE IF EXISTS "rbac_org_position_roles";"""


MODELS_STATE = (
    "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"
    "1zTSnw66bz65f/A1UWuTg="
)
