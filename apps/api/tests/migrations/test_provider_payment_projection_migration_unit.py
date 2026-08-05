from importlib import import_module

from tortoise.migrations.operations import CreateModel

migration = import_module("src.migrations.0126_commerce_provider_payment_projections")


def test_provider_payment_projection_migration_contains_exact_event_evidence() -> None:
    assert migration.Migration.dependencies == [("models", "0125_commerce_plan_period_grants")]
    assert len(migration.Migration.operations) == 2

    payment, transaction = migration.Migration.operations
    assert isinstance(payment, CreateModel)
    assert isinstance(transaction, CreateModel)
    assert payment.name == "CommerceProviderPaymentProjection"
    assert transaction.name == "CommerceProviderPaymentTransactionProjection"

    payment_fields = dict(payment.fields)
    assert payment_fields["application"].unique is True
    assert payment_fields["payload_sha256"].max_length == 64
    assert payment_fields["signature_reference"].max_length == 255
    assert payment.options["unique_together"] == (
        ("provider", "provider_mode", "provider_account_id", "provider_event_id"),
    )
    assert {tuple(index.fields) for index in payment.options["indexes"]} == {
        ("workspace_id", "provider_event_occurred_at"),
        ("invoice_id", "provider_event_occurred_at"),
    }

    assert transaction.options["unique_together"] == (("payment_projection_id", "transaction_id"),)
    assert {tuple(index.fields) for index in transaction.options["indexes"]} == {
        ("transaction_id", "provider_event_occurred_at"),
    }
