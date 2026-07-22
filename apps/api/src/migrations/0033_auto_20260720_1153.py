from tortoise import migrations
from tortoise.migrations import operations as ops
from tortoise import fields

class Migration(migrations.Migration):
    dependencies = [('models', '0032_auto_20260720_0911')]

    initial = False

    operations = [
        ops.AddField(
            model_name='KnowledgeSourceVersionStateRecord',
            name='index_job_id',
            field=fields.UUIDField(null=True, db_index=True),
        ),
    ]
