from importlib import import_module

from tortoise.migrations.operations import CreateModel

from src.core.database.migration_operations import ReplaceAppState

state_migration = import_module("src.migrations.0120_migration_state_reconciliation")
command_migration = import_module("src.migrations.0121_simulated_checkout_outcome_commands")


def test_state_reconciliation_is_database_noop_and_excludes_new_outcome_command() -> None:
    assert state_migration.Migration.dependencies == [("models", "0119_commerce_checkout_session_evidence")]
    assert len(state_migration.Migration.operations) == 1
    operation = state_migration.Migration.operations[0]
    assert isinstance(operation, ReplaceAppState)
    assert len(operation.operations) == 247
    assert all(isinstance(item, CreateModel) for item in operation.operations)
    assert all(item.name != "CommerceCheckoutOutcomeCommand" for item in operation.operations)


def test_outcome_command_migration_contains_only_the_new_command_model() -> None:
    assert command_migration.Migration.dependencies == [("models", "0120_migration_state_reconciliation")]
    assert len(command_migration.Migration.operations) == 1
    operation = command_migration.Migration.operations[0]
    assert isinstance(operation, CreateModel)
    assert operation.name == "CommerceCheckoutOutcomeCommand"
    assert operation.options["table"] == "commerce_checkout_outcome_commands"
