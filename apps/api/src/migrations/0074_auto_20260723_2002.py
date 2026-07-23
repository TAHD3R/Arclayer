from tortoise import migrations
from tortoise.migrations import operations as ops
from tortoise.indexes import Index

class Migration(migrations.Migration):
    dependencies = [('models', '0073_auto_20260723_1941')]

    initial = False

    operations = [
        ops.AddIndex(
            model_name='Workspace',
            index=Index(fields=['updated_at']),
        ),
        ops.AddIndex(
            model_name='WorkspaceCreditAccount',
            index=Index(fields=['balance_credits', 'reserved_credits']),
        ),
        ops.AddIndex(
            model_name='WorkspaceCreditAccount',
            index=Index(fields=['period_spent_credits', 'period_granted_credits']),
        ),
    ]
