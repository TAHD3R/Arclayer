from tortoise import migrations
from tortoise.migrations import operations as ops
from orjson import loads
from src.common.utils.ids import uuid7
from tortoise.fields.base import OnDelete
from tortoise.fields.data import JSON_DUMPS
from tortoise import fields
from tortoise.indexes import Index

class Migration(migrations.Migration):
    dependencies = [('models', '0041_auto_20260720_2110')]

    initial = False

    operations = [
        ops.CreateModel(
            name='ProjectDesignSystemAssignmentRecord',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('workspace', fields.ForeignKeyField('models.Workspace', source_field='workspace_id', db_constraint=True, to_field='id', related_name='project_design_system_assignments', on_delete=OnDelete.CASCADE)),
                ('project_id', fields.UUIDField(unique=True)),
                ('design_system_id', fields.UUIDField(db_index=True)),
                ('design_system_version_id', fields.UUIDField(db_index=True)),
                ('manifest_checksum', fields.CharField(db_index=True, max_length=71)),
                ('validation_finding_hash', fields.CharField(max_length=71)),
                ('metadata_revision', fields.IntField(default=1)),
                ('assigned_by_user_id', fields.UUIDField(null=True, db_index=True)),
            ],
            options={'table': 'project_design_system_assignments', 'app': 'models', 'indexes': [Index(fields=['workspace_id', 'design_system_id', 'design_system_version_id'])], 'pk_attr': 'id', 'table_description': 'Exact Design System assignments for canonical Projects.'},
            bases=['BaseModel'],
        ),
        ops.CreateModel(
            name='ProjectDesignSystemCommandRecord',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('workspace', fields.ForeignKeyField('models.Workspace', source_field='workspace_id', db_constraint=True, to_field='id', related_name='project_design_system_commands', on_delete=OnDelete.CASCADE)),
                ('project_id', fields.UUIDField(db_index=True)),
                ('command_kind', fields.CharField(max_length=32)),
                ('request_idempotency_key', fields.CharField(max_length=128)),
                ('request_fingerprint', fields.CharField(max_length=64)),
                ('result_snapshot', fields.JSONField(encoder=JSON_DUMPS, decoder=loads)),
                ('actor_user_id', fields.UUIDField(null=True, db_index=True)),
            ],
            options={'table': 'project_design_system_commands', 'app': 'models', 'unique_together': (('project_id', 'request_idempotency_key'),), 'pk_attr': 'id', 'table_description': 'Replay evidence for Project Design System authority commands.'},
            bases=['BaseModel'],
        ),
        ops.AddField(
            model_name='DesignSystemRecord',
            name='forked_from_manifest_checksum',
            field=fields.CharField(null=True, max_length=71),
        ),
        ops.AddField(
            model_name='DesignSystemRecord',
            name='forked_from_system_id',
            field=fields.UUIDField(null=True, db_index=True),
        ),
        ops.AddField(
            model_name='DesignSystemRecord',
            name='forked_from_version_id',
            field=fields.UUIDField(null=True, db_index=True),
        ),
    ]
