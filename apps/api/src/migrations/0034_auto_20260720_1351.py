from tortoise import migrations
from tortoise.migrations import operations as ops

class Migration(migrations.Migration):
    dependencies = [('models', '0033_auto_20260720_1153')]

    initial = False

    operations = [
        ops.RemoveConstraint(
            model_name='KnowledgeSourceVersionRecord',
            name=None,
            fields=['source_id', 'normalized_content_hash'],
        ),
    ]
