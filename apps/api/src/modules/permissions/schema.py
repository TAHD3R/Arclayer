from __future__ import annotations

from pydantic import Field

from src.common.schemas import BaseSchema
from src.modules.permissions.conditions import (
    PermissionConditionField,
    PermissionConditionOperator,
)


class PermissionConditionTemplateOut(BaseSchema):
    key: str = Field(..., description="Stable template key.")
    field: PermissionConditionField = Field(..., description="Condition field preselected by this template.")
    operators: list[PermissionConditionOperator] = Field(..., description="Supported operators for this template.")
    value_type: str = Field(..., description="Expected value type for static operators.")
    description: str = Field(..., description="Product-facing template description.")
