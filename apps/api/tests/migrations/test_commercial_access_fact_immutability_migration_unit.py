from importlib import import_module

migration = import_module("src.migrations.0124_commercial_access_fact_immutability")


def test_commercial_access_fact_immutability_migration_adds_update_guard_only() -> None:
    assert migration.Migration.dependencies == [("models", "0123_dunning_policy_ordering_evidence")]
    assert len(migration.Migration.operations) == 1

    operation = migration.Migration.operations[0]
    assert "CREATE FUNCTION commerce_reject_commercial_access_fact_update()" in operation.sql
    assert "BEFORE UPDATE ON commerce_commercial_access_facts" in operation.sql
    assert "commercial access fact evidence is immutable" in operation.sql
    assert "DROP TRIGGER IF EXISTS commerce_commercial_access_facts_immutable" in operation.reverse_sql
