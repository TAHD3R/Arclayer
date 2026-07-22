from tortoise import migrations
from tortoise.migrations import operations as ops
from orjson import loads
from src.common.utils.ids import uuid7
from src.models.skills._enums import SkillUpdateRisk
from tortoise.fields.base import OnDelete
from tortoise.fields.data import JSON_DUMPS
from tortoise import fields
from tortoise.indexes import Index

class Migration(migrations.Migration):
    dependencies = [('models', '0037_auto_20260720_1820')]

    initial = False

    operations = [
        ops.CreateModel(
            name='SkillUpdatePreviewRecord',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('workspace', fields.ForeignKeyField('models.Workspace', source_field='workspace_id', db_constraint=True, to_field='id', related_name='skill_update_previews', on_delete=OnDelete.CASCADE)),
                ('installation', fields.ForeignKeyField('models.SkillInstallationRecord', source_field='installation_id', db_constraint=True, to_field='id', related_name='update_previews', on_delete=OnDelete.CASCADE)),
                ('expected_installation_revision', fields.IntField()),
                ('current_version_id', fields.UUIDField(db_index=True)),
                ('current_package_checksum', fields.CharField(max_length=71)),
                ('current_validation_finding_hash', fields.CharField(max_length=71)),
                ('candidate_version_id', fields.UUIDField(db_index=True)),
                ('candidate_package_checksum', fields.CharField(max_length=71)),
                ('candidate_validation_finding_hash', fields.CharField(max_length=71)),
                ('current_target', fields.JSONField(encoder=JSON_DUMPS, decoder=loads)),
                ('candidate_target', fields.JSONField(encoder=JSON_DUMPS, decoder=loads)),
                ('risk', fields.CharEnumField(db_index=True, description='NONE: none\nCONTENT: content\nCAPABILITY: capability\nPERMISSION: permission\nDATA_EGRESS: data_egress\nINCOMPATIBLE: incompatible', enum_type=SkillUpdateRisk, max_length=16)),
                ('risk_categories', fields.JSONField(default=list, encoder=JSON_DUMPS, decoder=loads)),
                ('diff', fields.JSONField(encoder=JSON_DUMPS, decoder=loads)),
                ('preview_hash', fields.CharField(db_index=True, max_length=71)),
                ('created_by_user_id', fields.UUIDField(null=True, db_index=True)),
                ('request_idempotency_key', fields.CharField(max_length=128)),
                ('request_fingerprint', fields.CharField(max_length=64)),
                ('acceptance_idempotency_key', fields.CharField(null=True, max_length=128)),
                ('acceptance_fingerprint', fields.CharField(null=True, max_length=64)),
                ('accepted_by_user_id', fields.UUIDField(null=True, db_index=True)),
                ('accepted_at', fields.DatetimeField(null=True, db_index=True, auto_now=False, auto_now_add=False)),
                ('resulting_installation_revision', fields.IntField(null=True)),
                ('resulting_version_id', fields.UUIDField(null=True, db_index=True)),
                ('result_snapshot', fields.JSONField(null=True, encoder=JSON_DUMPS, decoder=loads)),
            ],
            options={'table': 'skill_update_previews', 'app': 'models', 'unique_together': (('workspace_id', 'request_idempotency_key'), ('workspace_id', 'acceptance_idempotency_key')), 'indexes': [Index(fields=['workspace_id', 'installation_id', 'created_at']), Index(fields=['workspace_id', 'candidate_version_id', 'created_at'])], 'pk_attr': 'id', 'table_description': 'Persisted exact-version Skill update reviews and idempotent acceptance outcomes.'},
            bases=['BaseModel'],
        ),
    ]
