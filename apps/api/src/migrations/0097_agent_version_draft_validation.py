from tortoise import fields
from tortoise import migrations
from tortoise.migrations import operations as ops

from src.models.agents.catalog import AgentVersionState


class Migration(migrations.Migration):
    dependencies = [("models", "0096_extension_lifecycle_evidence")]

    initial = False

    operations = [
        ops.AlterField(
            model_name="AgentVersionRecord",
            name="state",
            field=fields.CharEnumField(
                AgentVersionState,
                max_length=16,
                db_index=True,
                description="DRAFT: draft\nPUBLISHED: published\nRETIRED: retired",
            ),
        ),
    ]
