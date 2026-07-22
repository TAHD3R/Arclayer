from tortoise import migrations
from tortoise.migrations import operations as ops
from tortoise.migrations.constraints import UniqueConstraint

class Migration(migrations.Migration):
    dependencies = [('models', '0028_auto_20260719_1929')]

    initial = False

    operations = [
        ops.AddConstraint(
            model_name='AgentThreadV1Record',
            constraint=UniqueConstraint(fields=('workspace_id', 'owner_user_id', 'creation_idempotency_key'), name=None),
        ),
    ]
