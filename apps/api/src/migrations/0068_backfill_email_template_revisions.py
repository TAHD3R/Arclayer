from tortoise import migrations
from tortoise.migrations import operations as ops

FORWARD_SQL = """
INSERT INTO system_email_template_revisions (
    id,
    created_at,
    updated_at,
    template_id,
    key,
    locale,
    version,
    action,
    name,
    description,
    subject_template,
    html_template,
    text_template,
    variables,
    is_enabled,
    changed_fields,
    actor_user_id,
    audit_event_id
)
SELECT
    md5(template.id::text || ':email-template-backfill:' || template.version::text)::uuid,
    template.updated_at,
    template.updated_at,
    template.id,
    template.key,
    template.locale,
    template.version,
    'updated',
    template.name,
    template.description,
    template.subject_template,
    template.html_template,
    template.text_template,
    template.variables,
    template.is_enabled,
    '[]'::jsonb,
    NULL,
    NULL
FROM system_email_templates AS template
WHERE NOT EXISTS (
    SELECT 1
    FROM system_email_template_revisions AS revision
    WHERE revision.template_id = template.id
      AND revision.version = template.version
);
"""

REVERSE_SQL = """
DELETE FROM system_email_template_revisions
WHERE action = 'updated'
  AND actor_user_id IS NULL
  AND audit_event_id IS NULL
  AND changed_fields = '[]'::jsonb
  AND id = md5(template_id::text || ':email-template-backfill:' || version::text)::uuid;
"""


class Migration(migrations.Migration):
    dependencies = [("models", "0067_auto_20260723_1350")]
    initial = False
    operations = [ops.RunSQL(FORWARD_SQL, REVERSE_SQL)]
