from tortoise import migrations
from tortoise.migrations import operations as ops
from orjson import loads
from src.common.utils.ids import uuid7
from src.models.design_systems._enums import DesignSystemOwnerKind, DesignSystemStatus, DesignSystemValidationStatus, DesignSystemVersionSource
from tortoise.fields.base import OnDelete
from tortoise.fields.data import JSON_DUMPS
from tortoise import fields
from tortoise.indexes import Index

class Migration(migrations.Migration):
    dependencies = [('models', '0040_auto_20260720_2029')]

    initial = False

    operations = [
        ops.CreateModel(
            name='DesignSystemRecord',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('workspace', fields.ForeignKeyField('models.Workspace', source_field='workspace_id', db_constraint=True, to_field='id', related_name='design_systems', on_delete=OnDelete.CASCADE)),
                ('owner_kind', fields.CharEnumField(default=DesignSystemOwnerKind.WORKSPACE, db_index=True, description='WORKSPACE: workspace\nPROJECT: project', enum_type=DesignSystemOwnerKind, max_length=16)),
                ('owning_project_id', fields.UUIDField(null=True, db_index=True)),
                ('name', fields.CharField(max_length=128)),
                ('normalized_name', fields.CharField(max_length=128)),
                ('description', fields.CharField(null=True, max_length=1000)),
                ('status', fields.CharEnumField(default=DesignSystemStatus.ACTIVE, db_index=True, description='ACTIVE: active\nARCHIVED: archived', enum_type=DesignSystemStatus, max_length=16)),
                ('linked_asset_collection_id', fields.UUIDField(null=True, db_index=True)),
                ('latest_valid_version_id', fields.UUIDField(null=True, db_index=True)),
                ('metadata_revision', fields.IntField(default=1)),
                ('created_by_user_id', fields.UUIDField(null=True, db_index=True)),
                ('updated_by_user_id', fields.UUIDField(null=True, db_index=True)),
                ('request_idempotency_key', fields.CharField(max_length=128)),
                ('request_fingerprint', fields.CharField(max_length=64)),
            ],
            options={'table': 'design_systems', 'app': 'models', 'unique_together': (('workspace_id', 'normalized_name'), ('workspace_id', 'request_idempotency_key')), 'indexes': [Index(fields=['workspace_id', 'status', 'updated_at'])], 'pk_attr': 'id', 'table_description': 'Workspace-owned Design System identities.'},
            bases=['BaseModel'],
        ),
        ops.CreateModel(
            name='DesignSystemVersionRecord',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('design_system', fields.ForeignKeyField('models.DesignSystemRecord', source_field='design_system_id', db_constraint=True, to_field='id', related_name='versions', on_delete=OnDelete.CASCADE)),
                ('workspace_id', fields.UUIDField(db_index=True)),
                ('version_number', fields.IntField()),
                ('manifest_version', fields.IntField(default=1)),
                ('manifest', fields.JSONField(encoder=JSON_DUMPS, decoder=loads)),
                ('manifest_checksum', fields.CharField(db_index=True, max_length=71)),
                ('token_index_hash', fields.CharField(max_length=71)),
                ('component_catalog_version', fields.CharField(null=True, max_length=128)),
                ('schema_version', fields.IntField(default=1)),
                ('parent_version_id', fields.UUIDField(null=True, db_index=True)),
                ('source', fields.CharEnumField(default=DesignSystemVersionSource.MANUAL, db_index=True, description='MANUAL: manual\nAGENT: agent\nIMPORT: import\nDERIVED: derived\nFORK: fork', enum_type=DesignSystemVersionSource, max_length=16)),
                ('provenance', fields.JSONField(default=dict, encoder=JSON_DUMPS, decoder=loads)),
                ('created_by_user_id', fields.UUIDField(null=True, db_index=True)),
                ('correlation_id', fields.CharField(null=True, max_length=128)),
                ('request_idempotency_key', fields.CharField(max_length=128)),
                ('request_fingerprint', fields.CharField(max_length=64)),
            ],
            options={'table': 'design_system_versions', 'app': 'models', 'unique_together': (('design_system_id', 'version_number'), ('design_system_id', 'request_idempotency_key')), 'indexes': [Index(fields=['workspace_id', 'design_system_id', 'created_at'])], 'pk_attr': 'id', 'table_description': 'Immutable Workspace Design System manifests.'},
            bases=['BaseModel'],
        ),
        ops.CreateModel(
            name='DesignSystemValidationResultRecord',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('design_system_version', fields.ForeignKeyField('models.DesignSystemVersionRecord', source_field='design_system_version_id', db_constraint=True, to_field='id', related_name='validation_results', on_delete=OnDelete.CASCADE)),
                ('workspace_id', fields.UUIDField(db_index=True)),
                ('profile', fields.CharField(default='foundation', db_index=True, max_length=32)),
                ('validator_version', fields.IntField(default=1)),
                ('status', fields.CharEnumField(db_index=True, description='VALID: valid\nINVALID: invalid', enum_type=DesignSystemValidationStatus, max_length=16)),
                ('findings', fields.JSONField(default=list, encoder=JSON_DUMPS, decoder=loads)),
                ('finding_hash', fields.CharField(max_length=71)),
                ('token_index_hash', fields.CharField(max_length=71)),
                ('publish_ready', fields.BooleanField(default=False)),
                ('compatibility', fields.JSONField(default=dict, encoder=JSON_DUMPS, decoder=loads)),
                ('actor_user_id', fields.UUIDField(null=True, db_index=True)),
                ('correlation_id', fields.CharField(null=True, max_length=128)),
                ('request_idempotency_key', fields.CharField(max_length=128)),
                ('request_fingerprint', fields.CharField(max_length=64)),
            ],
            options={'table': 'design_system_validation_results', 'app': 'models', 'unique_together': (('design_system_version_id', 'request_idempotency_key'),), 'indexes': [Index(fields=['workspace_id', 'profile', 'status', 'created_at'])], 'pk_attr': 'id', 'table_description': 'Immutable Design System validation evidence.'},
            bases=['BaseModel'],
        ),
        ops.CreateModel(
            name='WorkspaceDesignSystemDefaultCommandRecord',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('workspace', fields.ForeignKeyField('models.Workspace', source_field='workspace_id', db_constraint=True, to_field='id', related_name='design_system_default_commands', on_delete=OnDelete.CASCADE)),
                ('request_idempotency_key', fields.CharField(max_length=128)),
                ('request_fingerprint', fields.CharField(max_length=64)),
                ('result_snapshot', fields.JSONField(encoder=JSON_DUMPS, decoder=loads)),
                ('actor_user_id', fields.UUIDField(null=True, db_index=True)),
            ],
            options={'table': 'workspace_design_system_default_commands', 'app': 'models', 'unique_together': (('workspace_id', 'request_idempotency_key'),), 'pk_attr': 'id', 'table_description': 'Replay evidence for exact Workspace Design System default commands.'},
            bases=['BaseModel'],
        ),
        ops.CreateModel(
            name='WorkspaceDesignSystemDefaultRecord',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('workspace', fields.OneToOneField('models.Workspace', source_field='workspace_id', db_constraint=True, to_field='id', related_name='design_system_default', on_delete=OnDelete.CASCADE)),
                ('design_system_id', fields.UUIDField(db_index=True)),
                ('design_system_version_id', fields.UUIDField(db_index=True)),
                ('manifest_checksum', fields.CharField(db_index=True, max_length=71)),
                ('validation_finding_hash', fields.CharField(max_length=71)),
                ('metadata_revision', fields.IntField(default=1)),
                ('assigned_by_user_id', fields.UUIDField(null=True, db_index=True)),
            ],
            options={'table': 'workspace_design_system_defaults', 'app': 'models', 'indexes': [Index(fields=['workspace_id', 'design_system_id', 'design_system_version_id'])], 'pk_attr': 'id', 'table_description': 'Exact Workspace Design System default assignments.'},
            bases=['BaseModel'],
        ),
    ]
