from tortoise import migrations
from tortoise.migrations import operations as ops
from orjson import loads
from tortoise.fields.data import JSON_DUMPS
from tortoise import fields

class Migration(migrations.Migration):
    dependencies = [('models', '0050_auto_20260721_1018')]

    initial = False

    operations = [
        ops.AlterField(
            model_name='DesignSystemConceptGenerationRecord',
            name='agent_run_id',
            field=fields.UUIDField(null=True, db_index=True),
        ),
        ops.AddField(
            model_name='DesignSystemConceptGenerationRecord',
            name='agent_assignment_id',
            field=fields.UUIDField(null=True, db_index=True),
        ),
        ops.AddField(
            model_name='DesignSystemConceptGenerationRecord',
            name='agent_id',
            field=fields.UUIDField(null=True, db_index=True),
        ),
        ops.AddField(
            model_name='DesignSystemConceptGenerationRecord',
            name='agent_version_id',
            field=fields.UUIDField(null=True, db_index=True),
        ),
        ops.AddField(
            model_name='DesignSystemConceptGenerationRecord',
            name='builder_context',
            field=fields.JSONField(null=True, encoder=JSON_DUMPS, decoder=loads),
        ),
        ops.AddField(
            model_name='DesignSystemConceptGenerationRecord',
            name='design_system_context',
            field=fields.JSONField(null=True, encoder=JSON_DUMPS, decoder=loads),
        ),
    ]
