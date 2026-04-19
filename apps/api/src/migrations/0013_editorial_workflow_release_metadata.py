from tortoise import migrations
from tortoise.migrations import operations as ops

from src.models.content._enums import ContentWorkflowStage
from tortoise import fields


class Migration(migrations.Migration):
    dependencies = [("models", "0012_auto_20260419_0605")]

    operations = [
        ops.AddField(
            model_name="ContentItemRecord",
            name="workflow_stage",
            field=fields.CharEnumField(
                default=ContentWorkflowStage.DRAFTING,
                db_default=ContentWorkflowStage.DRAFTING,
                description=(
                    "DRAFTING: drafting\n"
                    "IN_REVIEW: in_review\n"
                    "CHANGES_REQUESTED: changes_requested\n"
                    "APPROVED: approved"
                ),
                enum_type=ContentWorkflowStage,
                max_length=24,
            ),
        ),
        ops.AddField(
            model_name="ContentItemRecord",
            name="workflow_assignee_user_id",
            field=fields.UUIDField(null=True),
        ),
        ops.AddField(
            model_name="ContentItemRecord",
            name="workflow_summary",
            field=fields.CharField(max_length=256, null=True),
        ),
        ops.AddField(
            model_name="ContentItemRecord",
            name="workflow_notes",
            field=fields.JSONField(null=True),
        ),
        ops.AddField(
            model_name="ContentReleaseRecord",
            name="lineage_parent_release_id",
            field=fields.UUIDField(null=True),
        ),
        ops.AddField(
            model_name="ContentReleaseRecord",
            name="selection_count",
            field=fields.IntField(default=0, db_default=0),
        ),
    ]
