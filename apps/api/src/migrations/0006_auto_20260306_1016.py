from tortoise import fields, migrations
from tortoise.migrations.constraints import UniqueConstraint
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0005_add_org_role_i18n_fields")]

    initial = False

    operations = [
        ops.AlterField(
            model_name='AssetFolderRecord',
            name='workspace_id',
            field=fields.UUIDField(null=True, db_index=True),
        ),
        ops.AddField(
            model_name='AssetFolderRecord',
            name='organization_id',
            field=fields.UUIDField(null=True, db_index=True),
        ),
        ops.AddField(
            model_name='AssetFolderRecord',
            name='user_id',
            field=fields.UUIDField(null=True, db_index=True),
        ),
        ops.AlterModelOptions(
            name='AssetFolderRecord',
            options={'table': 'asset_folders', 'app': 'models', 'unique_together': (('workspace_id', 'parent_id', 'name'), ('organization_id', 'parent_id', 'name'), ('user_id', 'parent_id', 'name')), 'pk_attr': 'id', 'table_description': 'Asset folder (scoped in v3).'},
        ),
        ops.AddConstraint(
            model_name='AssetFolderRecord',
            constraint=UniqueConstraint(fields=('organization_id', 'parent_id', 'name'), name=None),
        ),
        ops.AddConstraint(
            model_name='AssetFolderRecord',
            constraint=UniqueConstraint(fields=('user_id', 'parent_id', 'name'), name=None),
        ),
        ops.AlterField(
            model_name='AssetRecord',
            name='workspace_id',
            field=fields.UUIDField(null=True, db_index=True),
        ),
        ops.AddField(
            model_name='AssetRecord',
            name='organization_id',
            field=fields.UUIDField(null=True, db_index=True),
        ),
        ops.AddField(
            model_name='AssetRecord',
            name='user_id',
            field=fields.UUIDField(null=True, db_index=True),
        ),
        ops.AlterField(
            model_name='AssetTagRecord',
            name='workspace_id',
            field=fields.UUIDField(null=True, db_index=True),
        ),
        ops.AddField(
            model_name='AssetTagRecord',
            name='organization_id',
            field=fields.UUIDField(null=True, db_index=True),
        ),
        ops.AddField(
            model_name='AssetTagRecord',
            name='user_id',
            field=fields.UUIDField(null=True, db_index=True),
        ),
        ops.AlterModelOptions(
            name='AssetTagRecord',
            options={'table': 'asset_tags', 'app': 'models', 'unique_together': (('workspace_id', 'name'), ('organization_id', 'name'), ('user_id', 'name')), 'pk_attr': 'id', 'table_description': 'Simple asset tag (scoped in v3).'},
        ),
        ops.AddConstraint(
            model_name='AssetTagRecord',
            constraint=UniqueConstraint(fields=('organization_id', 'name'), name=None),
        ),
        ops.AddConstraint(
            model_name='AssetTagRecord',
            constraint=UniqueConstraint(fields=('user_id', 'name'), name=None),
        ),
        ops.AlterField(
            model_name='AssetUsageRecord',
            name='workspace_id',
            field=fields.UUIDField(null=True, db_index=True),
        ),
        ops.AddField(
            model_name='AssetUsageRecord',
            name='organization_id',
            field=fields.UUIDField(null=True, db_index=True),
        ),
        ops.AddField(
            model_name='AssetUsageRecord',
            name='user_id',
            field=fields.UUIDField(null=True, db_index=True),
        ),
        ops.AddConstraint(
            model_name='AssetUsageRecord',
            constraint=UniqueConstraint(fields=('organization_id', 'entity_type', 'entity_id', 'field_key'), name=None),
        ),
        ops.AddConstraint(
            model_name='AssetUsageRecord',
            constraint=UniqueConstraint(fields=('user_id', 'entity_type', 'entity_id', 'field_key'), name=None),
        ),
        ops.AlterField(
            model_name='UploadSessionRecord',
            name='workspace_id',
            field=fields.UUIDField(null=True, db_index=True),
        ),
        ops.AddField(
            model_name='UploadSessionRecord',
            name='organization_id',
            field=fields.UUIDField(null=True, db_index=True),
        ),
        ops.AddField(
            model_name='UploadSessionRecord',
            name='user_id',
            field=fields.UUIDField(null=True, db_index=True),
        ),
    ]
