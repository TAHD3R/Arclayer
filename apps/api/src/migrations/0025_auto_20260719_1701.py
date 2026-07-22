from tortoise import migrations
from tortoise.migrations import operations as ops
from tortoise.fields.base import OnDelete
from tortoise import fields

class Migration(migrations.Migration):
    dependencies = [('models', '0024_auto_20260719_1548')]

    initial = False

    operations = [
        ops.AddField(
            model_name='AgentRunV1Record',
            name='job',
            field=fields.OneToOneField('models.BackgroundJobRecord', source_field='job_id', null=True, db_constraint=True, to_field='id', related_name='agent_run', on_delete=OnDelete.RESTRICT),
        ),
    ]
