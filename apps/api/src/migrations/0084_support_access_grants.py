from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0083_subscription_transition_convergence_binding")]
    initial = False
    operations = [ops.RunSQL("""
        CREATE TABLE support_access_grants (
          id UUID PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL,
          workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
          case_id VARCHAR(128) NOT NULL, reason TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
          state VARCHAR(16) NOT NULL DEFAULT 'active', revision BIGINT NOT NULL DEFAULT 1,
          created_by_user_id UUID NOT NULL, revoked_by_user_id UUID, revoked_at TIMESTAMPTZ,
          CONSTRAINT support_access_grants_state_check CHECK (state IN ('active','revoked'))
        );
        CREATE INDEX support_access_grants_current_idx ON support_access_grants(workspace_id,state,expires_at);
        CREATE TABLE support_access_grant_operators (
          id UUID PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL,
          grant_id UUID NOT NULL REFERENCES support_access_grants(id) ON DELETE CASCADE,
          operator_user_id UUID NOT NULL, operator_revision BIGINT NOT NULL,
          UNIQUE(grant_id,operator_user_id)
        );
        CREATE TABLE support_access_grant_scopes (
          id UUID PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL,
          grant_id UUID NOT NULL REFERENCES support_access_grants(id) ON DELETE CASCADE,
          project_id UUID NULL, content_category VARCHAR(64) NOT NULL,
          UNIQUE NULLS NOT DISTINCT(grant_id,project_id,content_category)
        );
        INSERT INTO platform_permissions (
          id, created_at, updated_at, code, owner_domain, name_i18n, description_i18n,
          is_delegable, catalog_revision, is_active
        ) VALUES (
          md5('arclayer:platform-permission:platform:tenant-support:read')::uuid,
          NOW(), NOW(), 'platform:tenant-support:read', 'tenant-governance',
          'platform.permission.tenant_support_read.name',
          'platform.permission.tenant_support_read.description', TRUE, 1, TRUE
        ) ON CONFLICT (code) DO UPDATE SET is_active = TRUE, updated_at = NOW();
        INSERT INTO platform_role_revision_permissions (id, created_at, updated_at, role_revision_id, permission_id)
        SELECT md5('arclayer:platform-role-revision-permission:' || revision.id::text || ':' || permission.id::text)::uuid,
               NOW(), NOW(), revision.id, permission.id
        FROM platform_role_revisions revision
        JOIN platform_roles role ON role.id = revision.role_id AND role.code = 'tenant-governance-operator'
        JOIN platform_permissions permission ON permission.code = 'platform:tenant-support:read'
        WHERE revision.is_current = TRUE
        ON CONFLICT (role_revision_id, permission_id) DO NOTHING;
    """)]
