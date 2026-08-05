from importlib import import_module

from tortoise.migrations.operations import CreateModel

migration = import_module("src.migrations.0125_commerce_plan_period_grants")


def test_plan_period_grant_migration_contains_only_exact_grant_evidence() -> None:
    assert migration.Migration.dependencies == [("models", "0124_commercial_access_fact_immutability")]
    assert len(migration.Migration.operations) == 1

    operation = migration.Migration.operations[0]
    assert isinstance(operation, CreateModel)
    assert operation.name == "CommercePlanPeriodGrant"
    assert operation.options["table"] == "commerce_plan_period_grants"

    fields = dict(operation.fields)
    assert fields["application"].unique is True
    assert fields["ledger_entry"].unique is True
    assert fields["grant_lot"].unique is True
    assert fields["grant_lot"].null is True
    assert fields["grant_identity"].unique is True
    assert {tuple(index.fields) for index in operation.options["indexes"]} == {
        ("workspace_id", "period_start", "period_end"),
        ("provider", "provider_mode", "provider_account_id", "provider_period_identity"),
    }
