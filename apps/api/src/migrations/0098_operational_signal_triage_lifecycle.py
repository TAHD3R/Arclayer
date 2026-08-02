from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0097_agent_version_draft_validation")]
    initial = False
    operations = [
        ops.RunSQL(
            """
            UPDATE operational_signal_triage
            SET state = CASE state
                WHEN 'needs_attention' THEN 'unclaimed'
                WHEN 'remind_later' THEN 'waiting'
                ELSE state
            END;
            UPDATE operational_signal_triage_history
            SET from_state = CASE from_state
                WHEN 'needs_attention' THEN 'unclaimed'
                WHEN 'remind_later' THEN 'waiting'
                ELSE from_state
            END,
            to_state = CASE to_state
                WHEN 'needs_attention' THEN 'unclaimed'
                WHEN 'remind_later' THEN 'waiting'
                ELSE to_state
            END;

            ALTER TABLE operational_signal_triage
                ALTER COLUMN state SET DEFAULT 'unclaimed';
            ALTER TABLE operational_signal_triage
                DROP CONSTRAINT operational_signal_triage_state_check,
                DROP CONSTRAINT operational_signal_triage_reminder_check;
            ALTER TABLE operational_signal_triage
                ADD CONSTRAINT operational_signal_triage_state_check CHECK (
                    state IN ('unclaimed', 'in_progress', 'waiting', 'source_recovered')
                ),
                ADD CONSTRAINT operational_signal_triage_reminder_check CHECK (
                    (state = 'waiting' AND reminder_at IS NOT NULL AND reminder_reason IS NOT NULL
                        AND btrim(reminder_reason) <> '')
                    OR (state <> 'waiting' AND reminder_at IS NULL AND reminder_reason IS NULL)
                );

            ALTER TABLE operational_signal_triage_history
                DROP CONSTRAINT operational_signal_triage_history_action_check,
                DROP CONSTRAINT operational_signal_triage_history_from_state_check,
                DROP CONSTRAINT operational_signal_triage_history_to_state_check;
            ALTER TABLE operational_signal_triage_history
                ADD CONSTRAINT operational_signal_triage_history_action_check CHECK (
                    action IN (
                        'claim', 'assign', 'transfer', 'in_progress', 'remind_later',
                        'needs_attention', 'reminder_returned', 'note_added'
                    )
                ),
                ADD CONSTRAINT operational_signal_triage_history_from_state_check CHECK (
                    from_state IS NULL
                    OR from_state IN ('unclaimed', 'in_progress', 'waiting', 'source_recovered')
                ),
                ADD CONSTRAINT operational_signal_triage_history_to_state_check CHECK (
                    to_state IN ('unclaimed', 'in_progress', 'waiting', 'source_recovered')
                );

            CREATE TABLE operational_signal_triage_notes (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                triage_id UUID NOT NULL REFERENCES operational_signal_triage(id) ON DELETE CASCADE,
                revision BIGINT NOT NULL,
                actor_user_id UUID NOT NULL,
                body TEXT NOT NULL,
                CONSTRAINT operational_signal_triage_note_revision_check CHECK (revision >= 1),
                CONSTRAINT operational_signal_triage_note_body_check CHECK (btrim(body) <> ''),
                UNIQUE (triage_id, revision)
            );
            CREATE INDEX operational_signal_triage_notes_timeline_idx
                ON operational_signal_triage_notes(triage_id, created_at);

            CREATE FUNCTION reject_operational_signal_triage_note_mutation()
            RETURNS TRIGGER AS $$
            BEGIN
                RAISE EXCEPTION 'Operational Signal triage notes are append-only';
            END;
            $$ LANGUAGE plpgsql;

            CREATE TRIGGER operational_signal_triage_notes_append_only
            BEFORE UPDATE OR DELETE ON operational_signal_triage_notes
            FOR EACH ROW EXECUTE FUNCTION reject_operational_signal_triage_note_mutation();
            """
        )
    ]
