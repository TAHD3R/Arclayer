from importlib import import_module

from tortoise.migrations.operations import AddField

activation_migration = import_module("src.migrations.0122_checkout_activation_evidence")


def test_checkout_activation_evidence_migration_adds_only_application_links() -> None:
    assert activation_migration.Migration.dependencies == [("models", "0121_simulated_checkout_outcome_commands")]
    assert len(activation_migration.Migration.operations) == 2
    operations = activation_migration.Migration.operations
    assert all(isinstance(operation, AddField) for operation in operations)
    assert {operation.model_name for operation in operations} == {"CommerceProviderEventApplication"}
    assert {operation.name for operation in operations} == {
        "checkout_outcome_command",
        "checkout_session",
    }
