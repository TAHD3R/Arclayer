from tortoise import migrations
from tortoise.migrations import operations as ops
from orjson import loads
from src.common.utils.ids import uuid7
from src.models.system.access_restriction import AccessRestrictionEntityType, AccessRestrictionReasonCategory, AccessRestrictionState, AccessRestrictionType
from tortoise.fields.base import OnDelete
from tortoise.fields.data import JSON_DUMPS
from tortoise import fields
from tortoise.indexes import Index

class Migration(migrations.Migration):
    dependencies = [('models', '0063_auto_20260723_0619')]

    initial = False

    operations = [
        ops.CreateModel(
            name='AccessRestrictionRecord',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('entity_type', fields.CharEnumField(db_index=True, description='USER: user\nWORKSPACE: workspace\nPROJECT: project', enum_type=AccessRestrictionEntityType, max_length=16)),
                ('entity_id', fields.UUIDField(db_index=True)),
                ('restriction_type', fields.CharEnumField(db_index=True, description='USER_DISABLED: user_disabled\nWORKSPACE_SUSPENDED: workspace_suspended\nWORKSPACE_ARCHIVED: workspace_archived\nPROJECT_SUSPENDED: project_suspended', enum_type=AccessRestrictionType, max_length=32)),
                ('state', fields.CharEnumField(default=AccessRestrictionState.ACTIVE, db_index=True, description='ACTIVE: active\nLIFTED: lifted', enum_type=AccessRestrictionState, max_length=16)),
                ('reason_category', fields.CharEnumField(description='POLICY_VIOLATION: policy_violation\nSECURITY_RISK: security_risk\nBILLING_ISSUE: billing_issue\nABUSE_PREVENTION: abuse_prevention\nCOMPLIANCE_REVIEW: compliance_review\nOWNER_REQUEST: owner_request\nOTHER: other', enum_type=AccessRestrictionReasonCategory, max_length=32)),
                ('reason_code', fields.CharField(max_length=64)),
                ('operator_note', fields.TextField(unique=False)),
                ('effective_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=False)),
                ('review_at', fields.DatetimeField(null=True, db_index=True, auto_now=False, auto_now_add=False)),
                ('expires_at', fields.DatetimeField(null=True, db_index=True, auto_now=False, auto_now_add=False)),
                ('actor_user_id', fields.UUIDField(null=True, db_index=True)),
                ('lifted_at', fields.DatetimeField(null=True, db_index=True, auto_now=False, auto_now_add=False)),
                ('lifted_by_user_id', fields.UUIDField(null=True, db_index=True)),
                ('lift_note', fields.TextField(null=True, unique=False)),
                ('revision', fields.IntField(default=1)),
                ('audit_event_id', fields.UUIDField(null=True, db_index=True)),
            ],
            options={'table': 'access_restrictions', 'app': 'models', 'unique_together': (('entity_type', 'entity_id', 'restriction_type'),), 'indexes': [Index(fields=['entity_type', 'entity_id', 'state']), Index(fields=['restriction_type', 'state', 'effective_at'])], 'pk_attr': 'id', 'table_description': 'Revisioned authority for user, workspace, and project access restrictions.'},
            bases=['BaseModel'],
        ),
        ops.CreateModel(
            name='AccessRestrictionCommandRecord',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('restriction', fields.ForeignKeyField('models.AccessRestrictionRecord', source_field='restriction_id', db_constraint=True, to_field='id', related_name='commands', on_delete=OnDelete.CASCADE)),
                ('entity_type', fields.CharEnumField(db_index=True, description='USER: user\nWORKSPACE: workspace\nPROJECT: project', enum_type=AccessRestrictionEntityType, max_length=16)),
                ('entity_id', fields.UUIDField(db_index=True)),
                ('restriction_type', fields.CharEnumField(db_index=True, description='USER_DISABLED: user_disabled\nWORKSPACE_SUSPENDED: workspace_suspended\nWORKSPACE_ARCHIVED: workspace_archived\nPROJECT_SUSPENDED: project_suspended', enum_type=AccessRestrictionType, max_length=32)),
                ('idempotency_key', fields.CharField(unique=True, max_length=128)),
                ('request_fingerprint', fields.CharField(max_length=64)),
                ('actor_user_id', fields.UUIDField(null=True, db_index=True)),
                ('resulting_revision', fields.IntField()),
                ('result_snapshot', fields.JSONField(encoder=JSON_DUMPS, decoder=loads)),
            ],
            options={'table': 'access_restriction_commands', 'app': 'models', 'indexes': [Index(fields=['entity_type', 'entity_id', 'created_at'])], 'pk_attr': 'id', 'table_description': 'Immutable idempotent command results for access restriction transitions.'},
            bases=['BaseModel'],
        ),
    ]
