from tortoise import fields
from tortoise import migrations
from tortoise.migrations import operations as ops

from apps.api.src.models.content._enums import (
    ContentContinuationPosture,
    ContentContinuationRole,
    ContentContinuationSurface,
    ContentShapeState,
)


class Migration(migrations.Migration):
    dependencies = [("models", "0015_content_bootstrap_shape")]

    initial = False

    operations = [
        ops.AddField(
            model_name="ContentModelDefinitionRecord",
            name="default_role",
            field=fields.CharEnumField(
                ContentContinuationRole,
                max_length=32,
                null=True,
                db_index=True,
            ),
        ),
        ops.AddField(
            model_name="ContentModelDefinitionRecord",
            name="default_posture",
            field=fields.CharEnumField(
                ContentContinuationPosture,
                max_length=32,
                null=True,
                db_index=True,
            ),
        ),
        ops.AddField(
            model_name="ContentModelDefinitionRecord",
            name="default_surface",
            field=fields.CharEnumField(
                ContentContinuationSurface,
                max_length=32,
                null=True,
                db_index=True,
            ),
        ),
        ops.AddField(
            model_name="ContentModelDefinitionRecord",
            name="starter_pack_policy",
            field=fields.JSONField(null=True),
        ),
        ops.AddField(
            model_name="ContentModelDefinitionRecord",
            name="surface_policy",
            field=fields.JSONField(null=True),
        ),
        ops.AddField(
            model_name="ContentItemRecord",
            name="resolved_role",
            field=fields.CharEnumField(
                ContentContinuationRole,
                max_length=32,
                null=True,
                db_index=True,
            ),
        ),
        ops.AddField(
            model_name="ContentItemRecord",
            name="resolved_posture",
            field=fields.CharEnumField(
                ContentContinuationPosture,
                max_length=32,
                null=True,
                db_index=True,
            ),
        ),
        ops.AddField(
            model_name="ContentItemRecord",
            name="resolved_surface",
            field=fields.CharEnumField(
                ContentContinuationSurface,
                max_length=32,
                null=True,
                db_index=True,
            ),
        ),
        ops.AddField(
            model_name="ContentItemRecord",
            name="shape_state",
            field=fields.CharEnumField(
                ContentShapeState,
                max_length=16,
                default=ContentShapeState.UNSHAPED,
                null=True,
                db_index=True,
            ),
        ),
        ops.AddField(
            model_name="ContentItemRecord",
            name="shape_reason_code",
            field=fields.CharField(max_length=64, null=True, db_index=True),
        ),
        ops.AddField(
            model_name="ContentItemRecord",
            name="shape_reason_meta",
            field=fields.JSONField(null=True),
        ),
        ops.RunSQL(
            """
            UPDATE content_items
            SET shape_state = 'unshaped'
            WHERE shape_state IS NULL;
            """,
            reverse_sql=None,
            atomic=True,
        ),
        ops.AlterField(
            model_name="ContentItemRecord",
            name="shape_state",
            field=fields.CharEnumField(
                ContentShapeState,
                max_length=16,
                default=ContentShapeState.UNSHAPED,
                db_index=True,
            ),
        ),
    ]
