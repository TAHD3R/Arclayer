from __future__ import annotations

from collections.abc import Mapping
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

from src.common.schemas import BaseSchema

PermissionConditionScalar = str | int | bool
PermissionConditionValue = PermissionConditionScalar | list[PermissionConditionScalar]


class PermissionConditionField(StrEnum):
    OWNER_USER_ID = "owner_user_id"
    WORKSPACE_ID = "workspace_id"
    PROJECT_ID = "project_id"
    CONTENT_TYPE = "content_type"
    LOCALE = "locale"
    WORKFLOW_STAGE = "workflow_stage"


class PermissionConditionOperator(StrEnum):
    EQUALS = "equals"
    IN = "in"
    EQUALS_CURRENT_USER = "equals_current_user"
    EQUALS_CURRENT_WORKSPACE = "equals_current_workspace"
    EQUALS_CURRENT_PROJECT = "equals_current_project"


_CONTEXTUAL_OPERATORS = {
    PermissionConditionOperator.EQUALS_CURRENT_USER,
    PermissionConditionOperator.EQUALS_CURRENT_WORKSPACE,
    PermissionConditionOperator.EQUALS_CURRENT_PROJECT,
}


class PermissionCondition(BaseSchema):
    field: PermissionConditionField = Field(..., description="Resource attribute checked by this condition.")
    operator: PermissionConditionOperator = Field(..., description="Explicit supported condition operator.")
    value: PermissionConditionValue | None = Field(default=None, description="Static value for equals/in operators.")

    @model_validator(mode="after")
    def _validate_value_shape(self) -> PermissionCondition:
        if self.operator in _CONTEXTUAL_OPERATORS:
            if self.value is not None:
                raise ValueError(f"{self.operator} does not accept a static value")
            return self
        if self.operator == PermissionConditionOperator.EQUALS and self.value is None:
            raise ValueError("equals requires a static value")
        if self.operator == PermissionConditionOperator.IN:
            if not isinstance(self.value, list) or not self.value:
                raise ValueError("in requires a non-empty static value list")
        return self


class PermissionConditionSet(BaseSchema):
    conditions: list[PermissionCondition] = Field(
        default_factory=list,
        description="Conditions joined with AND. Multiple condition sets for one grant are joined with OR.",
    )


class PermissionConditionTemplate(BaseSchema):
    key: str = Field(..., description="Stable template key.")
    field: PermissionConditionField = Field(..., description="Condition field preselected by this template.")
    operators: list[PermissionConditionOperator] = Field(..., description="Supported operators for this template.")
    value_type: str = Field(..., description="Expected value type for static operators.")
    description: str = Field(..., description="Product-facing template description for Admin editors.")


class PermissionConditionEvaluationContext(BaseModel):
    model_config = ConfigDict(frozen=True)
    user_id: object | None = None
    workspace_id: object | None = None
    project_id: object | None = None
    resource_attributes: Mapping[str, object | None] | None = None


def build_permission_condition_templates() -> tuple[PermissionConditionTemplate, ...]:
    return (
        PermissionConditionTemplate(
            key="own_content",
            field=PermissionConditionField.OWNER_USER_ID,
            operators=[PermissionConditionOperator.EQUALS_CURRENT_USER],
            value_type="context_user_id",
            description="Allow access only when the content owner is the current user.",
        ),
        PermissionConditionTemplate(
            key="current_workspace",
            field=PermissionConditionField.WORKSPACE_ID,
            operators=[PermissionConditionOperator.EQUALS_CURRENT_WORKSPACE],
            value_type="context_workspace_id",
            description="Allow access only inside the active workspace.",
        ),
        PermissionConditionTemplate(
            key="current_project",
            field=PermissionConditionField.PROJECT_ID,
            operators=[PermissionConditionOperator.EQUALS_CURRENT_PROJECT],
            value_type="context_project_id",
            description="Allow access only inside the active project.",
        ),
        PermissionConditionTemplate(
            key="content_type",
            field=PermissionConditionField.CONTENT_TYPE,
            operators=[PermissionConditionOperator.EQUALS, PermissionConditionOperator.IN],
            value_type="string_or_string_list",
            description="Limit access to one or more content model keys.",
        ),
        PermissionConditionTemplate(
            key="locale",
            field=PermissionConditionField.LOCALE,
            operators=[PermissionConditionOperator.EQUALS, PermissionConditionOperator.IN],
            value_type="string_or_string_list",
            description="Limit access to one or more content locales.",
        ),
        PermissionConditionTemplate(
            key="workflow_stage",
            field=PermissionConditionField.WORKFLOW_STAGE,
            operators=[PermissionConditionOperator.EQUALS, PermissionConditionOperator.IN],
            value_type="string_or_string_list",
            description="Limit access to one or more editorial workflow stages.",
        ),
    )


def deserialize_condition_sets(raw: object) -> list[PermissionConditionSet]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise ValueError("permission conditions must be a list")
    if not raw:
        return []
    if all(isinstance(item, dict) and "conditions" in item for item in raw):
        return [PermissionConditionSet.model_validate(item) for item in raw]
    return [PermissionConditionSet(conditions=[PermissionCondition.model_validate(item) for item in raw])]


def serialize_condition_sets(condition_sets: list[PermissionConditionSet]) -> list[dict[str, Any]]:
    return [condition_set.model_dump(mode="json", by_alias=True) for condition_set in condition_sets]


def evaluate_condition_sets(
    condition_sets: list[PermissionConditionSet],
    *,
    context: PermissionConditionEvaluationContext,
) -> bool:
    if not condition_sets:
        return True
    return any(_evaluate_condition_set(condition_set, context=context) for condition_set in condition_sets)


def _evaluate_condition_set(
    condition_set: PermissionConditionSet,
    *,
    context: PermissionConditionEvaluationContext,
) -> bool:
    return all(_evaluate_condition(condition, context=context) for condition in condition_set.conditions)


def _evaluate_condition(
    condition: PermissionCondition,
    *,
    context: PermissionConditionEvaluationContext,
) -> bool:
    attributes = context.resource_attributes or {}
    actual = _normalize_scalar(attributes.get(str(condition.field)))
    if actual is None:
        return False
    if condition.operator == PermissionConditionOperator.EQUALS:
        return actual == _normalize_scalar(condition.value)
    if condition.operator == PermissionConditionOperator.IN:
        return actual in {_normalize_scalar(value) for value in _as_list(condition.value)}
    expected = _contextual_value(condition.operator, context=context)
    return expected is not None and actual == expected


def _contextual_value(
    operator: PermissionConditionOperator,
    *,
    context: PermissionConditionEvaluationContext,
) -> str | None:
    if operator == PermissionConditionOperator.EQUALS_CURRENT_USER:
        return _normalize_scalar(context.user_id)
    if operator == PermissionConditionOperator.EQUALS_CURRENT_WORKSPACE:
        return _normalize_scalar(context.workspace_id)
    if operator == PermissionConditionOperator.EQUALS_CURRENT_PROJECT:
        return _normalize_scalar(context.project_id)
    return None


def _normalize_scalar(value: object | None) -> str | None:
    if value is None:
        return None
    return str(value)


def _as_list(value: PermissionConditionValue | None) -> list[PermissionConditionScalar]:
    if isinstance(value, list):
        return value
    if value is None:
        return []
    return [value]
