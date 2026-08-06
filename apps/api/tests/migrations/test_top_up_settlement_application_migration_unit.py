from importlib import import_module

from tortoise.migrations.operations import CreateModel

migration = import_module("src.migrations.0128_top_up_settlement_applications")


def test_top_up_settlement_application_migration_contains_exact_once_evidence() -> None:
    assert migration.Migration.dependencies == [("models", "0127_top_up_checkout_snapshot_evidence")]
    assert len(migration.Migration.operations) == 1

    application = migration.Migration.operations[0]
    assert isinstance(application, CreateModel)
    assert application.name == "CommerceTopUpSettlementApplication"

    fields = dict(application.fields)
    assert fields["workspace"].null is False
    assert fields["checkout_session"].null is False
    for name in (
        "granted_checkout_session",
        "outcome_command",
        "transaction",
        "invoice",
        "ledger_entry",
        "grant_lot",
    ):
        assert fields[name].null is True
        assert fields[name].unique is True

    assert fields["external_invoice_id"].null is True
    assert fields["external_transaction_id"].null is False
    assert fields["credit_amount"].null is False
    assert application.options["unique_together"] == (
        ("provider", "provider_mode", "provider_account_id", "provider_event_id"),
    )
    assert {tuple(index.fields) for index in application.options["indexes"]} == {
        ("workspace_id", "provider_event_occurred_at"),
        ("checkout_session_id", "provider_event_occurred_at"),
    }
