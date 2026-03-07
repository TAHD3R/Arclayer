from tortoise import migrations
from tortoise.migrations import operations as ops
from apps.api.src.common.utils.ids import uuid7
from tortoise.fields.base import OnDelete
from tortoise import fields

class Migration(migrations.Migration):
    dependencies = [('models', '0009_auto_20260306_2007')]

    initial = False

    operations = [
        ops.CreateModel(
            name='ContentRouteRecord',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('workspace', fields.ForeignKeyField('models.Workspace', source_field='workspace_id', db_constraint=True, to_field='id', related_name='content_routes', on_delete=OnDelete.CASCADE)),
                ('site', fields.ForeignKeyField('models.SiteRecord', source_field='site_id', db_constraint=True, to_field='id', related_name='content_routes', on_delete=OnDelete.CASCADE)),
                ('entry', fields.ForeignKeyField('models.ContentEntryRecord', source_field='entry_id', db_constraint=True, to_field='id', related_name='routes', on_delete=OnDelete.CASCADE)),
                ('locale', fields.CharField(default='zh-CN', db_index=True, max_length=16)),
                ('path', fields.CharField(db_index=True, max_length=512)),
                ('is_active', fields.BooleanField(default=True, db_index=True)),
            ],
            options={'table': 'content_routes', 'app': 'models', 'unique_together': (('site_id', 'locale', 'path'), ('entry_id', 'locale')), 'pk_attr': 'id', 'table_description': 'Routable path binding for a content entry (capability: routable).'},
            bases=['BaseModel'],
        ),
        ops.CreateModel(
            name='ContentTreeNodeRecord',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('workspace', fields.ForeignKeyField('models.Workspace', source_field='workspace_id', db_constraint=True, to_field='id', related_name='content_tree_nodes', on_delete=OnDelete.CASCADE)),
                ('site', fields.ForeignKeyField('models.SiteRecord', source_field='site_id', db_constraint=True, to_field='id', related_name='content_tree_nodes', on_delete=OnDelete.CASCADE)),
                ('entry', fields.OneToOneField('models.ContentEntryRecord', source_field='entry_id', db_constraint=True, to_field='id', related_name='tree_node', on_delete=OnDelete.CASCADE)),
                ('parent_entry', fields.ForeignKeyField('models.ContentEntryRecord', source_field='parent_entry_id', null=True, db_constraint=True, to_field='id', related_name='tree_children', on_delete=OnDelete.SET_NULL)),
                ('sort_order', fields.IntField(default=0)),
            ],
            options={'table': 'content_tree_nodes', 'app': 'models', 'unique_together': (('site_id', 'entry_id'),), 'pk_attr': 'id', 'table_description': 'Tree hierarchy metadata for a content entry (capability: treeable).'},
            bases=['BaseModel'],
        ),
        ops.RemoveField(model_name='ContentEntryRecord', name='page_blueprint'),
        ops.RemoveField(model_name='ContentEntryRecord', name='parent_entry'),
        ops.RemoveField(model_name='ContentEntryRecord', name='path'),
        ops.RemoveField(model_name='ContentEntryRecord', name='sort_order'),
    ]
