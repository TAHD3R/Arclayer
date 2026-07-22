from tortoise import migrations
from tortoise.migrations import operations as ops
from orjson import loads
from src.common.utils.ids import uuid7
from src.models.design_systems._enums import DesignSystemConceptGenerationStatus
from tortoise.fields.data import JSON_DUMPS
from tortoise import fields
from tortoise.indexes import Index

class Migration(migrations.Migration):
    dependencies = [('models', '0049_auto_20260721_0822')]

    initial = False

    operations = [
        ops.CreateModel(
            name='DesignSystemConceptGenerationRecord',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('workspace_id', fields.UUIDField(db_index=True)),
                ('project_id', fields.UUIDField(db_index=True)),
                ('design_system_id', fields.UUIDField(db_index=True)),
                ('base_version_id', fields.UUIDField(db_index=True)),
                ('base_manifest_checksum', fields.CharField(db_index=True, max_length=71)),
                ('base_site_revision_id', fields.UUIDField(db_index=True)),
                ('base_etag', fields.CharField(max_length=71)),
                ('job_id', fields.UUIDField(unique=True, db_index=True)),
                ('actor_user_id', fields.UUIDField(db_index=True)),
                ('agent_run_id', fields.UUIDField(db_index=True)),
                ('tool_name', fields.CharField(max_length=128)),
                ('objective', fields.TextField(unique=False)),
                ('locale', fields.CharField(max_length=16)),
                ('candidate_count', fields.IntField()),
                ('request_fingerprint', fields.CharField(max_length=64)),
                ('status', fields.CharEnumField(default=DesignSystemConceptGenerationStatus.QUEUED, db_index=True, description='QUEUED: queued\nRUNNING: running\nPARTIAL: partial\nSUCCEEDED: succeeded\nFAILED: failed\nCANCELLED: cancelled', db_default=DesignSystemConceptGenerationStatus.QUEUED, enum_type=DesignSystemConceptGenerationStatus, max_length=16)),
                ('candidates', fields.JSONField(default=list, encoder=JSON_DUMPS, decoder=loads)),
                ('failures', fields.JSONField(default=list, encoder=JSON_DUMPS, decoder=loads)),
                ('started_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ('terminal_at', fields.DatetimeField(null=True, db_index=True, auto_now=False, auto_now_add=False)),
            ],
            options={'table': 'design_system_concept_generations', 'app': 'models', 'indexes': [Index(fields=['project_id', 'design_system_id', 'created_at']), Index(fields=['base_version_id', 'status', 'created_at'])], 'pk_attr': 'id', 'table_description': 'Durable Agent Style Guide concept intents, candidates, and structured failures.'},
            bases=['BaseModel'],
        ),
    ]
