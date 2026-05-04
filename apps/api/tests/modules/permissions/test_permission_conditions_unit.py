from __future__ import annotations

from uuid import uuid4

import pytest

from src.modules.permissions import (
    PermissionCondition,
    PermissionConditionEvaluationContext,
    PermissionConditionField,
    PermissionConditionOperator,
    PermissionConditionSet,
    build_permission_condition_templates,
    deserialize_condition_sets,
    evaluate_condition_sets,
    serialize_condition_sets,
)


def test_permission_conditions_evaluate_contextual_project_match() -> None:
    project_id = uuid4()
    condition_sets = [
        PermissionConditionSet(
            conditions=[
                PermissionCondition(
                    field=PermissionConditionField.PROJECT_ID,
                    operator=PermissionConditionOperator.EQUALS_CURRENT_PROJECT,
                )
            ]
        )
    ]

    allowed = evaluate_condition_sets(
        condition_sets,
        context=PermissionConditionEvaluationContext(
            project_id=project_id,
            resource_attributes={"project_id": str(project_id)},
        ),
    )

    assert allowed is True


def test_permission_conditions_require_explicit_value_for_equals() -> None:
    with pytest.raises(ValueError, match="equals requires a static value"):
        PermissionCondition(
            field=PermissionConditionField.CONTENT_TYPE,
            operator=PermissionConditionOperator.EQUALS,
        )


def test_permission_condition_sets_round_trip_json_payload() -> None:
    raw = [
        {
            "conditions": [
                {
                    "field": "locale",
                    "operator": "in",
                    "value": ["en-US", "zh-CN"],
                }
            ]
        }
    ]

    condition_sets = deserialize_condition_sets(raw)
    payload = serialize_condition_sets(condition_sets)

    assert payload == raw


def test_permission_condition_templates_cover_current_scopes() -> None:
    templates = {template.key: template for template in build_permission_condition_templates()}

    assert set(templates) == {
        "own_content",
        "current_workspace",
        "current_project",
        "content_type",
        "locale",
        "workflow_stage",
    }
    assert templates["current_project"].operators == [PermissionConditionOperator.EQUALS_CURRENT_PROJECT]
