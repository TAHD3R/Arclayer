from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0079_workspace_commercialization_persistence_hard_cut")]

    initial = False

    operations = [
        ops.RunSQL(
            """
            ALTER TABLE system_roles
                ADD COLUMN started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                ADD COLUMN ended_at TIMESTAMPTZ;
            CREATE INDEX system_roles_active_workspace_idx
                ON system_roles (workspace_id, ended_at);
            ALTER TABLE system_roles
                ADD CONSTRAINT system_roles_lifecycle_check CHECK (ended_at IS NULL OR ended_at >= started_at);

            ALTER TABLE workspace_membership_roles
                ADD COLUMN started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                ADD COLUMN ended_at TIMESTAMPTZ;
            DO $$
            DECLARE existing_constraint TEXT;
            BEGIN
                SELECT conname INTO existing_constraint
                FROM pg_constraint
                WHERE conrelid = 'workspace_membership_roles'::regclass
                  AND contype = 'u'
                  AND conkey = ARRAY[
                      (SELECT attnum FROM pg_attribute WHERE attrelid = 'workspace_membership_roles'::regclass AND attname = 'membership_id'),
                      (SELECT attnum FROM pg_attribute WHERE attrelid = 'workspace_membership_roles'::regclass AND attname = 'role_id')
                  ]::SMALLINT[];
                IF existing_constraint IS NOT NULL THEN
                    EXECUTE format('ALTER TABLE workspace_membership_roles DROP CONSTRAINT %I', existing_constraint);
                END IF;
            END $$;
            ALTER TABLE workspace_membership_roles
                DROP CONSTRAINT IF EXISTS workspace_membership_roles_membership_id_role_id_key;
            CREATE UNIQUE INDEX workspace_membership_roles_one_active
                ON workspace_membership_roles (membership_id, role_id) WHERE ended_at IS NULL;
            CREATE INDEX workspace_membership_roles_active_membership_idx
                ON workspace_membership_roles (membership_id, ended_at);
            ALTER TABLE workspace_membership_roles
                ADD CONSTRAINT workspace_membership_roles_lifecycle_check CHECK (ended_at IS NULL OR ended_at >= started_at);
            """
        )
    ]
