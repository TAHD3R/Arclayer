from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        CREATE TABLE IF NOT EXISTS "org_change_logs" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_user_id" UUID,
    "action" VARCHAR(64) NOT NULL,
    "entity_type" VARCHAR(64),
    "entity_id" UUID,
    "payload" JSONB
);
CREATE INDEX IF NOT EXISTS "idx_org_change__created_474311" ON "org_change_logs" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_org_change__actor_u_6c5d3f" ON "org_change_logs" ("actor_user_id");
CREATE INDEX IF NOT EXISTS "idx_org_change__action_6b16c6" ON "org_change_logs" ("action");
CREATE INDEX IF NOT EXISTS "idx_org_change__entity__3758e5" ON "org_change_logs" ("entity_type");
CREATE INDEX IF NOT EXISTS "idx_org_change__entity__2de43a" ON "org_change_logs" ("entity_id");
COMMENT ON TABLE "org_change_logs" IS '组织结构调整审计日志。';"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        DROP TABLE IF EXISTS "org_change_logs";"""


MODELS_STATE = (
    "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"
)
