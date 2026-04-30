from __future__ import annotations

from uuid import uuid4

from src.modules.permissions import (
    PermissionCondition,
    PermissionConditionField,
    PermissionConditionOperator,
    PermissionConditionSet,
)
from src.modules.projects.permissions.schema import PermissionContext, PermissionSubjectKind
from src.modules.projects.permissions.service import PolicyEvaluationService


def test_project_policy_evaluation_allows_project_limited_condition_match() -> None:
    project_id = uuid4()
    decision = PolicyEvaluationService().evaluate(
        context=PermissionContext(
            action="project:content:manage",
            subject_kind=PermissionSubjectKind.PROJECT_MEMBER,
            project_id=project_id,
            permission_codes=["system:content:manage"],
            permission_conditions={
                "system:content:manage": [
                    PermissionConditionSet(
                        conditions=[
                            PermissionCondition(
                                field=PermissionConditionField.PROJECT_ID,
                                operator=PermissionConditionOperator.EQUALS_CURRENT_PROJECT,
                            )
                        ]
                    )
                ]
            },
            resource_attributes={"project_id": str(project_id)},
        )
    )

    assert decision.allowed is True
    assert decision.reason == "PERMISSION_GRANTED"


def test_project_policy_evaluation_rejects_request_parameter_bypass() -> None:
    project_id = uuid4()
    decision = PolicyEvaluationService().evaluate(
        context=PermissionContext(
            action="project:content:manage",
            subject_kind=PermissionSubjectKind.PROJECT_MEMBER,
            project_id=project_id,
            permission_codes=["system:content:manage"],
            permission_conditions={
                "system:content:manage": [
                    PermissionConditionSet(
                        conditions=[
                            PermissionCondition(
                                field=PermissionConditionField.PROJECT_ID,
                                operator=PermissionConditionOperator.EQUALS_CURRENT_PROJECT,
                            )
                        ]
                    )
                ]
            },
            resource_attributes={"project_id": str(uuid4())},
            payload_constraints={"project_id": str(project_id)},
        )
    )

    assert decision.allowed is False
    assert decision.reason == "CONDITIONS_UNMET"


def test_project_policy_evaluation_allows_content_type_and_locale_conditions() -> None:
    decision = PolicyEvaluationService().evaluate(
        context=PermissionContext(
            action="project:content:read",
            subject_kind=PermissionSubjectKind.PROJECT_MEMBER,
            permission_codes=["system:content:read"],
            permission_conditions={
                "system:content:read": [
                    PermissionConditionSet(
                        conditions=[
                            PermissionCondition(
                                field=PermissionConditionField.CONTENT_TYPE,
                                operator=PermissionConditionOperator.EQUALS,
                                value="article",
                            ),
                            PermissionCondition(
                                field=PermissionConditionField.LOCALE,
                                operator=PermissionConditionOperator.IN,
                                value=["en-US", "zh-CN"],
                            ),
                        ]
                    )
                ]
            },
            resource_attributes={"content_type": "article", "locale": "zh-CN"},
        )
    )

    assert decision.allowed is True
    assert decision.matched_condition_count == 2
