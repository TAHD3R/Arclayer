from importlib import import_module

migration = import_module("src.migrations.0118_ai_thread_pinning")


def test_ai_thread_pinning_migration_follows_current_head() -> None:
    assert migration.Migration.dependencies == [("models", "0117_workspace_member_credit_command_receipts")]


def test_ai_thread_pinning_migration_adds_durable_state_and_sorting_index() -> None:
    sql = migration.Migration.operations[0].sql

    assert "ADD COLUMN is_pinned BOOLEAN NOT NULL DEFAULT FALSE" in sql
    assert "ai_threads_owner_pinned_updated_idx" in sql
    assert "workspace_id, owner_user_id, is_pinned, updated_at, id" in sql
