from tortoise import migrations
from tortoise.migrations import operations as ops
from src.models.feedback.feedback import FeedbackSource
from tortoise import fields

class Migration(migrations.Migration):
    dependencies = [('models', '0060_auto_20260722_2153')]

    initial = False

    operations = [
        ops.AlterField(
            model_name='FeedbackTicket',
            name='source',
            field=fields.CharEnumField(db_index=True, description='HEADER: header\nAI_SIDEBAR: ai_sidebar\nCONTENT_GUARD: content_guard\nFEEDBACK_CENTER: feedback_center', enum_type=FeedbackSource, max_length=15),
        ),
    ]
