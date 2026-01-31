from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        CREATE TABLE IF NOT EXISTS "notifications" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "org_id" UUID NOT NULL,
    "recipient_user_id" UUID NOT NULL,
    "category" VARCHAR(8) NOT NULL,
    "title" VARCHAR(256) NOT NULL,
    "body" VARCHAR(512),
    "target_to" VARCHAR(512) NOT NULL,
    "target_meta" JSONB,
    "actor_user_id" UUID,
    "event_name" VARCHAR(128),
    "dedupe_key" VARCHAR(128),
    "read_at" TIMESTAMPTZ,
    CONSTRAINT "uid_notificatio_org_id_6771c1" UNIQUE ("org_id", "recipient_user_id", "dedupe_key")
);
CREATE INDEX IF NOT EXISTS "idx_notificatio_created_5f34f1" ON "notifications" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_notificatio_org_id_aa111c" ON "notifications" ("org_id");
CREATE INDEX IF NOT EXISTS "idx_notificatio_recipie_b1a787" ON "notifications" ("recipient_user_id");
CREATE INDEX IF NOT EXISTS "idx_notificatio_categor_2f147b" ON "notifications" ("category");
CREATE INDEX IF NOT EXISTS "idx_notificatio_actor_u_b2f0ef" ON "notifications" ("actor_user_id");
CREATE INDEX IF NOT EXISTS "idx_notificatio_event_n_a95f40" ON "notifications" ("event_name");
CREATE INDEX IF NOT EXISTS "idx_notificatio_read_at_cb5898" ON "notifications" ("read_at");
COMMENT ON COLUMN "notifications"."category" IS 'TEAM: team\nSECURITY: security\nTASK: task';
COMMENT ON TABLE "notifications" IS 'Per-user notification inbox record (org-scoped).';"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        DROP TABLE IF EXISTS "notifications";"""


MODELS_STATE = (
    "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"
    "MJH/9f/w9mRZRY"
)
