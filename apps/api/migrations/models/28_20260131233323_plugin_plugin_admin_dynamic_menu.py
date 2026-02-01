from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        CREATE TABLE IF NOT EXISTS "org_memberships" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_owner" BOOL NOT NULL DEFAULT False,
    "status" VARCHAR(16) NOT NULL DEFAULT 'active',
    "organization_id" UUID NOT NULL REFERENCES "organizations" ("id") ON DELETE CASCADE,
    "user_id" UUID NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
    CONSTRAINT "uid_org_members_user_id_a2e50d" UNIQUE ("user_id")
);
CREATE INDEX IF NOT EXISTS "idx_org_members_created_48352c" ON "org_memberships" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_org_members_is_owne_381f56" ON "org_memberships" ("is_owner");
CREATE INDEX IF NOT EXISTS "idx_org_members_status_999411" ON "org_memberships" ("status");
COMMENT ON TABLE "org_memberships" IS 'User membership in an organization.';
        CREATE TABLE IF NOT EXISTS "workspaces" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "slug" VARCHAR(64) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "is_active" BOOL NOT NULL DEFAULT True,
    "created_by_user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL REFERENCES "organizations" ("id") ON DELETE CASCADE,
    CONSTRAINT "uid_workspaces_organiz_821430" UNIQUE ("organization_id", "slug")
);
CREATE INDEX IF NOT EXISTS "idx_workspaces_created_4a39a0" ON "workspaces" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_workspaces_slug_4c0966" ON "workspaces" ("slug");
CREATE INDEX IF NOT EXISTS "idx_workspaces_is_acti_92171c" ON "workspaces" ("is_active");
CREATE INDEX IF NOT EXISTS "idx_workspaces_created_88a686" ON "workspaces" ("created_by_user_id");
COMMENT ON TABLE "workspaces" IS 'Workspace (project) under an organization.';
        CREATE TABLE IF NOT EXISTS "workspace_email_invites" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email" VARCHAR(255) NOT NULL,
    "role_code" VARCHAR(64),
    "code" VARCHAR(64) NOT NULL UNIQUE,
    "expires_at" TIMESTAMPTZ,
    "created_by_user_id" UUID NOT NULL,
    "accepted_by_user_id" UUID,
    "accepted_at" TIMESTAMPTZ,
    "revoked_by_user_id" UUID,
    "revoked_at" TIMESTAMPTZ,
    "organization_id" UUID NOT NULL REFERENCES "organizations" ("id") ON DELETE CASCADE,
    "workspace_id" UUID NOT NULL REFERENCES "workspaces" ("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_workspace_e_created_a99658" ON "workspace_email_invites" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_workspace_e_email_336b93" ON "workspace_email_invites" ("email");
CREATE INDEX IF NOT EXISTS "idx_workspace_e_role_co_8d8a44" ON "workspace_email_invites" ("role_code");
CREATE INDEX IF NOT EXISTS "idx_workspace_e_code_4d3850" ON "workspace_email_invites" ("code");
CREATE INDEX IF NOT EXISTS "idx_workspace_e_expires_957b82" ON "workspace_email_invites" ("expires_at");
CREATE INDEX IF NOT EXISTS "idx_workspace_e_created_638988" ON "workspace_email_invites" ("created_by_user_id");
CREATE INDEX IF NOT EXISTS "idx_workspace_e_accepte_caf61b" ON "workspace_email_invites" ("accepted_by_user_id");
CREATE INDEX IF NOT EXISTS "idx_workspace_e_accepte_c576f0" ON "workspace_email_invites" ("accepted_at");
CREATE INDEX IF NOT EXISTS "idx_workspace_e_revoked_5c2cff" ON "workspace_email_invites" ("revoked_by_user_id");
CREATE INDEX IF NOT EXISTS "idx_workspace_e_revoked_99d4f1" ON "workspace_email_invites" ("revoked_at");
COMMENT ON TABLE "workspace_email_invites" IS 'Email-bound invite (Pending/Accepted list).';
        CREATE TABLE IF NOT EXISTS "workspace_invite_links" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "role_code" VARCHAR(64),
    "code" VARCHAR(64) NOT NULL UNIQUE,
    "display_code" VARCHAR(32) NOT NULL UNIQUE,
    "expires_at" TIMESTAMPTZ,
    "disabled_at" TIMESTAMPTZ,
    "max_uses" INT,
    "allowed_email_domain" VARCHAR(128),
    "created_by_user_id" UUID,
    "uses_count" INT NOT NULL DEFAULT 0,
    "last_used_by_user_id" UUID,
    "last_used_at" TIMESTAMPTZ,
    "organization_id" UUID NOT NULL REFERENCES "organizations" ("id") ON DELETE CASCADE,
    "workspace_id" UUID NOT NULL REFERENCES "workspaces" ("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_workspace_i_created_fef546" ON "workspace_invite_links" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_workspace_i_role_co_a3cd89" ON "workspace_invite_links" ("role_code");
CREATE INDEX IF NOT EXISTS "idx_workspace_i_code_b11bb9" ON "workspace_invite_links" ("code");
CREATE INDEX IF NOT EXISTS "idx_workspace_i_display_c6a1fa" ON "workspace_invite_links" ("display_code");
CREATE INDEX IF NOT EXISTS "idx_workspace_i_expires_5e9bfa" ON "workspace_invite_links" ("expires_at");
CREATE INDEX IF NOT EXISTS "idx_workspace_i_disable_35d395" ON "workspace_invite_links" ("disabled_at");
CREATE INDEX IF NOT EXISTS "idx_workspace_i_created_cae28b" ON "workspace_invite_links" ("created_by_user_id");
CREATE INDEX IF NOT EXISTS "idx_workspace_i_last_us_626234" ON "workspace_invite_links" ("last_used_by_user_id");
COMMENT ON TABLE "workspace_invite_links" IS 'Reusable invite link.';
        CREATE TABLE IF NOT EXISTS "workspace_invite_link_use_events" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used_by_user_id" UUID NOT NULL,
    "used_at" TIMESTAMPTZ NOT NULL,
    "joined_membership_id" UUID,
    "link_id" UUID NOT NULL REFERENCES "workspace_invite_links" ("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_workspace_i_created_3fcce2" ON "workspace_invite_link_use_events" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_workspace_i_used_by_42a0bb" ON "workspace_invite_link_use_events" ("used_by_user_id");
CREATE INDEX IF NOT EXISTS "idx_workspace_i_used_at_f66117" ON "workspace_invite_link_use_events" ("used_at");
CREATE INDEX IF NOT EXISTS "idx_workspace_i_joined__e8e332" ON "workspace_invite_link_use_events" ("joined_membership_id");
COMMENT ON TABLE "workspace_invite_link_use_events" IS 'Invite link usage event (participants).';
        CREATE TABLE IF NOT EXISTS "workspace_memberships" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" VARCHAR(8) NOT NULL DEFAULT 'active',
    "invited_by_user_id" UUID,
    "user_id" UUID NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
    "workspace_id" UUID NOT NULL REFERENCES "workspaces" ("id") ON DELETE CASCADE,
    CONSTRAINT "uid_workspace_m_workspa_1b27c7" UNIQUE ("workspace_id", "user_id")
);
CREATE INDEX IF NOT EXISTS "idx_workspace_m_created_63697e" ON "workspace_memberships" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_workspace_m_status_521069" ON "workspace_memberships" ("status");
CREATE INDEX IF NOT EXISTS "idx_workspace_m_invited_f2dc1d" ON "workspace_memberships" ("invited_by_user_id");
COMMENT ON COLUMN "workspace_memberships"."status" IS 'ACTIVE: active\nINVITED: invited\nDISABLED: disabled';
COMMENT ON TABLE "workspace_memberships" IS 'User membership in a workspace (the admin governance boundary).';
        CREATE TABLE IF NOT EXISTS "workspace_membership_roles" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "membership_id" UUID NOT NULL REFERENCES "workspace_memberships" ("id") ON DELETE CASCADE,
    "role_id" UUID NOT NULL REFERENCES "roles" ("id") ON DELETE CASCADE,
    CONSTRAINT "uid_workspace_m_members_789227" UNIQUE ("membership_id", "role_id")
);
CREATE INDEX IF NOT EXISTS "idx_workspace_m_created_c7184e" ON "workspace_membership_roles" ("created_at");
COMMENT ON TABLE "workspace_membership_roles" IS 'Role binding for a workspace membership.';"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        DROP TABLE IF EXISTS "org_memberships";
        DROP TABLE IF EXISTS "workspace_invite_link_use_events";
        DROP TABLE IF EXISTS "workspace_invite_links";
        DROP TABLE IF EXISTS "workspace_email_invites";
        DROP TABLE IF EXISTS "workspace_memberships";
        DROP TABLE IF EXISTS "workspace_membership_roles";
        DROP TABLE IF EXISTS "workspaces";"""


MODELS_STATE = (
    "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"
    "PofktC2T59PI1dbJ2t31f31/8DIoydgw=="
)
