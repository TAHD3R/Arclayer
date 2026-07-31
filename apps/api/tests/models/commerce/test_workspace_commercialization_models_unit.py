from src.models.commerce.billing import (
    CommercePlan,
    CommercePlanRevision,
    FeatureAccessAllocationScope,
    FeatureAccessAssignment,
    FeatureAccessCommandReceipt,
    SubscriptionStatus,
    WorkspaceSubscription,
)


def test_commercialization_models_make_plan_terms_revision_bound() -> None:
    assert "features" not in CommercePlan._meta.fields_map
    assert "plan_revision" in WorkspaceSubscription._meta.fields_map
    assert "plan" not in WorkspaceSubscription._meta.fields_map
    assert "content_hash" in CommercePlanRevision._meta.fields_map


def test_commercialization_models_remove_trial_and_model_active_feature_assignments() -> None:
    assert "trialing" not in {status.value for status in SubscriptionStatus}
    assert {"workspace", "entitlement", "membership_id", "ended_at"}.issubset(FeatureAccessAssignment._meta.fields_map)


def test_feature_access_models_expose_serialized_scope_and_immutable_command_receipts() -> None:
    assert {"workspace", "entitlement", "revision"}.issubset(FeatureAccessAllocationScope._meta.fields_map)
    assert {"scope", "idempotency_key_hash", "fingerprint", "operation", "result_revision", "result_snapshot"}.issubset(
        FeatureAccessCommandReceipt._meta.fields_map
    )
