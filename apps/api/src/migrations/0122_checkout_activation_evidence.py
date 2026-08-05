from tortoise import fields, migrations
from tortoise.fields.base import OnDelete
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0121_simulated_checkout_outcome_commands")]

    initial = False

    operations = [
        ops.AddField(
            model_name="CommerceProviderEventApplication",
            name="checkout_outcome_command",
            field=fields.ForeignKeyField(
                "models.CommerceCheckoutOutcomeCommand",
                source_field="checkout_outcome_command_id",
                null=True,
                db_constraint=True,
                to_field="id",
                related_name="subscription_event_applications",
                on_delete=OnDelete.RESTRICT,
            ),
        ),
        ops.AddField(
            model_name="CommerceProviderEventApplication",
            name="checkout_session",
            field=fields.ForeignKeyField(
                "models.CommerceCheckoutSession",
                source_field="checkout_session_id",
                null=True,
                db_constraint=True,
                to_field="id",
                related_name="subscription_event_applications",
                on_delete=OnDelete.RESTRICT,
            ),
        ),
    ]
