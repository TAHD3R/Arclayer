from tortoise import migrations
from tortoise.migrations import operations as ops
from orjson import loads
from src.common.utils.ids import uuid7
from src.models.builder._enums import BuilderCompositionSagaStatus
from tortoise.fields.data import JSON_DUMPS
from tortoise import fields
from tortoise.indexes import Index

class Migration(migrations.Migration):
    dependencies = [('models', '0054_auto_20260722_0813')]

    initial = False

    operations = [
        ops.CreateModel(
            name='BuilderCompositionSagaRecord',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('workspace_id', fields.UUIDField(db_index=True)),
                ('project_id', fields.UUIDField(db_index=True)),
                ('runtime_id', fields.UUIDField(db_index=True)),
                ('site_id', fields.UUIDField(db_index=True)),
                ('environment_id', fields.UUIDField(db_index=True)),
                ('actor_user_id', fields.UUIDField(db_index=True)),
                ('initial_site_revision_id', fields.UUIDField(db_index=True)),
                ('initial_manifest_hash', fields.CharField(db_index=True, max_length=71)),
                ('initial_etag', fields.CharField(max_length=71)),
                ('agent_run_id', fields.UUIDField(null=True, db_index=True)),
                ('agent_id', fields.UUIDField(db_index=True)),
                ('agent_version_id', fields.UUIDField(db_index=True)),
                ('agent_assignment_id', fields.UUIDField(db_index=True)),
                ('objective', fields.TextField(unique=False)),
                ('locale', fields.CharField(max_length=16)),
                ('candidate_count', fields.IntField()),
                ('targets', fields.JSONField(encoder=JSON_DUMPS, decoder=loads)),
                ('planning_targets', fields.JSONField(encoder=JSON_DUMPS, decoder=loads)),
                ('knowledge_reference_ids', fields.JSONField(default=list, encoder=JSON_DUMPS, decoder=loads)),
                ('request_fingerprint', fields.CharField(max_length=64)),
                ('status', fields.CharEnumField(default=BuilderCompositionSagaStatus.PLANNING_QUEUED, db_index=True, description='PLANNING_QUEUED: planning_queued\nPLANNING_RUNNING: planning_running\nPLANNING_REVIEW_PENDING: planning_review_pending\nCOMPOSITION_QUEUED: composition_queued\nCOMPOSITION_RUNNING: composition_running\nCOMPOSITION_REVIEW_PENDING: composition_review_pending\nCOMPLETED: completed\nFAILED: failed\nCANCELLED: cancelled', db_default=BuilderCompositionSagaStatus.PLANNING_QUEUED, enum_type=BuilderCompositionSagaStatus, max_length=32)),
                ('waiting_reason', fields.CharField(null=True, max_length=64)),
                ('planning_generation_id', fields.UUIDField(db_index=True)),
                ('planning_change_set_id', fields.UUIDField(null=True, db_index=True)),
                ('planning_result_revision_id', fields.UUIDField(null=True, db_index=True)),
                ('composition_generation_id', fields.UUIDField(null=True, db_index=True)),
                ('composition_change_set_id', fields.UUIDField(null=True, db_index=True)),
                ('composition_result_revision_id', fields.UUIDField(null=True, db_index=True)),
                ('terminal_error', fields.JSONField(null=True, encoder=JSON_DUMPS, decoder=loads)),
                ('cancel_requested_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ('cancel_requested_by_user_id', fields.UUIDField(null=True)),
                ('cancel_reason', fields.TextField(null=True, unique=False)),
                ('terminal_at', fields.DatetimeField(null=True, db_index=True, auto_now=False, auto_now_add=False)),
            ],
            options={'table': 'builder_composition_sagas', 'app': 'models', 'indexes': [Index(fields=['project_id', 'actor_user_id', 'status', 'created_at']), Index(fields=['project_id', 'initial_site_revision_id', 'created_at'])], 'pk_attr': 'id', 'table_description': 'Durable planning-to-composition parent with two explicit review gates.'},
            bases=['BaseModel'],
        ),
        ops.AddField(
            model_name='BuilderGenerationRecord',
            name='composition_saga_id',
            field=fields.UUIDField(null=True, db_index=True),
        ),
        ops.AddField(
            model_name='BuilderGenerationRecord',
            name='composition_saga_phase',
            field=fields.CharField(null=True, max_length=16),
        ),
        ops.AddField(
            model_name='BuilderGenerationRecord',
            name='planning_context',
            field=fields.JSONField(null=True, encoder=JSON_DUMPS, decoder=loads),
        ),
    ]
