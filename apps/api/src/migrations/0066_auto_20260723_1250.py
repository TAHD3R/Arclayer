from tortoise import migrations
from tortoise.migrations import operations as ops
from orjson import loads
from src.common.utils.ids import uuid7
from src.models.system.email_template import EmailTemplateRevisionAction
from tortoise.fields.data import JSON_DUMPS
from tortoise import fields

class Migration(migrations.Migration):
    dependencies = [('models', '0065_backfill_access_restrictions')]

    initial = False

    operations = [
        ops.CreateModel(
            name='EmailTemplateRevisionRecord',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('template_id', fields.UUIDField(db_index=True)),
                ('key', fields.CharField(db_index=True, max_length=96)),
                ('locale', fields.CharField(db_index=True, max_length=16)),
                ('version', fields.IntField()),
                ('action', fields.CharEnumField(db_index=True, description='CREATED: created\nUPDATED: updated\nRESTORED: restored\nDELETED: deleted', enum_type=EmailTemplateRevisionAction, max_length=8)),
                ('name', fields.CharField(max_length=160)),
                ('description', fields.CharField(null=True, max_length=500)),
                ('subject_template', fields.CharField(max_length=500)),
                ('html_template', fields.TextField(unique=False)),
                ('text_template', fields.TextField(unique=False)),
                ('variables', fields.JSONField(default=list, encoder=JSON_DUMPS, decoder=loads)),
                ('is_enabled', fields.BooleanField()),
                ('changed_fields', fields.JSONField(default=list, encoder=JSON_DUMPS, decoder=loads)),
                ('actor_user_id', fields.UUIDField(null=True, db_index=True)),
                ('audit_event_id', fields.UUIDField(null=True, db_index=True)),
            ],
            options={'table': 'system_email_template_revisions', 'app': 'models', 'unique_together': (('template_id', 'version'),), 'pk_attr': 'id', 'table_description': 'Immutable localized email template revision snapshots.'},
            bases=['BaseModel'],
        ),
    ]
