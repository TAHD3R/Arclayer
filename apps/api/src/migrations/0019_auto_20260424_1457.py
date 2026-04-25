from tortoise import migrations
from tortoise.migrations import operations as ops
from src.models.system.rbac import PermissionScope
from tortoise import fields
from tortoise.migrations.constraints import UniqueConstraint
from tortoise.migrations.operations import TortoiseOperation


class StateOnly(TortoiseOperation):
    def __init__(self, operation: TortoiseOperation) -> None:
        self.operation = operation

    def describe(self) -> str:
        return f"State only: {self.operation.describe()}"

    def state_forward(self, app_label: str, state) -> None:  # type: ignore[override]
        self.operation.state_forward(app_label, state)


class Migration(migrations.Migration):
    dependencies = [('models', '0018_content_model_builder_kind')]

    initial = False

    operations = [
        StateOnly(
            ops.AddField(
                model_name='AssetFolderRecord',
                name='project_id',
                field=fields.UUIDField(null=True, db_index=True),
            ),
        ),
        StateOnly(
            ops.AddConstraint(
                model_name='AssetFolderRecord',
                constraint=UniqueConstraint(fields=('project_id', 'parent_id', 'name'), name=None),
            ),
        ),
        StateOnly(
            ops.AddField(
                model_name='AssetRecord',
                name='project_id',
                field=fields.UUIDField(null=True, db_index=True),
            ),
        ),
        StateOnly(
            ops.AddField(
                model_name='AssetTagRecord',
                name='project_id',
                field=fields.UUIDField(null=True, db_index=True),
            ),
        ),
        StateOnly(
            ops.AddConstraint(
                model_name='AssetTagRecord',
                constraint=UniqueConstraint(fields=('project_id', 'name'), name=None),
            ),
        ),
        StateOnly(
            ops.AddField(
                model_name='AssetUsageRecord',
                name='project_id',
                field=fields.UUIDField(null=True, db_index=True),
            ),
        ),
        StateOnly(
            ops.AddConstraint(
                model_name='AssetUsageRecord',
                constraint=UniqueConstraint(fields=('project_id', 'entity_type', 'entity_id', 'field_key'), name=None),
            ),
        ),
        StateOnly(
            ops.AddField(
                model_name='ContentModelDefinitionRecord',
                name='model_kind',
                field=fields.CharField(default='collection_type', db_index=True, max_length=32),
            ),
        ),
        StateOnly(
            ops.RenameField(
                model_name='Permission',
                old_name='plugin_id',
                new_name='owner_key',
            ),
        ),
        StateOnly(
            ops.AlterField(
                model_name='Permission',
                name='owner_key',
                field=fields.CharField(source_field='plugin_id', null=True, db_index=True, max_length=128),
            ),
        ),
        StateOnly(
            ops.AlterField(
                model_name='Permission',
                name='scope',
                field=fields.CharEnumField(default=PermissionScope.WORKSPACE, db_index=True, description='ORG: org\nWORKSPACE: workspace\nPROJECT: project', enum_type=PermissionScope, max_length=9),
            ),
        ),
        StateOnly(
            ops.AddField(
                model_name='UploadSessionRecord',
                name='project_id',
                field=fields.UUIDField(null=True, db_index=True),
            ),
        ),
    ]
