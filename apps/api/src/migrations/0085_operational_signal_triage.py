from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0084_support_access_grants")]
    initial = False
    operations = [
        ops.RunSQL(
            """
            CREATE TABLE operational_signal_triage (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                signal_id UUID NOT NULL UNIQUE,
                source_job_id UUID NOT NULL UNIQUE
                    REFERENCES background_jobs(id) ON DELETE RESTRICT,
                state VARCHAR(32) NOT NULL DEFAULT 'needs_attention',
                assignee_user_id UUID NULL,
                reminder_at TIMESTAMPTZ NULL,
                reminder_reason TEXT NULL,
                revision BIGINT NOT NULL DEFAULT 1,
                last_actor_user_id UUID NULL,
                CONSTRAINT operational_signal_triage_signal_source_check
                    CHECK (signal_id = source_job_id),
                CONSTRAINT operational_signal_triage_revision_check CHECK (revision >= 1),
                CONSTRAINT operational_signal_triage_state_check
                    CHECK (state IN ('needs_attention', 'in_progress', 'remind_later')),
                CONSTRAINT operational_signal_triage_in_progress_assignee_check
                    CHECK (state <> 'in_progress' OR assignee_user_id IS NOT NULL),
                CONSTRAINT operational_signal_triage_reminder_check CHECK (
                    (
                        state = 'remind_later'
                        AND reminder_at IS NOT NULL
                        AND reminder_reason IS NOT NULL
                        AND btrim(reminder_reason) <> ''
                    ) OR (
                        state <> 'remind_later'
                        AND reminder_at IS NULL
                        AND reminder_reason IS NULL
                    )
                )
            );
            CREATE INDEX operational_signal_triage_state_reminder_idx
                ON operational_signal_triage(state, reminder_at);
            CREATE INDEX operational_signal_triage_assignee_state_idx
                ON operational_signal_triage(assignee_user_id, state);

            CREATE TABLE operational_signal_triage_history (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                triage_id UUID NOT NULL
                    REFERENCES operational_signal_triage(id) ON DELETE CASCADE,
                revision BIGINT NOT NULL,
                action VARCHAR(32) NOT NULL,
                actor_user_id UUID NULL,
                from_state VARCHAR(32) NULL,
                to_state VARCHAR(32) NOT NULL,
                from_assignee_user_id UUID NULL,
                to_assignee_user_id UUID NULL,
                reminder_at TIMESTAMPTZ NULL,
                reminder_reason TEXT NULL,
                CONSTRAINT operational_signal_triage_history_revision_check CHECK (revision >= 1),
                CONSTRAINT operational_signal_triage_history_action_check CHECK (
                    action IN (
                        'claim', 'assign', 'in_progress', 'remind_later',
                        'needs_attention', 'reminder_returned'
                    )
                ),
                CONSTRAINT operational_signal_triage_history_from_state_check CHECK (
                    from_state IS NULL
                    OR from_state IN ('needs_attention', 'in_progress', 'remind_later')
                ),
                CONSTRAINT operational_signal_triage_history_to_state_check CHECK (
                    to_state IN ('needs_attention', 'in_progress', 'remind_later')
                ),
                UNIQUE(triage_id, revision)
            );
            CREATE INDEX operational_signal_triage_history_timeline_idx
                ON operational_signal_triage_history(triage_id, created_at);

            CREATE FUNCTION reject_operational_signal_triage_history_mutation()
            RETURNS TRIGGER AS $$
            BEGIN
                RAISE EXCEPTION 'Operational Signal triage history is append-only';
            END;
            $$ LANGUAGE plpgsql;

            CREATE TRIGGER operational_signal_triage_history_append_only
            BEFORE UPDATE OR DELETE ON operational_signal_triage_history
            FOR EACH ROW EXECUTE FUNCTION reject_operational_signal_triage_history_mutation();
            """
        ),
        ops.RunSQL(
            """
            DO $$
            DECLARE
                permission_code TEXT;
                permission_key TEXT;
                existing RECORD;
            BEGIN
                FOREACH permission_code IN ARRAY ARRAY[
                    'platform:operations-signals:read',
                    'platform:operations-signals:claim',
                    'platform:operations-signals:assign',
                    'platform:operations-signals:triage'
                ] LOOP
                    permission_key := replace(replace(
                        regexp_replace(permission_code, '^platform:', ''), ':', '_'
                    ), '-', '_');
                    SELECT * INTO existing FROM platform_permissions WHERE code = permission_code;
                    IF NOT FOUND THEN
                        INSERT INTO platform_permissions (
                            id, created_at, updated_at, code, owner_domain, name_i18n,
                            description_i18n, is_delegable, catalog_revision, is_active
                        ) VALUES (
                            md5('arclayer:platform-permission:' || permission_code)::uuid,
                            NOW(), NOW(), permission_code, 'operations',
                            'platform.permission.' || permission_key || '.name',
                            'platform.permission.' || permission_key || '.description',
                            TRUE, 1, TRUE
                        );
                    ELSIF existing.id <> md5('arclayer:platform-permission:' || permission_code)::uuid
                        OR existing.owner_domain <> 'operations'
                        OR existing.name_i18n <> 'platform.permission.' || permission_key || '.name'
                        OR existing.description_i18n <> 'platform.permission.' || permission_key || '.description'
                        OR existing.is_delegable IS NOT TRUE
                        OR existing.catalog_revision <> 1
                        OR existing.is_active IS NOT TRUE THEN
                        RAISE EXCEPTION 'Conflicting Platform permission catalog row: %', permission_code;
                    END IF;
                END LOOP;
            END $$;
            """
        ),
        ops.RunSQL(
            """
            DO $$
            DECLARE
                target_revision_id UUID;
                permission_code TEXT;
                target_permission_id UUID;
                link_id UUID;
                existing_revision_id UUID;
                existing_permission_id UUID;
            BEGIN
                SELECT revision.id INTO STRICT target_revision_id
                FROM platform_roles AS role
                JOIN platform_role_revisions AS revision ON revision.role_id = role.id
                WHERE role.code = 'platform-operations-reader'
                    AND role.kind = 'built_in'
                    AND role.is_active = TRUE
                    AND revision.is_current = TRUE;

                FOREACH permission_code IN ARRAY ARRAY[
                    'platform:operations-signals:read',
                    'platform:operations-signals:claim',
                    'platform:operations-signals:assign',
                    'platform:operations-signals:triage'
                ] LOOP
                    SELECT id INTO STRICT target_permission_id
                    FROM platform_permissions
                    WHERE code = permission_code AND is_active = TRUE;
                    link_id := md5(
                        'arclayer:platform-role-permission:platform-operations-reader:' || permission_code
                    )::uuid;
                    SELECT role_revision_id, permission_id
                    INTO existing_revision_id, existing_permission_id
                    FROM platform_role_revision_permissions
                    WHERE id = link_id;
                    IF NOT FOUND THEN
                        IF EXISTS (
                            SELECT 1 FROM platform_role_revision_permissions
                            WHERE role_revision_id = target_revision_id
                                AND permission_id = target_permission_id
                        ) THEN
                            RAISE EXCEPTION 'Conflicting Platform role permission link: %', permission_code;
                        END IF;
                        INSERT INTO platform_role_revision_permissions (
                            id, created_at, updated_at, role_revision_id, permission_id
                        ) VALUES (
                            link_id, NOW(), NOW(), target_revision_id, target_permission_id
                        );
                    ELSIF existing_revision_id <> target_revision_id
                        OR existing_permission_id <> target_permission_id THEN
                        RAISE EXCEPTION 'Conflicting deterministic Platform role permission id: %', permission_code;
                    END IF;
                END LOOP;
            END $$;
            """
        ),
    ]
