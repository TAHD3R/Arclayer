from tortoise import migrations
from tortoise.migrations import operations as ops
from tortoise.fields.base import OnDelete
from tortoise import fields

class Migration(migrations.Migration):
    dependencies = [('models', '0021_auto_20260719_1442')]

    initial = False

    operations = [
        ops.AddField(
            model_name='AIBudgetReservation',
            name='agent_run',
            field=fields.ForeignKeyField('models.AgentRunV1Record', source_field='agent_run_id', null=True, db_index=True, db_constraint=True, to_field='id', related_name='budget_reservations', on_delete=OnDelete.CASCADE),
        ),
    ]
