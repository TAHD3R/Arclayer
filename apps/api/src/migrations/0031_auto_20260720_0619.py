from tortoise import migrations
from tortoise.migrations import operations as ops

class Migration(migrations.Migration):
    dependencies = [('models', '0030_auto_20260720_0619')]

    initial = False

    operations = [
        ops.DeleteModel(name='AgentConversationRecord'),
    ]
