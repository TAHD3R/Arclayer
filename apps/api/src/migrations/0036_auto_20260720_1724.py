from tortoise import migrations
from tortoise.migrations import operations as ops
from src.common.utils.ids import uuid7
from src.models.skills._enums import SkillGitHubImportOperation, SkillGitHubImportStatus
from tortoise.fields.base import OnDelete
from tortoise import fields
from tortoise.indexes import Index

class Migration(migrations.Migration):
    dependencies = [('models', '0035_auto_20260720_1446')]

    initial = False

    operations = [
        ops.CreateModel(
            name='SkillGitHubImportRecord',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('workspace', fields.ForeignKeyField('models.Workspace', source_field='workspace_id', db_constraint=True, to_field='id', related_name='skill_github_imports', on_delete=OnDelete.CASCADE)),
                ('package_id', fields.UUIDField(null=True, db_index=True)),
                ('version_id', fields.UUIDField(null=True, db_index=True)),
                ('operation', fields.CharEnumField(db_index=True, description='INITIAL: initial\nREFRESH: refresh', enum_type=SkillGitHubImportOperation, max_length=16)),
                ('status', fields.CharEnumField(default=SkillGitHubImportStatus.QUEUED, db_index=True, description='QUEUED: queued\nFETCHING: fetching\nPERSISTING: persisting\nSUCCEEDED: succeeded\nFAILED: failed\nCANCELLED: cancelled', enum_type=SkillGitHubImportStatus, max_length=16)),
                ('repository_url', fields.CharField(max_length=2048)),
                ('requested_ref', fields.CharField(max_length=256)),
                ('subpath', fields.CharField(max_length=512)),
                ('request_revision', fields.CharField(max_length=71)),
                ('resolved_commit', fields.CharField(null=True, max_length=64)),
                ('resolved_tree', fields.CharField(null=True, max_length=64)),
                ('job_id', fields.UUIDField(null=True, db_index=True)),
                ('safe_error_code', fields.CharField(null=True, max_length=128)),
                ('safe_error_message', fields.CharField(null=True, max_length=1000)),
                ('actor_user_id', fields.UUIDField(null=True, db_index=True)),
                ('request_idempotency_key', fields.CharField(max_length=128)),
                ('request_fingerprint', fields.CharField(max_length=64)),
            ],
            options={'table': 'skill_github_imports', 'app': 'models', 'unique_together': (('workspace_id', 'request_idempotency_key'),), 'indexes': [Index(fields=['workspace_id', 'status', 'created_at']), Index(fields=['workspace_id', 'package_id', 'created_at'])], 'pk_attr': 'id', 'table_description': 'Durable workspace GitHub Skill import and refresh state.'},
            bases=['BaseModel'],
        ),
    ]
