from tortoise import migrations
from tortoise.migrations import operations as ops
from orjson import loads
from tortoise.fields.data import JSON_DUMPS
from tortoise import fields

class Migration(migrations.Migration):
    dependencies = [('models', '0051_auto_20260721_1723')]

    initial = False

    operations = [
        ops.AddField(
            model_name='BuilderChangeSetRecord',
            name='agent_assignment_id',
            field=fields.UUIDField(null=True, db_index=True),
        ),
        ops.AddField(
            model_name='BuilderChangeSetRecord',
            name='agent_id',
            field=fields.UUIDField(null=True, db_index=True),
        ),
        ops.AddField(
            model_name='BuilderChangeSetRecord',
            name='agent_version_id',
            field=fields.UUIDField(null=True, db_index=True),
        ),
        ops.AlterField(
            model_name='BuilderGenerationRecord',
            name='agent_run_id',
            field=fields.UUIDField(null=True, db_index=True),
        ),
        ops.AddField(
            model_name='BuilderGenerationRecord',
            name='agent_assignment_id',
            field=fields.UUIDField(null=True, db_index=True),
        ),
        ops.AddField(
            model_name='BuilderGenerationRecord',
            name='agent_id',
            field=fields.UUIDField(null=True, db_index=True),
        ),
        ops.AddField(
            model_name='BuilderGenerationRecord',
            name='agent_version_id',
            field=fields.UUIDField(null=True, db_index=True),
        ),
        ops.AddField(
            model_name='BuilderGenerationRecord',
            name='builder_context',
            field=fields.JSONField(null=True, encoder=JSON_DUMPS, decoder=loads),
        ),
        ops.AddField(
            model_name='BuilderGenerationRecord',
            name='wireframe_context',
            field=fields.JSONField(null=True, encoder=JSON_DUMPS, decoder=loads),
        ),
        ops.AddField(
            model_name='ContentStructureRevisionRecord',
            name='agent_assignment_id',
            field=fields.UUIDField(null=True, db_index=True),
        ),
        ops.AddField(
            model_name='ContentStructureRevisionRecord',
            name='agent_id',
            field=fields.UUIDField(null=True, db_index=True),
        ),
        ops.AddField(
            model_name='ContentStructureRevisionRecord',
            name='agent_version_id',
            field=fields.UUIDField(null=True, db_index=True),
        ),
        ops.AddField(
            model_name='SiteRevisionManifestRecord',
            name='agent_assignment_id',
            field=fields.UUIDField(null=True, db_index=True),
        ),
        ops.AddField(
            model_name='SiteRevisionManifestRecord',
            name='agent_id',
            field=fields.UUIDField(null=True, db_index=True),
        ),
        ops.AddField(
            model_name='SiteRevisionManifestRecord',
            name='agent_version_id',
            field=fields.UUIDField(null=True, db_index=True),
        ),
    ]
