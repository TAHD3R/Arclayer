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
CREATE TABLE IF NOT EXISTS "aerich" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "version" VARCHAR(255) NOT NULL,
    "app" VARCHAR(100) NOT NULL,
    "content" JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS "asset_folders" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspace_id" UUID NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "description" VARCHAR(512),
    "sort_order" INT NOT NULL DEFAULT 0,
    "parent_id" UUID REFERENCES "asset_folders" ("id") ON DELETE SET NULL,
    CONSTRAINT "uid_asset_folde_workspa_20e941" UNIQUE ("workspace_id", "parent_id", "name")
);
CREATE INDEX IF NOT EXISTS "idx_asset_folde_created_8bb214" ON "asset_folders" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_asset_folde_workspa_bd2357" ON "asset_folders" ("workspace_id");
COMMENT ON TABLE "asset_folders" IS 'Asset folder (workspace-scoped in v2).';
CREATE TABLE IF NOT EXISTS "assetrecord" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspace_id" UUID NOT NULL,
    "owner_user_id" UUID,
    "purpose" VARCHAR(13) NOT NULL,
    "visibility" VARCHAR(7) NOT NULL DEFAULT 'public',
    "indexable" BOOL NOT NULL DEFAULT False,
    "title" VARCHAR(256),
    "slug" VARCHAR(128),
    "original_filename" VARCHAR(255),
    "mime" VARCHAR(128),
    "ext" VARCHAR(32),
    "size_bytes" BIGINT NOT NULL DEFAULT 0,
    "checksum_sha256" VARCHAR(64),
    "storage_provider" VARCHAR(32) NOT NULL DEFAULT 'local',
    "object_key" VARCHAR(1024) NOT NULL,
    "variants" JSONB,
    "meta" JSONB,
    "deleted_at" TIMESTAMPTZ,
    "folder_id" UUID REFERENCES "asset_folders" ("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "idx_assetrecord_created_b77b10" ON "assetrecord" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_assetrecord_workspa_03a255" ON "assetrecord" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_assetrecord_owner_u_93de6b" ON "assetrecord" ("owner_user_id");
CREATE INDEX IF NOT EXISTS "idx_assetrecord_purpose_fde7ef" ON "assetrecord" ("purpose");
CREATE INDEX IF NOT EXISTS "idx_assetrecord_visibil_875069" ON "assetrecord" ("visibility");
CREATE INDEX IF NOT EXISTS "idx_assetrecord_indexab_8da975" ON "assetrecord" ("indexable");
CREATE INDEX IF NOT EXISTS "idx_assetrecord_checksu_0521e7" ON "assetrecord" ("checksum_sha256");
CREATE INDEX IF NOT EXISTS "idx_assetrecord_deleted_2938fe" ON "assetrecord" ("deleted_at");
COMMENT ON COLUMN "assetrecord"."purpose" IS 'AVATAR: avatar\nSITE_LOGO: site_logo\nFAVICON: favicon\nLIBRARY: library\nATTACHMENT: attachment\nARTICLE_COVER: article_cover';
COMMENT ON COLUMN "assetrecord"."visibility" IS 'PUBLIC: public\nPRIVATE: private\nSHARED: shared';
COMMENT ON TABLE "assetrecord" IS 'Immutable blob metadata.';
CREATE TABLE IF NOT EXISTS "asset_share_links" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspace_id" UUID NOT NULL,
    "token" VARCHAR(64) NOT NULL UNIQUE,
    "expires_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,
    "created_by_user_id" UUID,
    "asset_id" UUID NOT NULL REFERENCES "assetrecord" ("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_asset_share_created_b1e9a3" ON "asset_share_links" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_asset_share_workspa_90e1dd" ON "asset_share_links" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_asset_share_token_3aca7d" ON "asset_share_links" ("token");
CREATE INDEX IF NOT EXISTS "idx_asset_share_expires_5d7ae7" ON "asset_share_links" ("expires_at");
CREATE INDEX IF NOT EXISTS "idx_asset_share_revoked_a9ff80" ON "asset_share_links" ("revoked_at");
CREATE INDEX IF NOT EXISTS "idx_asset_share_created_6387ca" ON "asset_share_links" ("created_by_user_id");
COMMENT ON TABLE "asset_share_links" IS 'Link-only share access for a single asset.';
CREATE TABLE IF NOT EXISTS "asset_tags" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspace_id" UUID NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    CONSTRAINT "uid_asset_tags_workspa_324b91" UNIQUE ("workspace_id", "name")
);
CREATE INDEX IF NOT EXISTS "idx_asset_tags_created_468ce5" ON "asset_tags" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_asset_tags_workspa_114d45" ON "asset_tags" ("workspace_id");
COMMENT ON TABLE "asset_tags" IS 'Simple asset tag (workspace-scoped in v2).';
CREATE TABLE IF NOT EXISTS "asset_tag_links" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "asset_id" UUID NOT NULL REFERENCES "assetrecord" ("id") ON DELETE CASCADE,
    "tag_id" UUID NOT NULL REFERENCES "asset_tags" ("id") ON DELETE CASCADE,
    CONSTRAINT "uid_asset_tag_l_asset_i_857181" UNIQUE ("asset_id", "tag_id")
);
CREATE INDEX IF NOT EXISTS "idx_asset_tag_l_created_dbf81f" ON "asset_tag_links" ("created_at");
COMMENT ON TABLE "asset_tag_links" IS 'Many-to-many link between assets and tags.';
CREATE TABLE IF NOT EXISTS "asset_usages" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspace_id" UUID NOT NULL,
    "purpose" VARCHAR(64) NOT NULL,
    "entity_type" VARCHAR(128) NOT NULL,
    "entity_id" VARCHAR(128) NOT NULL,
    "field_key" VARCHAR(128) NOT NULL,
    "created_by_user_id" UUID,
    "asset_id" UUID NOT NULL REFERENCES "assetrecord" ("id") ON DELETE CASCADE,
    CONSTRAINT "uid_asset_usage_workspa_4b4387" UNIQUE ("workspace_id", "entity_type", "entity_id", "field_key")
);
CREATE INDEX IF NOT EXISTS "idx_asset_usage_created_3bdf90" ON "asset_usages" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_asset_usage_workspa_ef1ae7" ON "asset_usages" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_asset_usage_purpose_9a493e" ON "asset_usages" ("purpose");
CREATE INDEX IF NOT EXISTS "idx_asset_usage_entity__2b2bbf" ON "asset_usages" ("entity_type");
CREATE INDEX IF NOT EXISTS "idx_asset_usage_entity__c7036d" ON "asset_usages" ("entity_id");
CREATE INDEX IF NOT EXISTS "idx_asset_usage_field_k_a6938f" ON "asset_usages" ("field_key");
CREATE INDEX IF NOT EXISTS "idx_asset_usage_created_732343" ON "asset_usages" ("created_by_user_id");
COMMENT ON TABLE "asset_usages" IS 'Asset usage reference (workspace-scoped in v2).';
CREATE TABLE IF NOT EXISTS "rbac_bootstrap_state" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "key" VARCHAR(64) NOT NULL UNIQUE,
    "done" BOOL NOT NULL DEFAULT False,
    "done_at" TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS "idx_rbac_bootst_created_96b1a1" ON "rbac_bootstrap_state" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_rbac_bootst_key_8cb9bd" ON "rbac_bootstrap_state" ("key");
CREATE INDEX IF NOT EXISTS "idx_rbac_bootst_done_010fb9" ON "rbac_bootstrap_state" ("done");
COMMENT ON TABLE "rbac_bootstrap_state" IS 'One-time RBAC bootstrap marker.';
CREATE TABLE IF NOT EXISTS "notifications" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspace_id" UUID NOT NULL,
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
    CONSTRAINT "uid_notificatio_workspa_f5840a" UNIQUE ("workspace_id", "recipient_user_id", "dedupe_key")
);
CREATE INDEX IF NOT EXISTS "idx_notificatio_created_5f34f1" ON "notifications" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_notificatio_workspa_a39961" ON "notifications" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_notificatio_recipie_b1a787" ON "notifications" ("recipient_user_id");
CREATE INDEX IF NOT EXISTS "idx_notificatio_categor_2f147b" ON "notifications" ("category");
CREATE INDEX IF NOT EXISTS "idx_notificatio_actor_u_b2f0ef" ON "notifications" ("actor_user_id");
CREATE INDEX IF NOT EXISTS "idx_notificatio_event_n_a95f40" ON "notifications" ("event_name");
CREATE INDEX IF NOT EXISTS "idx_notificatio_read_at_cb5898" ON "notifications" ("read_at");
COMMENT ON COLUMN "notifications"."category" IS 'TEAM: team\nSECURITY: security\nTASK: task';
COMMENT ON TABLE "notifications" IS 'Per-user notification inbox record (workspace-scoped in v2).';
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
COMMENT ON TABLE "organizations" IS 'Organization (account-level container).';
CREATE TABLE IF NOT EXISTS "permissions" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "code" VARCHAR(128) NOT NULL UNIQUE,
    "scope" VARCHAR(9) NOT NULL DEFAULT 'workspace',
    "name" VARCHAR(128) NOT NULL,
    "description" TEXT,
    "name_i18n" VARCHAR(200),
    "description_i18n" VARCHAR(200),
    "plugin_id" VARCHAR(128)
);
CREATE INDEX IF NOT EXISTS "idx_permissions_created_d3f1fc" ON "permissions" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_permissions_code_8330fb" ON "permissions" ("code");
CREATE INDEX IF NOT EXISTS "idx_permissions_scope_c1baed" ON "permissions" ("scope");
CREATE INDEX IF NOT EXISTS "idx_permissions_plugin__f896e4" ON "permissions" ("plugin_id");
COMMENT ON COLUMN "permissions"."scope" IS 'ORG: org\nWORKSPACE: workspace';
COMMENT ON TABLE "permissions" IS 'RBAC permission.';
CREATE TABLE IF NOT EXISTS "plugins" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "plugin_id" VARCHAR(128) NOT NULL UNIQUE,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "author" VARCHAR(200) NOT NULL,
    "version" VARCHAR(64) NOT NULL,
    "requires" VARCHAR(64) NOT NULL,
    "entrypoint" VARCHAR(255) NOT NULL,
    "website" VARCHAR(255),
    "repository" VARCHAR(255),
    "issues" VARCHAR(255),
    "license" VARCHAR(64),
    "status" VARCHAR(9) NOT NULL DEFAULT 'installed',
    "storage_path" VARCHAR(512) NOT NULL,
    "started_at" TIMESTAMPTZ,
    "package_filename" VARCHAR(255),
    "package_checksum" VARCHAR(128),
    "package_size" BIGINT,
    "permissions" JSONB,
    "config_schema" JSONB,
    "config" JSONB
);
CREATE INDEX IF NOT EXISTS "idx_plugins_created_0e8a12" ON "plugins" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_plugins_plugin__874e4a" ON "plugins" ("plugin_id");
CREATE INDEX IF NOT EXISTS "idx_plugins_status_5a8cc3" ON "plugins" ("status");
COMMENT ON COLUMN "plugins"."status" IS 'INSTALLED: installed\nSTARTED: started\nSTOPPED: stopped\nDISABLED: disabled\nFAILED: failed';
COMMENT ON TABLE "plugins" IS 'Installed plugin record (manifest snapshot + runtime config).';
CREATE TABLE IF NOT EXISTS "settings" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scope_type" VARCHAR(16) NOT NULL DEFAULT 'system',
    "scope_id" UUID NOT NULL,
    "namespace" VARCHAR(128) NOT NULL,
    "value" JSONB,
    "updated_by" UUID,
    CONSTRAINT "uid_settings_scope_t_b09ad8" UNIQUE ("scope_type", "scope_id", "namespace")
);
CREATE INDEX IF NOT EXISTS "idx_settings_created_d2a912" ON "settings" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_settings_scope_t_700259" ON "settings" ("scope_type");
CREATE INDEX IF NOT EXISTS "idx_settings_scope_i_4f7185" ON "settings" ("scope_id");
CREATE INDEX IF NOT EXISTS "idx_settings_namespa_ce7f73" ON "settings" ("namespace");
COMMENT ON TABLE "settings" IS 'Runtime settings store (scoped namespace -> JSON value).';
CREATE TABLE IF NOT EXISTS "upload_sessions" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspace_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "purpose" VARCHAR(64) NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "mime" VARCHAR(128),
    "size_bytes" BIGINT NOT NULL DEFAULT 0,
    "expected_sha256" VARCHAR(64),
    "chunk_size" INT NOT NULL DEFAULT 0,
    "total_parts" INT NOT NULL DEFAULT 0,
    "status" VARCHAR(10) NOT NULL DEFAULT 'initiated',
    "expires_at" TIMESTAMPTZ NOT NULL,
    "asset_id" UUID,
    "reserved_asset_id" UUID,
    "resolved_slug" VARCHAR(128),
    "resolved_ext" VARCHAR(32),
    "object_key" VARCHAR(1024),
    "multipart_upload_id" VARCHAR(256),
    "visibility" VARCHAR(16) NOT NULL DEFAULT 'private',
    "indexable" BOOL NOT NULL DEFAULT False,
    "target_folder_id" UUID,
    "storage_provider" VARCHAR(32) NOT NULL DEFAULT 'local'
);
CREATE INDEX IF NOT EXISTS "idx_upload_sess_created_e67c5e" ON "upload_sessions" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_upload_sess_workspa_5e6546" ON "upload_sessions" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_upload_sess_actor_u_cd6dfc" ON "upload_sessions" ("actor_user_id");
CREATE INDEX IF NOT EXISTS "idx_upload_sess_purpose_55770b" ON "upload_sessions" ("purpose");
CREATE INDEX IF NOT EXISTS "idx_upload_sess_status_ae7b52" ON "upload_sessions" ("status");
CREATE INDEX IF NOT EXISTS "idx_upload_sess_expires_3a131a" ON "upload_sessions" ("expires_at");
CREATE INDEX IF NOT EXISTS "idx_upload_sess_asset_i_37343c" ON "upload_sessions" ("asset_id");
CREATE INDEX IF NOT EXISTS "idx_upload_sess_reserve_402d15" ON "upload_sessions" ("reserved_asset_id");
CREATE INDEX IF NOT EXISTS "idx_upload_sess_multipa_ab507f" ON "upload_sessions" ("multipart_upload_id");
CREATE INDEX IF NOT EXISTS "idx_upload_sess_visibil_808128" ON "upload_sessions" ("visibility");
CREATE INDEX IF NOT EXISTS "idx_upload_sess_indexab_d38c3a" ON "upload_sessions" ("indexable");
CREATE INDEX IF NOT EXISTS "idx_upload_sess_target__0ad59a" ON "upload_sessions" ("target_folder_id");
COMMENT ON COLUMN "upload_sessions"."status" IS 'INITIATED: initiated\nUPLOADING: uploading\nCOMPLETING: completing\nCOMPLETED: completed\nABORTED: aborted\nEXPIRED: expired';
COMMENT ON TABLE "upload_sessions" IS 'Upload session (supports local and S3 multipart uploads).';
CREATE TABLE IF NOT EXISTS "upload_parts" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "part_number" INT NOT NULL,
    "size_bytes" INT NOT NULL DEFAULT 0,
    "checksum_sha256" VARCHAR(64),
    "etag" VARCHAR(128),
    "object_key" VARCHAR(1024) NOT NULL,
    "stored" BOOL NOT NULL DEFAULT False,
    "session_id" UUID NOT NULL REFERENCES "upload_sessions" ("id") ON DELETE CASCADE,
    CONSTRAINT "uid_upload_part_session_2252ce" UNIQUE ("session_id", "part_number")
);
CREATE INDEX IF NOT EXISTS "idx_upload_part_created_14a9e8" ON "upload_parts" ("created_at");
COMMENT ON TABLE "upload_parts" IS 'Upload part record (per-part bookkeeping for resumable uploads).';
CREATE TABLE IF NOT EXISTS "users" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "username" VARCHAR(64) NOT NULL UNIQUE,
    "email" VARCHAR(255) UNIQUE,
    "status" VARCHAR(8) NOT NULL DEFAULT 'active',
    "display_name" VARCHAR(64),
    "avatar_url" VARCHAR(512),
    "avatar_asset_id" UUID,
    "last_login_at" TIMESTAMPTZ,
    "token_version" INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS "idx_users_created_43d91f" ON "users" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_users_usernam_266d85" ON "users" ("username");
CREATE INDEX IF NOT EXISTS "idx_users_status_941fc1" ON "users" ("status");
CREATE INDEX IF NOT EXISTS "idx_users_avatar__0b9eb3" ON "users" ("avatar_asset_id");
CREATE INDEX IF NOT EXISTS "idx_users_token_v_83e7d7" ON "users" ("token_version");
COMMENT ON COLUMN "users"."status" IS 'ACTIVE: active\nDISABLED: disabled\nLOCKED: locked';
COMMENT ON TABLE "users" IS 'User account (org-agnostic identity).';
CREATE TABLE IF NOT EXISTS "org_memberships" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "role" VARCHAR(6) NOT NULL DEFAULT 'member',
    "status" VARCHAR(16) NOT NULL DEFAULT 'active',
    "organization_id" UUID NOT NULL REFERENCES "organizations" ("id") ON DELETE CASCADE,
    "user_id" UUID NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_org_members_created_48352c" ON "org_memberships" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_org_members_role_1197b1" ON "org_memberships" ("role");
CREATE INDEX IF NOT EXISTS "idx_org_members_status_999411" ON "org_memberships" ("status");
COMMENT ON COLUMN "org_memberships"."role" IS 'OWNER: owner\nADMIN: admin\nMEMBER: member';
COMMENT ON TABLE "org_memberships" IS 'User membership in an organization.';
CREATE TABLE IF NOT EXISTS "user_credentials" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "password_hash" VARCHAR(255) NOT NULL,
    "password_updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" UUID NOT NULL UNIQUE REFERENCES "users" ("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_user_creden_created_0644cc" ON "user_credentials" ("created_at");
COMMENT ON TABLE "user_credentials" IS 'User credential record (password hash).';
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
CREATE TABLE IF NOT EXISTS "roles" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "description" TEXT,
    "name_i18n" VARCHAR(200),
    "description_i18n" VARCHAR(200),
    "name_l10n" JSONB,
    "description_l10n" JSONB,
    "is_system" BOOL NOT NULL DEFAULT False,
    "is_default" BOOL NOT NULL DEFAULT False,
    "is_superuser" BOOL NOT NULL DEFAULT False,
    "workspace_id" UUID NOT NULL REFERENCES "workspaces" ("id") ON DELETE CASCADE,
    CONSTRAINT "uid_roles_workspa_85a9f9" UNIQUE ("workspace_id", "code")
);
CREATE INDEX IF NOT EXISTS "idx_roles_created_d2c0eb" ON "roles" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_roles_code_4f0799" ON "roles" ("code");
CREATE INDEX IF NOT EXISTS "idx_roles_is_syst_ccc8fa" ON "roles" ("is_system");
CREATE INDEX IF NOT EXISTS "idx_roles_is_defa_a30952" ON "roles" ("is_default");
CREATE INDEX IF NOT EXISTS "idx_roles_is_supe_43b615" ON "roles" ("is_superuser");
CREATE INDEX IF NOT EXISTS "idx_roles_workspa_5a187b" ON "roles" ("workspace_id");
COMMENT ON TABLE "roles" IS 'Workspace-scoped RBAC role.';
CREATE TABLE IF NOT EXISTS "role_permissions" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "permission_id" UUID NOT NULL REFERENCES "permissions" ("id") ON DELETE CASCADE,
    "role_id" UUID NOT NULL REFERENCES "roles" ("id") ON DELETE CASCADE,
    CONSTRAINT "uid_role_permis_role_id_6a25fe" UNIQUE ("role_id", "permission_id")
);
CREATE INDEX IF NOT EXISTS "idx_role_permis_created_eaa972" ON "role_permissions" ("created_at");
COMMENT ON TABLE "role_permissions" IS 'Role -> Permission link (many-to-many).';
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
        """


MODELS_STATE = (
    "eJztXdty2zi2/RWUnpwa32LHSVpzZqocx53Racf2+JL0nPEUDZGwhDEFsAlSjrqr//0AIC"
    "neJUIiJdFCP6QTChsEF0Bw77Uv+KMzohay2f6pNcLkKyJ+z0OjThf80SFwhPhfihvsgg50"
    "nPhnccGDfVtKQNHUGPG2BuaN5Y+wzzwXmh7//QnaDPFLFmKmix0PUyKk5A2AkAJCCjCPus"
    "gC/NrnT+CJusCa8CFhE7jU9zAZ7ItuLWryfvm/FurhgTyQPWDyJwCYATwa+fIZACQWYEPq"
    "2xboI+C5CHq8H8gA5H3KFthCxMNPGLn7ogsOAeJNDOgBREQDBhh98sLrYOcZIYeBIRYjms"
    "ihQN/C3oFLbbsPzec38mF8gn/zkeHRAfKGyOWP9O//8MuYWOgHYtE/nWeD39e2UpOELdGB"
    "vG54E0deu7/vff5ZthRA9Q2T2v6IxK2diTekZNrc97G1L2TEbwNEkCueOjFfxLftcIqjS8"
    "GI+QXP9dF0qFZ8wUJP0LfFrHf+58knpphswFcO24cO3jfpaETJPp8MvsCwxfbFGD78vZNb"
    "HOLWmdkOL5mUiIWFiScA+uPP4FFjIOTVjrj/2T9Ob3aO37+Rj06ZN3DljxKmzp9SEHowEJ"
    "Vgx+iawQrg05tH+TP/xcMjVIx0WjKDuBWK7kd/WQT56MIM6CP0FoO0wx/BuiL2JOx6BsR3"
    "va/nt3enX6/Fg4wY+82WCJ3enYtfjuTVSebqTjAjlG8Owe4x7QR87939A4h/gv+7ujzPzt"
    "u03d3/dcSYoO9Rg9AXA1oJFKKrEVK8ZTyvvmMtOK9pydXMa7xv6olNTWw4+MT7ynf0/Iye"
    "DaFb8paG7TPzyMFqZi9cct5G8IdhIzLwhvyf79/NmLdvpzdy23v/LjMXl+EvR/KnP1Poed"
    "izleCbCtSD3wpWfgrBt0cfK0DIW5ViKH8rANHAbz8SZSSnUgvBGS6214Um5rdUwTFq30oE"
    "G3ijxfMXwndO/JGEsMcHBImJ8ksylG3q3c4rijg0MDL2wZebq/vrLhhw5d15IL27869dMG"
    "2qCPFJBYRPSgE+yeLrQN6rwvKM2rdyeR6dvK+AHm9Vip/8LY2g/L8CglH7hhBs9IvdyA7J"
    "TSmHEm6UGs9ooqb7ZARbuSgbwdRFFnaRWWAclMOZlGklko283oy6BSj2iFcMYtQ8AyAfcE"
    "PfnMMl0BuIe+wdvX334d3H4/fvPvImchzTKx9m4Nm7vMuqOsyApofHBdvhJ0ptBEmJypOU"
    "ywDX54INITe9UDdd8+nq6iJlbX7q3WVW3P3XT+f8pZYLkTfiykAxpA5yR5gxPjZD1TIsEN"
    "WfnIgYRh7MY/m/t1eXxVhG7TMA3hP+aP+2sOntAhsz7z8buUnOgE88cWqlRqjtfD39NQvo"
    "2cXVpyzhITr4lAE3ZpRVqam0ZA3U1MrXbkuIqAiHmRSjA12hW6nx8ymhJWj6jXpN5vDvwr"
    "Xx9FxIvwdw5AH8mboID8gvaJIzYTOglfmwNhW/+Go8Che+TB0/6RXCHzR46cUvt+d34PL+"
    "4qIjERXOpRfoWkYJtOYQ2xbvqkDZCCV//uUG2VA+xyvEVYJEj2gCnBRs+Z9GR6PsFUjgQI"
    "5a3FvcKYIFudgcdoqcqcEvuzO9qHGbeb7TchhqdimWauyFW1WBvh7O/Frp81oU9nJn4Ri5"
    "DKvRlQmRdlLoRydVGDXeaobRmGPVxKuhAGLYvJ0Avj08rKKgHx6WK+jitywnRLzCD2e5jp"
    "4QqUFNXwOsq9DTc6pK+Ze20c8LY8j7mdoWcm+QSd309l3aaPZHRzQ3nmT7qnE7QgQEImDn"
    "hbrPzIEm2mMmdYLom/HRm4JgnUpiIkLnknqIdUWYzd1QhOmIMBybDrAJbUDdAST4d6mfAB"
    "tOeF8iuoZ/64B8FL5U+y50JzJKZ3zUTV8VfXFNygP0CUxHAAaU78dEaJK7gFEAbTsaptjz"
    "hUw4xv4kluKqWFkMz787yVZyUSW1Nzlh/9GBPjrQRwf66EAfHeijEuiT3Vir7ou5DbnGHX"
    "Kd9NjcrW9NHte169f1x1Qkh6UAY0aslS7Ck7dHVeIn3h6VR1CI3/IuQoPrp8hVdBTGQk25"
    "C/NobpC/UBPMm0QwF1lbm4ph20jmVmObZrbEo7Aa4GgjEI1TInPIkMo0iBs3nEuC9Ka5Q3"
    "2b9oFwdQsjM097lDVMEx03yLGhyUUAJACP+MOCHTjm7dwDU7ATBzYd0DdRjlJgewIICHoB"
    "iWeUeUyBAQNc9IT4K2giJqmQ6+GESQJFvtPCVscMDHl7O+A1BIHCn39iioFiwv8uaEHRzq"
    "E2NidgJ1wnXfDTIbDghOkUJs1saGZDMxua2dDMxnqZDfrCH8vwGf9DDbucYKOW0UZi5/gu"
    "b7FwskhCfGX5IoWwdU6/nd6d3nRBoDU9kNve3blxcfXlqgsY9pAhFKgH8vPpt97Z1aW4z1"
    "jkDD2Qi96nm9Obf3UjF9EDOb27Oz37x9fzyzvem+dBczjiqhC/fnPXO7s4N86uvp2LG7ke"
    "5ruEIfWzrNpXyQV8XMUDfFzuAD7OUipjzHAf29grSQiYP5/pHlaXAuT4fa5l5pWozvX9p4"
    "veWRcEDR7I9U2PT/Q5v+BiPtOITzQH4/wzn2X+gMhaZCJm8S/RPHwonYYPudw18ZwSjLy9"
    "NzOgOym3uoBu1QijtUR0rzhFdd2EazM5GbY/UIEwat9KBBsJgKcuHmACbd4nv5GiP6VQuJ"
    "XYNhL8NcJqcEbtW4lgI6sT/VBKXAubtxK/4yr+qONyd9Rx3huFf0dGf+KhIpYWD8odUim5"
    "Njmkfjo6Oj7+cHR4/P7jybsPH04+Hk49U/mfZqlIn3pfxAc7BXX+C24OkfnM/JHB9TT+cV"
    "JZqQWibczJqt8lLapLwQEyHJeOcaEjdcbXvUB2da7+jk1NaC9Bmja9H9D+f5GpnFudlmpn"
    "5MTbw6MqC1U0mxGbfJRbrGPoYkiKvGDl0clJGZ1FuDs/i1CnaOoUTZ2iOceFEgR3K3LFKS"
    "EdQRPAkQdwyyNoUqtkiQgaSWYaNibPdUSN3IreLnhnlRFeXyLP7EAaDw5qQ+UODl4FJj7j"
    "enwdgNyLjloJR+MhRtk3qCzWqOBNm5d7lXnV54ceie73KLEngcsDQNNEjAVFhgHj+NlhLl"
    "Q+GKm6qAhPukG/+dhFwvsVRCldSycMENXMuuCAHfzh0WdE/hQ/nVHyhAe+KyOd0A8Hu3LF"
    "BbFN0ApuGt5ux3HRGKOXA4u+EJtC6006GEqCCCQiQPzt8uoOYJGmaCELeFSUaA7XWFeEM+"
    "ExcieA/+pQsVAA1wTA4697N7RPPbbH33I+pVQKPO5Pk8r6E0c8KAvCp0Ds9/prNEreaCDL"
    "QIfRUdSBfJ0D+cjgL4ln5P/gz8MvC/1OB0XpoCgdFFWnSq+DorZmYnVQ1LJbX0JTFt8pJY"
    "95JKCLYneke4x/3xFbYEtJS2qyZ71kT6yaqc5jWlLP43rnMVLA+pNFIj2Lpbcv3DMwOdWw"
    "S8o0+yFtBfMp4aiL+Gwj27Kb4TyT6yNFeZ6d3p6dfj6fxXg2TtykSb4y2iZHBc4jbVI85H"
    "zK5iskkz2P7vGxTiSxAfrIe0GIBGwLk4lbvE+Wp2zURAur0SQnSAyc/02Xn9F8hPIGo/kI"
    "zUds1cQW53Fr9UmNiAi+OAqIxRLbgpdWN+tUNzOrry7wuJL4GvCL365NVNbnK+pKSnpF/f"
    "wWj5zI9SmUaYWyltVFhZPzF+R4YIQJHkFbul35h+av4AUBExKAfggfJ3jB3hDw3ZC6ByIF"
    "B9h8mbnVa03q8pJav9f6vdbvtX6v/Y0rVPN1eckpapX9jTm1v0poaKDb6CDIFUT9JQMiyz"
    "TSTNDkPJ00DtasWmhdSsTlvJQrrleWF/rpPROqKIvKr/PxPYOHzssQm0PQ9xkmIjJOFAbz"
    "JuAASCwTlcZA0FA+6UNHBtvd+o5DXY938p1rrIiPBlkPHXDfE3cNlGYLeVDocTLCMMhGA1"
    "yp5tCAoQzo6yOuKaOgchk6CKuU7YkqZXz4QQxeIH1OZPjhk+/5vL0pSi34zgH0LezJwu1P"
    "Nn1hYAftD/aBT8RQQhI9ePjPiHGrkKvkUSDiY/Ck8sV5DOrQB+hy9ZyMw/pogn8P67L1Ua"
    "DDMyzrvU2Aw/V3TNgDAeFdH/k6Qfv8lh7vhT3ugsegyf6PHz8e38iHeAze6Gc0eYz65SMF"
    "FvVk4GU0/kdR1WRfVDURvTBE9ym360TluMfSymx5YyHxgIl/Jj9+IpdNWxPamli3lvJqlE"
    "5tTbzSidXWRH3WxMyyZMWobUwpss0JYUx/3KsCmRFrJZjNFFjJa0eV0Sx8k7cYy1i5VMAy"
    "JaSx1KGROjRS+6o3iZLabUlo5CdKPTFy59aDckA5bivTYncWs+XyQRn9SMBgU4m5DNcVQX"
    "vCMgE3n07PwLQLMILuc+jzTDFac9oLEic6MvBZeFpl1qi4GbRFzutIHO3HKEDQtSd7fJwD"
    "BPgE+Y50vzL4hHgr0ZdM+HzCLvMAFEcd66xOzYtoXkTzIpoXqYMXUdT6a9X3256WaFGiWl"
    "c6EtElpXNILlLKKxZbSUrgChX/TdpGSnMCFXzmTWrQl9TDT9iUzsdyD3FBq5maNEm0r+gk"
    "vkbunrDbQVKWK759+gMEB1opeIyX6Uwo39cutXxTuHRNzMQzgJ2v367fSGfqVVB2hr6kOm"
    "fT47tN3xWnz8UnbEtv6JmNzWd5LlZ6TGJd7AlVnSv7XElnQHwtQwkqKtmAHQuzEWbsDeDA"
    "UZBrW9lHyh8cO1gcjJfgRyxk+Q7S3lFtBWgrQFsB2grQ3tHGt75kTYuCL1JV/AqFtxBErk"
    "igAXUXPiopKb/ms6/uzk+/8sYIjh7I7fnZ/U3v7l9dwBBXqbA3eSB3p7e/8N8he85qfFWM"
    "2Coeq3J/Vc5bteKjfNYeKtzIWT59ailxKFH7Vp720cjx8x50ByJHjCotxaRQO5djk2CqVp"
    "/PiOki9JmvVlERemh6dKHDLnOC2+fiRyJm21DNVElLtfHkmUaiThIMiAKYaalWfo4aQVOY"
    "eQvVqIO6QN3Wk9FX7uArGvWRy4bY6RTw0OkGu7MoaOoO+Ac5aluRhL4XnHEsJXN7COBdQY"
    "J/l4RtnmuuIJMuCz4+An3qEwu6EyAHLpJ3/JGo4X3UBRBI4rqPbEoGTJQJRz/4mO0JoARl"
    "uwXgOwKIPFHXRMATESPQkyS0YBf7kCFg813fBmMMwf1l75/35zvhhzPM0XGpHWQEySQiQW"
    "En77AXSA/EycAEyqQrmbMT5PqAYB5FWfXSTB1NKWtKWVPKmlLWlLIKpSx25UXpvEh2dWee"
    "B9++/KbXufp+KQ6Ypy/8ng/k9PPX3mU3iEN8IF/PRXhDFySEVWNSqoSklEek5M+ghJ5fkI"
    "k+6+TJSGJ1WHNNAI/REh+YjAlQBcS35Si+zcGYVB8UDfsC0W2JRU8fg6RMiazMAbI5iM2I"
    "3k+uozyKykH8V5nuNhbFuVH8BS/Y/MJzYm3VgOJ92M2mxTlWxS7xim1SAkRqcRYbzKnFO9"
    "NenrasaC0nOwc70DS5VeuFNiMH1ONwIrcgOquinLCac7ZyEIKV7IAbr8LiDbuJOwgKSg+n"
    "ZTSGdISkhdvHts1HcnB7exXU1DiIPIzAoTY2MQqqcHyPHPTRLRyXimORD0TFiqRRPB2hNK"
    "LDY7akniNGw7hCps1jbR5r81ibx9o8rsM8FtVElQy1sL3OvBC/bVeBu0acXKJaleG7tgqM"
    "SZlWugsbCbjAzIgpDYVcoJTc6hKCphc2LB9IwX+XspOzHrLMDCgUYcx55jZvYygz9YqjeZ"
    "fEY2o8vAYsDDSC2DYwGfNVVxcw56LPnuzyVWAUoFNHQdMpRAE6oq5pyxBqkvK4Rq5Ihyoh"
    "PBK/7s6iO5xpu4pkh6zUEEvlWY1sg7TT/9HkY3iMmAQmxwGwJao68Od2dwFfA9iU5R3EE8"
    "npt0J3+0NHkgnd4EDvh07ouw+88Aa20g588RwIBoeASw5k4FLfkZlkominaMh4l+Lv065k"
    "Btyj5E5caov6p6LGqeQ8pg8ka0v0Ee8OEr4ID8whMp/FGPl3BIxZnO+mgwE026HZDs12aL"
    "ajFrZDfDhUDM2ofRvZjkasdflxWzScYiq8Oh//S9J0yLpcbr50RYjeA/l+dfPL7fXp2XkX"
    "pAUUIf+pAuA/lcL9k2aXal+vyZHlkLxDP7yyiPSUWEs4pln79Pmvd6ktOpd2Mt2mL64uv0"
    "TNs7ko+fVp4LcfC6CdvUinQi0BNpO8d3hYJXnv8LA8eU/8VrpQlSEtktXITstGR6adCqQp"
    "oa1O71mIDo0tXUPEUC7J4dzwLtJcxOZ9y9ZD38hVWl5qKPX77kwKJziUpBp9IxU820ZWlL"
    "wQlQHiA8VPiHmAEeiwIfXAX4DrE1mdkyPzhAcFESxL96bZEc2OaHZEsyOaHVmSHVmTpvQa"
    "eZLtMt2btoi06b5bs+nOt4EhLYhFL1+hsYReo1MYx8hlheuzHMeESDuBrD+KzkW/+dgtsh"
    "LLYUzKaBynZxG5E4cK41MBybRUO7E8Ojmp8nKfnMyop3WShfMF9VkYUFMVy4RISz48K8DR"
    "RVxNxV5pWb2yFzwppdGMozyZr7ZVxhIaxWnUMTYRUTtLMCHSShzr/97MSvOu4A1eQ8o3jr"
    "jGAndw75JbzxcX55+7YNrsgfBrN3fiGr/iesGVq+vr4Ap1HHHlc+/29JMUtDATw+PXfj7t"
    "yStPEEe3W68zmY/WhQNkiPOiVZZ9Vq6dCkIjAffhkliAB0tL6jMj1lCmK0V8QfNZrPEn/q"
    "6qMjdFsq38PjTynY3QkQGuzB8tgmxStpXINsIwRugw/HtRwg8e9EgJQ5aVzGAaGoKbh+lA"
    "3Gfvp6Oj4+MPR4fH7z+evPvw4eTj4UfeVo4p/9OHWWlCvS8i4SeFeP5EoExsexrl8iq2GT"
    "FdxTazaxdVsQ18ugbj7/tIqWRwTlDDXRludZw1wDMAVoiWaTIwRETMdAoCQm7CgmYzzm2N"
    "wnXmh4F8zx76JLN23KhERyrIY0bbdG6PGCED0EVxJO6e4+IxX0jdKPGHilOjCEKWLOnZRy"
    "BYROAFe0NRMTRzXNTthHloJG8W9IxHIz9IGtoxISHUE30EZWisqNIJdhPpOgzE7ZCFebMw"
    "1wczg/m8naho8whGCBKRDjSE/D62nezgoVP9bCkZdK4PkNIhLHOQ1yEsOoRlyyd2wxJ8Vh"
    "zjq+uZbKBdrsNWdMZJK2JXdMZJU8jKBWe/PSyAtNy4Tglp+3p3PoGRXISqaBfJatArgC4s"
    "XmlPF3DOc4pMxXL61PksptGIlUFNCGpUcys14mYWWKxJUY1sWZ0mfUrvfH4pxwkXIJmHUb"
    "kqeM1V0tZUGzy7RlQLhKcP/jBmuu+2Jge1+OWN6xXWkaQ7XX5x6cLI29AipJp2yswuuJZf"
    "ZLMdNdnlXaHyGpcCe38H8V2AKLInk20nex7dE/8vSNJVkCv0ccjRhrt+nBvOL2g/h/ZzrP"
    "vb9GrocO3neKUTm0/VTW2iChtjTnBbDjnKngmniFvyA7YliM2wW4oP1VM2WdqnIGbNlcSy"
    "mH/8k5NS7ZbErq3GSBbB3Ia0SUdC3SLP4w9ZXmEn3WCmws6CplUV9bDQTSQlsk1cBHbC8K"
    "lpXWOhlAueFoyh7aMizX2JjgpVeSkYrMbdsKZjOHPTvrRWr7V6rdVrrV5r9YqHMaW21soZ"
    "eimp1SVTxv68DT0/N/ltqvqJScqs2D/ROQz/2yv4I/pvTd+YdHBDictidgjOVKiVsXaNxI"
    "pJVSuPY3nYwlRAxypkVmpRrEL0sesXFJ6YcQB0SmqJPWCjAFa19ddjb907NoXWNXS9cpMr"
    "12Z3ltXly9aGw5tXtLyC/oGQmJYi5UbqnrzQp/T5GSF5BIw4IIaj6I9kKklwI1ZggdXRYb"
    "ElhlJEHu/OIL5wvmn7S9tf6/9+vhY1Xdtfr3Ri816VxBaam9gZ+fQpqYXS6dcxjUE+/dHb"
    "dx/efTx+/26aRj+9Mit7Ph8VJsoJcKWp8FDDUuzSQquD7nBzcIvKWxhsCI9O3quYVQWirY"
    "zCb6AUogeVjrWO2rcSvkZsU9r/LzI94xkpVe1LS7U0LezwqMp6FM3KAZU/5itwoQJ9e2Yo"
    "cizUWBByHs1WRCGnrZ/K/B7axuCHGa78EJAaPNKBnXsb9Bfb5huL41zXdHqtbJJfugjqUq"
    "okNyNz2ZLwwdUIk1AI7DDfcajrMWBTE9qyoMbtMRjxmcOS8pjLlCzWkz4GRrMgmgXRLIhm"
    "QZZkQXR618LOUf6dpK4h0gYVscsJbiF4ju/yFmrFV2ORVnqV6yc+Filhu3Tp2rWb7I3Urh"
    "1hNRij9ppDqkIJz6pQ215WeMXVadEPB5lCk1LnjgtEW7lw699CzaFPnkvqKpcu2bRQm5Zs"
    "bY4Mj3rQjiMtKgKXkdpK5Np4kAb2sOwzhyJ/vt5d7/QuOEgjbPZA7q8vrk4/9y6/dEPahg"
    "P8QM6uvl5fcINHXDbpyLGRl7wu+ggviz5OP10Fh3HAPg0O4zj/9bp3I67w7QyHRLk631+J"
    "7Z/B9ee8T3IwbAHLOC3ZSsajJYZwhMNMigMyhjxVUy4h02j04EYacfwX5I4Ft7MAdIXCW4"
    "khtQUMzPaVvNg5wVZqdI2YIlNo0A+l0xGzcq1E9LjK4UfH5WcfHeeOPlpbdMC6oWwqOGDq"
    "1DJCH5zaKdwl4g1B3Cgnxo3RSlxOeSaQ/C2TaYEZ7mMbe0rrNS21Ou06PPBgCU9e06lVcv"
    "TyEXNwzq6sl5TTZfXS9jN0B1zreaK2pew/KJLdPsVpelahS8fYKgrirXDOYUJ2dWR4R0Y4"
    "1PbC1/PBV0gKSsdQL1lKrijDZ/M8EGVRRI3WkLtnMrIlH+kTViqdEdrDW1QN6OFNATRN6h"
    "MP7FB3sAcHhL952AT8zSAe/x4WBe9UldKBOjpQZ/Noq1cTz6EDdV7pxOYCdcSWrurrT8rU"
    "o97M3xM3292HRhDbSp7TSKAW63q18DUSKNE+9xVXf/C4wL7unJ7d9b6dd0HQoPho94urs1"
    "/EFa6yPy/mcarCb5azm/kjhzBzbDgxVPeCrFwrCbn6NwQ45gqSa/iu0q6QlmollCdvq5iN"
    "vFUpmPK3QjQX8qTlRbeP07Ah8wybDjBZQH/LCdegwm1UWZNN0tgqeZQ9+oyIMea2eGHS1Y"
    "wwmYxcU4EyuZdgzXEyC5FQ1B0kjjdYko66cgfxmQabaeOUclHzTn6o/9CHlgGkRNalqBLJ"
    "acECHSEC8IqgO8r/qEB4cqPsLNXjpu7BxQAqEpiJRy2hMtNgzCY1jXguVPjNWCouysQ1jR"
    "fxtyFkwzKGs5qc5jg1x6k5Ts1xao5z6ZJMwd5qiL1VxR7PCerMpjyoi781JV3o12fT9kX1"
    "XNSGslCbJrprrI6iUtQjDXUe58gKyJHg5abABqM7t2ZKYvFUKJiyVCxEfOBlgRWROg2z3I"
    "CY2sQVTYdpt1zrd6mIZn0DfI65CyAB1B1Agn+Xxl7eelATLSz4mmwVgiwjvXW5V21baNtC"
    "2xZaOVI7bkMxvWaprJo1vJEN+0lV3c3tLjHRSFYSZkYciqASRp+UW10Y/fTCBkfRR5/S/m"
    "SROjzF0ltYjKdA1ayKYYGorrOZQiWPpnKxzatMdxuL4lyLsWC5qJbaTB9MuqRPs32HkubD"
    "GQ1Mxri47M4i3t1z0WdPdtliZAJMDHFufV3ABJhc8B5bjIuOBlhJ6k7h2zSLucq8dRVILC"
    "P38s9ntORd9vrUJxYIBMHONSKiPMvBqWkih0+cPFOswCGuIPtAHsiNzzdnsDM+etN9IHsg"
    "IS0CbkVz4KLffFEABZi+6yLiSS1sXz4W+NvfwpsE/94XffzzbZfLEPQCKLdQAfrh8dszEJ"
    "dRATsW5d0RyvumHl+FwOQAvgmEj7qBGCUojPgFO4SSPReN6TOydoH4Bwwf5E30iA5ywc4U"
    "810gRxP2eNwFwZcLjLjyzkDQE9gJexQDwkycxavDBDSVp6k8TeVpKq8WKm/FSTzrJvMaiQ"
    "oQtpMhvo4qOKaE2lhupIH6kYoQLoXe60vH25zaeZuUMbJJ+3GlRAfNwy6hmCYrygfWx4I4"
    "lohvXxrVFAj1fSUjqjeW9W4skSm92AtRLL1970NMSKi+DmlJ/Tas923Qfrpl34R2HHezOd"
    "hpH2eDPs7ChVkDlKlw2PbimH3nNulMxiKn4Cz3Ttp3WMW7k3Vgznfu3CBfVi2JXBdCNO/G"
    "KWxV4LD557suENY/V5yYcGNQeR9o/xVc3l9chB4Pn9h4xHuxAofISRdA26YvooKydE5ZlP"
    "+PpMVfhogIp8hu4I4ZQc8c8rEFnhUGTEhC/5B2mminiXaaaKeJdprU4TTRhL8m/NePXlSF"
    "TBXFrFwb0az/YAbtPtn4nbkSrxOVG1xgIjOieibXO5ORxZSfxtJiX0mRhep8raGSYM1H4h"
    "UZjSpfhzL5VhZmbCT3aMMctJu0xyiwx+I1NWTNe4X3Oy20lUdeysqUHIdF11+Z/PatwBiJ"
    "BeuDJmR1eVDtzlu3E0C787Q7b8PdUNqdtxnuvJQaZqAxIssePVXgnbtn6Fz03C6oV5PKVo"
    "BSNZdnElRF16eRnuv5TtBe7NUEPuNPBKS0qNvqetjEDuRdFWS3Kchpl6R2SWqXpHZJapfk"
    "8kdaLcoI1EsGtDVfYEEioF4OYKPA26Q3oBIH8F+KCZ+NuCyD4otQJr+F1JhQFxV5xVhEMw"
    "ASjTrN1bbWS9nNGK6JVbKRIaiJAiyz7LF0nZYqdlimVkzFszZiKYC5EQFe4lK43FwC0Brx"
    "ywM6FkdT8oUEZE0Q6JaeMrxcf4WldbNURKRF6NK62o5bt3LzatR9bce90onNl9Z9vUfC9i"
    "6/9e7E+a8BJ2kVHRKb/WxVCfKo+VDYcHQLGtPF0ttnQWzO8RmbbEFo/2sj1pf2GC7oMcy+"
    "wTXgt+i5LJsDndrJLCVLMkEq1VBqt8AQbWH13RVb9BKhalZ9BKaaZR/PbIUEU94U9LEs+Q"
    "meqJsyxuMuC3JOFQQLDfYcvSkTk7TFri12bbFri11b7KoW+8Lupjr9TK3S3HOptIqVqGKR"
    "bUFshq0zSrki6jJ22lqIPqu7596x+XaPG+p+S0LZPn08i13iPVu/r+7P/wc/mO8j"
)
