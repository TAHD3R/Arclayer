from tortoise import migrations
from tortoise.migrations import operations as ops
from src.models.content._enums import ContentWorkflowStage
from tortoise import fields

class Migration(migrations.Migration):
    dependencies = [('models', '0013_editorial_workflow_release_metadata')]

    initial = False

    operations = [
        ops.AlterField(
            model_name='ContentItemRecord',
            name='workflow_assignee_user_id',
            field=fields.UUIDField(null=True, db_index=True),
        ),
        ops.AlterField(
            model_name='ContentItemRecord',
            name='workflow_stage',
            field=fields.CharEnumField(default=ContentWorkflowStage.DRAFTING, db_index=True, description='DRAFTING: drafting\nIN_REVIEW: in_review\nCHANGES_REQUESTED: changes_requested\nAPPROVED: approved', enum_type=ContentWorkflowStage, max_length=24),
        ),
        ops.AlterField(
            model_name='ContentReleaseRecord',
            name='lineage_parent_release_id',
            field=fields.UUIDField(null=True, db_index=True),
        ),
        ops.AlterField(
            model_name='ContentReleaseRecord',
            name='selection_count',
            field=fields.IntField(default=0),
        ),
    ]
