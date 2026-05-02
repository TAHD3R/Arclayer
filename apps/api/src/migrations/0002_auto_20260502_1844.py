from tortoise import migrations
from tortoise.migrations import operations as ops
from src.common.utils.ids import uuid7
from src.models.content._enums import ContentReleaseStatus, PublishJobStatus, PublishJobType
from tortoise.fields.base import OnDelete
from tortoise import fields
from tortoise.indexes import Index

class Migration(migrations.Migration):
    dependencies = [('models', '0001_initial')]

    initial = False

    operations = [
        ops.CreateModel(
            name='PublishJobRecord',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('workspace', fields.ForeignKeyField('models.Workspace', source_field='workspace_id', db_constraint=True, to_field='id', related_name='publish_jobs', on_delete=OnDelete.CASCADE)),
                ('site', fields.ForeignKeyField('models.SiteRecord', source_field='site_id', db_constraint=True, to_field='id', related_name='publish_jobs', on_delete=OnDelete.CASCADE)),
                ('project_id', fields.UUIDField(null=True, db_index=True)),
                ('release_id', fields.UUIDField(null=True, db_index=True)),
                ('job_type', fields.CharEnumField(db_index=True, description='SCHEDULED_PUBLISH: scheduled_publish\nMANUAL_PUBLISH: manual_publish\nRETRY: retry', enum_type=PublishJobType, max_length=32)),
                ('status', fields.CharEnumField(default=PublishJobStatus.PENDING, db_index=True, description='PENDING: pending\nRUNNING: running\nCOMPLETED: completed\nFAILED: failed\nCANCELLED: cancelled', enum_type=PublishJobStatus, max_length=16)),
                ('scheduled_at', fields.DatetimeField(null=True, db_index=True, auto_now=False, auto_now_add=False)),
                ('started_at', fields.DatetimeField(null=True, db_index=True, auto_now=False, auto_now_add=False)),
                ('completed_at', fields.DatetimeField(null=True, db_index=True, auto_now=False, auto_now_add=False)),
                ('error_message', fields.TextField(null=True, unique=False)),
                ('created_by_user_id', fields.UUIDField(null=True, db_index=True)),
            ],
            options={'table': 'domain_publish_jobs', 'app': 'models', 'indexes': [Index(fields=['status', 'scheduled_at']), Index(fields=['site_id', 'created_at'])], 'pk_attr': 'id', 'table_description': 'Domain model for release publish job tracking.'},
            bases=['BaseModel'],
        ),
        ops.CreateModel(
            name='TranslationGroupRecord',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('workspace', fields.ForeignKeyField('models.Workspace', source_field='workspace_id', db_constraint=True, to_field='id', related_name='content_translation_groups', on_delete=OnDelete.CASCADE)),
                ('site', fields.ForeignKeyField('models.SiteRecord', source_field='site_id', db_constraint=True, to_field='id', related_name='content_translation_groups', on_delete=OnDelete.CASCADE)),
                ('primary_item_id', fields.UUIDField(null=True, db_index=True)),
                ('primary_locale', fields.CharField(default='zh-CN', max_length=16)),
            ],
            options={'table': 'domain_content_translation_groups', 'app': 'models', 'pk_attr': 'id', 'table_description': 'Domain model for content translation groups.'},
            bases=['BaseModel'],
        ),
        ops.AddField(
            model_name='ContentItemRecord',
            name='translation_group',
            field=fields.ForeignKeyField('models.TranslationGroupRecord', source_field='translation_group_id', null=True, db_constraint=True, to_field='id', related_name='items', on_delete=OnDelete.SET_NULL),
        ),
        ops.AlterField(
            model_name='ContentReleaseRecord',
            name='activated_at',
            field=fields.DatetimeField(null=True, db_index=True, auto_now=False, auto_now_add=False),
        ),
        ops.AddField(
            model_name='ContentReleaseRecord',
            name='scheduled_at',
            field=fields.DatetimeField(null=True, db_index=True, auto_now=False, auto_now_add=False),
        ),
        ops.AddField(
            model_name='ContentReleaseRecord',
            name='status',
            field=fields.CharEnumField(default=ContentReleaseStatus.ACTIVE, db_index=True, description='ACTIVE: active\nSCHEDULED: scheduled\nPUBLISHED: published\nCANCELLED: cancelled', enum_type=ContentReleaseStatus, max_length=16),
        ),
    ]
