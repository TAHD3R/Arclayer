from importlib import import_module

migration = import_module("src.migrations.0117_workspace_member_credit_command_receipts")


def test_member_credit_receipt_migration_depends_on_credit_foundation() -> None:
    assert migration.Migration.dependencies == [("models", "0116_commerce_credit_sources_member_limits_and_payments")]


def test_member_credit_receipt_migration_creates_constrained_durable_receipts() -> None:
    sql = migration.Migration.operations[0].sql

    assert "CREATE TABLE commerce_workspace_member_credit_command_receipts" in sql
    assert "workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE" in sql
    assert "membership_id UUID NULL" in sql
    assert "membership_id UUID NULL REFERENCES" not in sql
    assert "audit_event_id UUID NOT NULL REFERENCES analytics_audit_events(id) ON DELETE RESTRICT" in sql
    assert "commerce_member_credit_receipt_scope_check" in sql
    assert "commerce_member_credit_receipt_operation_check" in sql
    assert "commerce_member_credit_receipt_revision_check" in sql
    assert "commerce_member_credit_receipt_identity_unique" in sql
    assert "commerce_member_credit_receipt_workspace_idx" in sql
    assert "commerce_member_credit_receipt_membership_idx" in sql
