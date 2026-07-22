from tortoise import migrations
from tortoise.migrations import operations as ops

class Migration(migrations.Migration):
    dependencies = [('models', '0053_auto_20260722_0650')]

    initial = False

    operations = [
        ops.RenameField(
            model_name='BuilderGenerationRecord',
            old_name='wireframe_context',
            new_name='composition_context',
        ),
        ops.RenameField(
            model_name='BuilderGenerationRecord',
            old_name='selected_page_ids',
            new_name='targets',
        ),
    ]
