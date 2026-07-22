from tortoise import migrations
from tortoise.migrations import operations as ops
from orjson import loads
from src.common.utils.ids import uuid7
from src.models.builder._enums import BuilderGenerationStatus
from tortoise.fields.base import OnDelete
from tortoise.fields.data import JSON_DUMPS
from tortoise import fields
from tortoise.indexes import Index

class Migration(migrations.Migration):
    dependencies = [('models', '0046_auto_20260721_0053')]

    initial = False

    operations = [
        ops.CreateModel(
            name='AgentRunBuilderSnapshotV1Record',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('run', fields.OneToOneField('models.AgentRunV1Record', source_field='run_id', db_constraint=True, to_field='id', related_name='builder_snapshot', on_delete=OnDelete.CASCADE)),
                ('workspace_id', fields.UUIDField(db_index=True)),
                ('project_id', fields.UUIDField(db_index=True)),
                ('site_id', fields.UUIDField(db_index=True)),
                ('environment_id', fields.UUIDField(db_index=True)),
                ('site_revision_id', fields.UUIDField(db_index=True)),
                ('revision_number', fields.IntField()),
                ('manifest_hash', fields.CharField(db_index=True, max_length=71)),
                ('status_etag', fields.CharField(max_length=71)),
                ('content_structure_revision_id', fields.UUIDField(db_index=True)),
                ('content_structure_hash', fields.CharField(db_index=True, max_length=71)),
                ('context_hash', fields.CharField(db_index=True, max_length=71)),
                ('context_snapshot', fields.JSONField(encoder=JSON_DUMPS, decoder=loads)),
                ('context_byte_size', fields.IntField()),
            ],
            options={'table': 'ai_run_builder_snapshots', 'app': 'models', 'indexes': [Index(fields=['project_id', 'site_revision_id', 'created_at']), Index(fields=['workspace_id', 'created_at'])], 'pk_attr': 'id', 'table_description': 'Exact immutable Site Revision context captured for Builder-bound Agent Runs.'},
            bases=['BaseModel'],
        ),
        ops.CreateModel(
            name='BuilderGenerationRecord',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('workspace_id', fields.UUIDField(db_index=True)),
                ('project_id', fields.UUIDField(db_index=True)),
                ('runtime_id', fields.UUIDField(db_index=True)),
                ('site_id', fields.UUIDField(db_index=True)),
                ('environment_id', fields.UUIDField(db_index=True)),
                ('base_site_revision_id', fields.UUIDField(db_index=True)),
                ('base_manifest_hash', fields.CharField(db_index=True, max_length=71)),
                ('base_etag', fields.CharField(max_length=71)),
                ('job_id', fields.UUIDField(unique=True, db_index=True)),
                ('actor_user_id', fields.UUIDField(db_index=True)),
                ('agent_run_id', fields.UUIDField(db_index=True)),
                ('tool_name', fields.CharField(max_length=128)),
                ('target_stage', fields.CharField(max_length=32)),
                ('objective', fields.TextField(unique=False)),
                ('locale', fields.CharField(max_length=16)),
                ('candidate_count', fields.IntField()),
                ('selected_page_ids', fields.JSONField(default=list, encoder=JSON_DUMPS, decoder=loads)),
                ('knowledge_reference_ids', fields.JSONField(default=list, encoder=JSON_DUMPS, decoder=loads)),
                ('request_fingerprint', fields.CharField(max_length=64)),
                ('status', fields.CharEnumField(default=BuilderGenerationStatus.QUEUED, db_index=True, description='QUEUED: queued\nRUNNING: running\nPARTIAL: partial\nSUCCEEDED: succeeded\nFAILED: failed\nCANCELLED: cancelled', db_default=BuilderGenerationStatus.QUEUED, enum_type=BuilderGenerationStatus, max_length=16)),
                ('candidates', fields.JSONField(default=list, encoder=JSON_DUMPS, decoder=loads)),
                ('failures', fields.JSONField(default=list, encoder=JSON_DUMPS, decoder=loads)),
                ('started_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ('terminal_at', fields.DatetimeField(null=True, db_index=True, auto_now=False, auto_now_add=False)),
            ],
            options={'table': 'builder_generations', 'app': 'models', 'indexes': [Index(fields=['project_id', 'site_id', 'environment_id', 'created_at']), Index(fields=['base_site_revision_id', 'status', 'created_at'])], 'pk_attr': 'id', 'table_description': 'Durable Builder generation intent, partial candidates, and structured failures.'},
            bases=['BaseModel'],
        ),
    ]
