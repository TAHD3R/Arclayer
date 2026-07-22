from tortoise import migrations
from tortoise.migrations import operations as ops
from orjson import loads
from src.common.utils.ids import uuid7
from src.models.builder._enums import BuilderProvenanceSource, SiteRevisionLifecycleStatus
from src.models.projects._enums import ProjectAuthoringMode, ProjectAuthoringState
from tortoise.fields.base import OnDelete
from tortoise.fields.data import JSON_DUMPS
from tortoise import fields
from tortoise.indexes import Index

class Migration(migrations.Migration):
    dependencies = [('models', '0043_auto_20260720_2214')]

    initial = False

    operations = [
        ops.CreateModel(
            name='BuilderInitializationCommandRecord',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('workspace_id', fields.UUIDField(db_index=True)),
                ('project_id', fields.UUIDField(db_index=True)),
                ('site_id', fields.UUIDField(db_index=True)),
                ('environment_id', fields.UUIDField(db_index=True)),
                ('request_idempotency_key', fields.CharField(max_length=128)),
                ('request_fingerprint', fields.CharField(max_length=64)),
                ('result_snapshot', fields.JSONField(encoder=JSON_DUMPS, decoder=loads)),
                ('actor_user_id', fields.UUIDField(null=True, db_index=True)),
                ('correlation_id', fields.CharField(null=True, db_index=True, max_length=128)),
            ],
            options={'table': 'builder_initialization_commands', 'app': 'models', 'unique_together': (('project_id', 'request_idempotency_key'),), 'pk_attr': 'id', 'table_description': 'Idempotent command snapshots for Builder baseline initialization.'},
            bases=['BaseModel'],
        ),
        ops.CreateModel(
            name='ContentStructureRevisionRecord',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('workspace_id', fields.UUIDField(db_index=True)),
                ('project_id', fields.UUIDField(db_index=True)),
                ('site_id', fields.UUIDField(db_index=True)),
                ('environment_id', fields.UUIDField(db_index=True)),
                ('revision_number', fields.IntField()),
                ('parent_revision_id', fields.UUIDField(null=True, db_index=True)),
                ('schema_version', fields.IntField(default=1)),
                ('structure_hash', fields.CharField(db_index=True, max_length=71)),
                ('structure_snapshot', fields.JSONField(encoder=JSON_DUMPS, decoder=loads)),
                ('provenance_source', fields.CharEnumField(description='HUMAN: human\nAGENT: agent\nIMPORT: import\nSYSTEM: system', enum_type=BuilderProvenanceSource, max_length=16)),
                ('actor_user_id', fields.UUIDField(null=True, db_index=True)),
                ('agent_run_id', fields.UUIDField(null=True, db_index=True)),
                ('correlation_id', fields.CharField(null=True, db_index=True, max_length=128)),
            ],
            options={'table': 'content_structure_revisions', 'app': 'models', 'unique_together': (('project_id', 'site_id', 'environment_id', 'revision_number'),), 'indexes': [Index(fields=['project_id', 'site_id', 'environment_id', 'created_at'])], 'pk_attr': 'id', 'table_description': 'Immutable Builder sitemap snapshots over canonical content routing and hierarchy.'},
            bases=['BaseModel'],
        ),
        ops.CreateModel(
            name='SiteRevisionManifestRecord',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('workspace_id', fields.UUIDField(db_index=True)),
                ('project_id', fields.UUIDField(db_index=True)),
                ('site_id', fields.UUIDField(db_index=True)),
                ('environment_id', fields.UUIDField(db_index=True)),
                ('revision_number', fields.IntField()),
                ('base_revision_id', fields.UUIDField(null=True, db_index=True)),
                ('manifest_version', fields.IntField(default=1)),
                ('authoring_mode', fields.CharEnumField(description='BUILDER_MANAGED: builder_managed\nSOURCE_MANAGED: source_managed', enum_type=ProjectAuthoringMode, max_length=32)),
                ('content_structure_revision_id', fields.UUIDField(db_index=True)),
                ('content_structure_hash', fields.CharField(db_index=True, max_length=71)),
                ('design_system_id', fields.UUIDField(db_index=True)),
                ('design_system_version_id', fields.UUIDField(db_index=True)),
                ('design_system_manifest_checksum', fields.CharField(db_index=True, max_length=71)),
                ('page_version_pins', fields.JSONField(encoder=JSON_DUMPS, decoder=loads)),
                ('presentation_set_hash', fields.CharField(db_index=True, max_length=71)),
                ('manifest_hash', fields.CharField(unique=True, db_index=True, max_length=71)),
                ('manifest_snapshot', fields.JSONField(encoder=JSON_DUMPS, decoder=loads)),
                ('provenance_source', fields.CharEnumField(description='HUMAN: human\nAGENT: agent\nIMPORT: import\nSYSTEM: system', enum_type=BuilderProvenanceSource, max_length=16)),
                ('actor_user_id', fields.UUIDField(null=True, db_index=True)),
                ('agent_run_id', fields.UUIDField(null=True, db_index=True)),
                ('correlation_id', fields.CharField(null=True, db_index=True, max_length=128)),
            ],
            options={'table': 'site_revision_manifests', 'app': 'models', 'unique_together': (('project_id', 'site_id', 'environment_id', 'revision_number'),), 'indexes': [Index(fields=['project_id', 'site_id', 'environment_id', 'created_at']), Index(fields=['design_system_version_id', 'created_at'])], 'pk_attr': 'id', 'table_description': 'Immutable Builder input manifests without lifecycle or artifact state.'},
            bases=['BaseModel'],
        ),
        ops.CreateModel(
            name='SiteRevisionStatusRecord',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('site_revision', fields.OneToOneField('models.SiteRevisionManifestRecord', source_field='site_revision_id', db_constraint=True, to_field='id', related_name='status_projection', on_delete=OnDelete.CASCADE)),
                ('status', fields.CharEnumField(default=SiteRevisionLifecycleStatus.DRAFT, db_index=True, description='DRAFT: draft\nREVIEW: review\nREADY: ready\nSUPERSEDED: superseded', enum_type=SiteRevisionLifecycleStatus, max_length=16)),
                ('status_revision', fields.IntField(default=1)),
                ('readiness_findings', fields.JSONField(default=list, encoder=JSON_DUMPS, decoder=loads)),
                ('validator_version', fields.CharField(max_length=64)),
                ('etag', fields.CharField(unique=True, db_index=True, max_length=71)),
                ('calculated_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=False)),
            ],
            options={'table': 'site_revision_statuses', 'app': 'models', 'pk_attr': 'id', 'table_description': 'Concurrency-controlled Builder readiness and review projections.'},
            bases=['BaseModel'],
        ),
        ops.AddField(
            model_name='ProjectRecord',
            name='authoring_mode',
            field=fields.CharEnumField(null=True, db_index=True, description='BUILDER_MANAGED: builder_managed\nSOURCE_MANAGED: source_managed', enum_type=ProjectAuthoringMode, max_length=32),
        ),
        ops.AddField(
            model_name='ProjectRecord',
            name='authoring_resolved_at',
            field=fields.DatetimeField(null=True, auto_now=False, auto_now_add=False),
        ),
        ops.AddField(
            model_name='ProjectRecord',
            name='authoring_resolved_by_user_id',
            field=fields.UUIDField(null=True, db_index=True),
        ),
        ops.AddField(
            model_name='ProjectRecord',
            name='authoring_revision',
            field=fields.IntField(default=1, db_default=1),
        ),
        ops.AddField(
            model_name='ProjectRecord',
            name='authoring_state',
            field=fields.CharEnumField(default=ProjectAuthoringState.MIGRATION_REQUIRED, db_index=True, description='READY: ready\nMIGRATION_REQUIRED: migration_required', db_default=ProjectAuthoringState.MIGRATION_REQUIRED, enum_type=ProjectAuthoringState, max_length=32),
        ),
    ]
