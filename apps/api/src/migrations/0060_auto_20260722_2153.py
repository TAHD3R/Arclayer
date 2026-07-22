from tortoise import migrations
from tortoise.migrations import operations as ops
from src.models.feedback.feedback import FeedbackIntent
from tortoise import fields

class Migration(migrations.Migration):
    dependencies = [('models', '0059_auto_20260722_2022')]

    initial = False

    operations = [
        ops.AddField(
            model_name='FeedbackTicket',
            name='intent',
            field=fields.CharEnumField(null=True, db_index=True, description='PROBLEM: problem\nIDEA: idea\nQUESTION: question\nPRAISE: praise', enum_type=FeedbackIntent, max_length=8),
        ),
    ]
