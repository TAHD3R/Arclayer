from src.models.commerce.credit_allocation import (
    MemberCreditCommandOperation,
    MemberCreditCommandScopeKind,
    WorkspaceMemberCreditCommandReceipt,
)


def test_member_credit_command_receipt_exposes_durable_scope_and_audit_contract() -> None:
    assert {scope.value for scope in MemberCreditCommandScopeKind} == {"default", "override"}
    assert {operation.value for operation in MemberCreditCommandOperation} == {
        "set_default",
        "set_override",
        "clear_override",
    }
    assert WorkspaceMemberCreditCommandReceipt._meta.db_table == ("commerce_workspace_member_credit_command_receipts")
    assert {
        "workspace",
        "membership_id",
        "scope_kind",
        "idempotency_key_hash",
        "request_fingerprint",
        "operation",
        "result_revision",
        "result_snapshot",
        "audit_event",
    }.issubset(WorkspaceMemberCreditCommandReceipt._meta.fields_map)
    assert WorkspaceMemberCreditCommandReceipt._meta.unique_together == (("workspace_id", "idempotency_key_hash"),)
