from tortoise import fields
from tortoise import migrations
from tortoise.fields.base import OnDelete
from tortoise.migrations import operations as ops

from src.models.content._enums import ContentBootstrapPresetState


class Migration(migrations.Migration):
    dependencies = [("models", "0014_drop_legacy_content_models")]

    initial = False

    operations = [
        ops.AlterField(
            model_name="ContentItemRecord",
            name="model_definition",
            field=fields.ForeignKeyField(
                "models.ContentModelDefinitionRecord",
                source_field="model_definition_id",
                db_constraint=True,
                to_field="id",
                related_name="items",
                on_delete=OnDelete.CASCADE,
                null=True,
            ),
        ),
        ops.AddField(
            model_name="ContentItemRecord",
            name="bootstrap_preset_key",
            field=fields.CharField(max_length=64, null=True, db_index=True),
        ),
        ops.AddField(
            model_name="ContentItemRecord",
            name="bootstrap_preset_state",
            field=fields.CharEnumField(
                ContentBootstrapPresetState,
                max_length=16,
                default=ContentBootstrapPresetState.NONE,
                db_index=True,
            ),
        ),
        ops.AddField(
            model_name="ContentItemRecord",
            name="capability_pack_ids",
            field=fields.JSONField(default=list),
        ),
        ops.RunSQL(
            """
            UPDATE content_items AS items
            SET capability_pack_ids = COALESCE(models.capabilities, '[]'::jsonb)
            FROM content_model_definitions AS models
            WHERE items.model_definition_id = models.id
              AND (
                items.capability_pack_ids IS NULL
                OR items.capability_pack_ids = '[]'::jsonb
              );
            """,
            reverse_sql=None,
            atomic=True,
        ),
    ]
