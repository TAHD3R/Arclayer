from tortoise import migrations
from tortoise.migrations import operations as ops
from orjson import loads
from src.common.utils.ids import uuid7
from src.models.builder._enums import BuilderApprovalClass, BuilderChangeSetCommandKind, BuilderChangeSetStatus, BuilderProvenanceSource
from tortoise.fields.data import JSON_DUMPS
from tortoise import fields
from tortoise.indexes import Index

class Migration(migrations.Migration):
    dependencies = [('models', '0044_auto_20260720_2323')]

    initial = False

    operations = [
        ops.CreateModel(
            name='BuilderChangeSetCommandRecord',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('workspace_id', fields.UUIDField(db_index=True)),
                ('project_id', fields.UUIDField(db_index=True)),
                ('change_set_id', fields.UUIDField(null=True, db_index=True)),
                ('command_kind', fields.CharEnumField(db_index=True, description='PREVIEW: preview\nAPPLY: apply', enum_type=BuilderChangeSetCommandKind, max_length=16)),
                ('request_idempotency_key', fields.CharField(max_length=128)),
                ('request_fingerprint', fields.CharField(max_length=64)),
                ('result_snapshot', fields.JSONField(encoder=JSON_DUMPS, decoder=loads)),
                ('actor_user_id', fields.UUIDField(null=True, db_index=True)),
                ('correlation_id', fields.CharField(null=True, db_index=True, max_length=128)),
            ],
            options={'table': 'builder_change_set_commands', 'app': 'models', 'unique_together': (('project_id', 'command_kind', 'request_idempotency_key'),), 'pk_attr': 'id', 'table_description': 'Idempotent Builder ChangeSet preview and apply command results.'},
            bases=['BaseModel'],
        ),
        ops.CreateModel(
            name='BuilderChangeSetRecord',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('workspace_id', fields.UUIDField(db_index=True)),
                ('project_id', fields.UUIDField(db_index=True)),
                ('site_id', fields.UUIDField(db_index=True)),
                ('environment_id', fields.UUIDField(db_index=True)),
                ('base_site_revision_id', fields.UUIDField(db_index=True)),
                ('base_manifest_hash', fields.CharField(db_index=True, max_length=71)),
                ('status', fields.CharEnumField(default=BuilderChangeSetStatus.PREVIEWED, db_index=True, description='PREVIEWED: previewed\nAPPLIED: applied\nEXPIRED: expired\nFAILED: failed', db_default=BuilderChangeSetStatus.PREVIEWED, enum_type=BuilderChangeSetStatus, max_length=16)),
                ('operations', fields.JSONField(encoder=JSON_DUMPS, decoder=loads)),
                ('operations_hash', fields.CharField(db_index=True, max_length=71)),
                ('affected_targets', fields.JSONField(default=list, encoder=JSON_DUMPS, decoder=loads)),
                ('issues', fields.JSONField(default=list, encoder=JSON_DUMPS, decoder=loads)),
                ('required_permissions', fields.JSONField(default=list, encoder=JSON_DUMPS, decoder=loads)),
                ('approval_class', fields.CharEnumField(db_index=True, description='NONE: none\nREVIEW: review\nDESTRUCTIVE: destructive', enum_type=BuilderApprovalClass, max_length=16)),
                ('preview_token_hash', fields.CharField(unique=True, db_index=True, max_length=71)),
                ('expires_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=False)),
                ('provenance_source', fields.CharEnumField(description='HUMAN: human\nAGENT: agent\nIMPORT: import\nSYSTEM: system', enum_type=BuilderProvenanceSource, max_length=16)),
                ('actor_user_id', fields.UUIDField(null=True, db_index=True)),
                ('agent_run_id', fields.UUIDField(null=True, db_index=True)),
                ('tool_name', fields.CharField(null=True, max_length=128)),
                ('correlation_id', fields.CharField(null=True, db_index=True, max_length=128)),
                ('applied_site_revision_id', fields.UUIDField(null=True, db_index=True)),
                ('apply_result', fields.JSONField(null=True, encoder=JSON_DUMPS, decoder=loads)),
                ('applied_at', fields.DatetimeField(null=True, db_index=True, auto_now=False, auto_now_add=False)),
            ],
            options={'table': 'builder_change_sets', 'app': 'models', 'indexes': [Index(fields=['project_id', 'site_id', 'environment_id', 'created_at']), Index(fields=['base_site_revision_id', 'status', 'created_at'])], 'pk_attr': 'id', 'table_description': 'Typed Builder proposals with signed-preview and apply lifecycle state.'},
            bases=['BaseModel'],
        ),
    ]
