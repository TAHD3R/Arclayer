from tortoise import migrations
from tortoise.migrations import operations as ops
from src.common.utils.ids import uuid7
from tortoise.fields.base import OnDelete
from tortoise import fields
from tortoise.indexes import Index

class Migration(migrations.Migration):
    dependencies = [('models', '0001_initial')]

    initial = False

    operations = [
        ops.CreateModel(
            name='TranslationGroupRecord',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('workspace', fields.ForeignKeyField('models.Workspace', source_field='workspace_id', db_constraint=True, to_field='id', related_name='content_translation_groups', on_delete=OnDelete.CASCADE)),
                ('site', fields.ForeignKeyField('models.SiteRecord', source_field='site_id', db_constraint=True, to_field='id', related_name='content_translation_groups', on_delete=OnDelete.CASCADE)),
                ('primary_item', fields.ForeignKeyField('models.ContentItemRecord', source_field='primary_item_id', null=True, db_constraint=True, to_field='id', related_name='primary_translation_groups', on_delete=OnDelete.SET_NULL)),
                ('primary_locale', fields.CharField(default='zh-CN', max_length=16)),
            ],
            options={'table': 'domain_content_translation_groups', 'app': 'models', 'pk_attr': 'id', 'table_description': 'Domain model for content translation groups.'},
            bases=['BaseModel'],
        ),
        ops.AddIndex(
            model_name='ContentItemRecord',
            index=Index(fields=['translation_group_id', 'locale']),
        ),
        ops.AddField(
            model_name='ContentItemRecord',
            name='translation_group',
            field=fields.ForeignKeyField('models.TranslationGroupRecord', source_field='translation_group_id', null=True, db_constraint=True, to_field='id', related_name='items', on_delete=OnDelete.SET_NULL),
        ),
    ]
