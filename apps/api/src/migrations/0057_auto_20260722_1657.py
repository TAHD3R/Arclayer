from tortoise import migrations
from tortoise.migrations import operations as ops
from orjson import loads
from src.common.utils.ids import uuid7
from tortoise.fields.data import JSON_DUMPS
from tortoise import fields

class Migration(migrations.Migration):
    dependencies = [('models', '0056_auto_20260722_1454')]

    initial = False

    operations = [
        ops.CreateModel(
            name='EmailTemplateRecord',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('key', fields.CharField(db_index=True, max_length=96)),
                ('locale', fields.CharField(db_index=True, max_length=16)),
                ('name', fields.CharField(max_length=160)),
                ('description', fields.CharField(null=True, max_length=500)),
                ('subject_template', fields.CharField(max_length=500)),
                ('html_template', fields.TextField(unique=False)),
                ('text_template', fields.TextField(unique=False)),
                ('variables', fields.JSONField(default=list, encoder=JSON_DUMPS, decoder=loads)),
                ('is_enabled', fields.BooleanField(default=True, db_index=True)),
                ('version', fields.IntField(default=1)),
            ],
            options={'table': 'system_email_templates', 'app': 'models', 'unique_together': (('key', 'locale'),), 'pk_attr': 'id', 'table_description': 'Localized editable email templates used by all mail Connectors.'},
            bases=['BaseModel'],
        ),
    ]
