from __future__ import annotations

from uuid import uuid4

from src.modules.permissions import (
    PermissionCondition,
    PermissionConditionField,
    PermissionConditionOperator,
    PermissionConditionSet,
)
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


def test_policy_evaluation_service_rejects_subject_kind_mismatch() -> None:
    decision = PolicyEvaluationService().evaluate(
        context=PermissionContext(
            action="delivery:graphql:read",
            subject_kind=PermissionSubjectKind.WORKSPACE_MEMBER,
            granted_actions=["delivery:graphql:read"],
        )
    )

    assert decision.allowed is False
    assert decision.reason == "SUBJECT_KIND_FORBIDDEN"


def test_policy_evaluation_service_allows_owner_condition_match() -> None:
    workspace_id = uuid4()
    user_id = uuid4()
    decision = PolicyEvaluationService().evaluate(
        context=PermissionContext(
            action="content:items:write",
            subject_kind=PermissionSubjectKind.WORKSPACE_MEMBER,
            workspace_id=workspace_id,
            user_id=user_id,
            permission_codes=["system:content:manage"],
            permission_conditions={
                "system:content:manage": [
                    PermissionConditionSet(
                        conditions=[
                            PermissionCondition(
                                field=PermissionConditionField.OWNER_USER_ID,
                                operator=PermissionConditionOperator.EQUALS_CURRENT_USER,
                            )
                        ]
                    )
                ]
            },
            resource_attributes={
                "owner_user_id": str(user_id),
                "workspace_id": str(workspace_id),
                "content_type": "article",
            },
        )
    )

    assert decision.allowed is True
    assert decision.reason == "PERMISSION_GRANTED"
    assert decision.matched_permission_codes == ["system:content:manage"]
    assert decision.matched_condition_count == 1


def test_policy_evaluation_service_rejects_owner_condition_mismatch() -> None:
    user_id = uuid4()
    decision = PolicyEvaluationService().evaluate(
        context=PermissionContext(
            action="content:items:write",
            subject_kind=PermissionSubjectKind.WORKSPACE_MEMBER,
            user_id=user_id,
            permission_codes=["system:content:manage"],
            permission_conditions={
                "system:content:manage": [
                    PermissionConditionSet(
                        conditions=[
                            PermissionCondition(
                                field=PermissionConditionField.OWNER_USER_ID,
                                operator=PermissionConditionOperator.EQUALS_CURRENT_USER,
                            )
                        ]
                    )
                ]
            },
            resource_attributes={"owner_user_id": str(uuid4())},
            payload_constraints={"owner_user_id": str(user_id)},
        )
    )

    assert decision.allowed is False
    assert decision.reason == "CONDITIONS_UNMET"


def test_policy_evaluation_service_allows_workflow_stage_condition_match() -> None:
    decision = PolicyEvaluationService().evaluate(
        context=PermissionContext(
            action="content:items:write",
            subject_kind=PermissionSubjectKind.WORKSPACE_MEMBER,
            permission_codes=["system:content:manage"],
            permission_conditions={
                "system:content:manage": [
                    PermissionConditionSet(
                        conditions=[
                            PermissionCondition(
                                field=PermissionConditionField.WORKFLOW_STAGE,
                                operator=PermissionConditionOperator.IN,
                                value=["drafting", "changes_requested"],
                            )
                        ]
                    )
                ]
            },
            resource_attributes={"workflow_stage": "drafting"},
        )
    )

    assert decision.allowed is True
    assert decision.reason == "PERMISSION_GRANTED"


def test_permission_condition_rejects_unsupported_operator_value_shape() -> None:
    try:
        PermissionCondition(
            field=PermissionConditionField.LOCALE,
            operator=PermissionConditionOperator.IN,
            value="en-US",
        )
    except ValueError as exc:
        assert "in requires a non-empty static value list" in str(exc)
        return

    raise AssertionError("unsupported condition value shape was accepted")
