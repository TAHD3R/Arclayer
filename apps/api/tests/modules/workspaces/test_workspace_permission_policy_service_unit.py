from __future__ import annotations

from src.modules.workspaces.permissions import (
    PermissionContext,
    PermissionSubjectKind,
    PolicyEvaluationService,
    get_permission_action_registry,
)


def test_permission_registry_exposes_workspace_and_delivery_actions() -> None:
    registry = get_permission_action_registry()

    assert "system:content:read" in registry
    assert "content:routing:read" in registry
    assert registry["content:routing:write"].permission_codes == ("system:content:manage",)
    assert "release:publish" in registry
    assert registry["release:rollback"].permission_codes == ("system:content:publish",)
    assert "delivery:graphql:read" in registry
    assert registry["delivery:graphql:read"].subject_kinds == ("delivery_api_key",)


def test_policy_evaluation_service_allows_workspace_permission_grants() -> None:
    decision = PolicyEvaluationService().evaluate(
        context=PermissionContext(
            action="system:content:publish",
            subject_kind=PermissionSubjectKind.WORKSPACE_MEMBER,
            permission_codes=["system:content:read", "system:content:publish"],
        )
    )

    assert decision.allowed is True
    assert decision.reason == "PERMISSION_GRANTED"
    assert decision.matched_permission_codes == ["system:content:publish"]


def test_policy_evaluation_service_allows_direct_action_grants() -> None:
    decision = PolicyEvaluationService().evaluate(
        context=PermissionContext(
            action="delivery:graphql:read",
            subject_kind=PermissionSubjectKind.DELIVERY_API_KEY,
            granted_actions=["delivery:read", "delivery:graphql:read"],
        )
    )

    assert decision.allowed is True
    assert decision.reason == "ACTION_GRANTED"
    assert decision.matched_actions == ["delivery:graphql:read"]


def test_policy_evaluation_service_rejects_unregistered_action() -> None:
    decision = PolicyEvaluationService().evaluate(
        context=PermissionContext(
            action="unknown:action",
            subject_kind=PermissionSubjectKind.WORKSPACE_MEMBER,
            permission_codes=["system:content:read"],
        )
    )

    assert decision.allowed is False
    assert decision.reason == "ACTION_UNREGISTERED"
