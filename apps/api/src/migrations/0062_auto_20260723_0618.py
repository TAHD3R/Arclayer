from tortoise import migrations
from tortoise.migrations import operations as ops
from tortoise import fields

class Migration(migrations.Migration):
    dependencies = [('models', '0061_auto_20260722_2202')]

    initial = False

    operations = [
        ops.AlterField(
            model_name='HTTPRequestRecord',
            name='trace_id',
            field=fields.CharField(null=True, db_index=True, max_length=64),
        ),
        ops.AddField(
            model_name='HTTPRequestRecord',
            name='actor_avatar_url',
            field=fields.CharField(null=True, max_length=512),
        ),
        ops.AddField(
            model_name='HTTPRequestRecord',
            name='actor_display_name',
            field=fields.CharField(null=True, max_length=64),
        ),
        ops.AddField(
            model_name='HTTPRequestRecord',
            name='actor_username',
            field=fields.CharField(null=True, max_length=64),
        ),
        ops.AddField(
            model_name='HTTPRequestRecord',
            name='client_network',
            field=fields.CharField(null=True, max_length=80),
        ),
        ops.AddField(
            model_name='HTTPRequestRecord',
            name='device_family',
            field=fields.CharField(null=True, max_length=64),
        ),
        ops.AddField(
            model_name='HTTPRequestRecord',
            name='environment',
            field=fields.CharField(null=True, db_index=True, max_length=32),
        ),
        ops.AddField(
            model_name='HTTPRequestRecord',
            name='error_class',
            field=fields.CharField(null=True, max_length=128),
        ),
        ops.AddField(
            model_name='HTTPRequestRecord',
            name='error_code',
            field=fields.CharField(null=True, db_index=True, max_length=128),
        ),
        ops.AddField(
            model_name='HTTPRequestRecord',
            name='error_message',
            field=fields.CharField(null=True, max_length=512),
        ),
        ops.AddField(
            model_name='HTTPRequestRecord',
            name='ingestion_source',
            field=fields.CharField(null=True, max_length=64),
        ),
        ops.AddField(
            model_name='HTTPRequestRecord',
            name='instance_id',
            field=fields.CharField(null=True, max_length=128),
        ),
        ops.AddField(
            model_name='HTTPRequestRecord',
            name='normalized_path',
            field=fields.CharField(null=True, max_length=512),
        ),
        ops.AddField(
            model_name='HTTPRequestRecord',
            name='project_name',
            field=fields.CharField(null=True, max_length=128),
        ),
        ops.AddField(
            model_name='HTTPRequestRecord',
            name='protocol',
            field=fields.CharField(null=True, max_length=16),
        ),
        ops.AddField(
            model_name='HTTPRequestRecord',
            name='region',
            field=fields.CharField(null=True, max_length=64),
        ),
        ops.AddField(
            model_name='HTTPRequestRecord',
            name='release_version',
            field=fields.CharField(null=True, db_index=True, max_length=128),
        ),
        ops.AddField(
            model_name='HTTPRequestRecord',
            name='request_bytes',
            field=fields.BigIntField(null=True),
        ),
        ops.AddField(
            model_name='HTTPRequestRecord',
            name='request_id',
            field=fields.CharField(null=True, db_index=True, max_length=128),
        ),
        ops.AddField(
            model_name='HTTPRequestRecord',
            name='response_bytes',
            field=fields.BigIntField(null=True),
        ),
        ops.AddField(
            model_name='HTTPRequestRecord',
            name='schema_version',
            field=fields.SmallIntField(null=True, default=2),
        ),
        ops.AddField(
            model_name='HTTPRequestRecord',
            name='service_name',
            field=fields.CharField(null=True, max_length=128),
        ),
        ops.AddField(
            model_name='HTTPRequestRecord',
            name='upstream_name',
            field=fields.CharField(null=True, max_length=128),
        ),
        ops.AddField(
            model_name='HTTPRequestRecord',
            name='user_agent_family',
            field=fields.CharField(null=True, max_length=64),
        ),
        ops.AddField(
            model_name='HTTPRequestRecord',
            name='workspace_name',
            field=fields.CharField(null=True, max_length=128),
        ),
    ]
