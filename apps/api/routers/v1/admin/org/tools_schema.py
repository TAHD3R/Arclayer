from __future__ import annotations

from uuid import UUID

from pydantic import Field

from apps.api.common.schemas import BaseSchema


class OrgValidateReport(BaseSchema):
    departments_total: int = Field(..., ge=0, description="Total departments (excluding deleted).")
    cycles: list[list[UUID]] = Field(default_factory=list, description="Detected cycles as id chains.")
    orphans: list[UUID] = Field(default_factory=list, description="Departments with missing parent.")
    missing_directory_fields: list[UUID] = Field(default_factory=list, description="Departments missing path/depth.")
    users_without_primary_department: list[UUID] = Field(
        default_factory=list, description="Users with no primary dept."
    )
    users_with_multiple_primary_departments: list[UUID] = Field(
        default_factory=list,
        description="Users with multiple primary dept.",
    )


class OrgRepairResult(BaseSchema):
    repaired_departments: int = Field(..., ge=0, description="Count of departments updated.")
    repaired_users: int = Field(..., ge=0, description="Count of users affected.")


class DepartmentMoveRequest(BaseSchema):
    new_parent_id: UUID | None = Field(default=None, description="New parent department id (null for root).")


class DepartmentMergeRequest(BaseSchema):
    target_department_id: UUID = Field(..., description="Target department id.")
    move_children_to_target: bool = Field(default=True, description="Whether to move children under target.")
    migrate_users: bool = Field(default=True, description="Whether to migrate user bindings to target.")
    migrate_roles: bool = Field(default=True, description="Whether to migrate department role bindings (if available).")


class DepartmentReorderRequest(BaseSchema):
    parent_id: UUID | None = Field(default=None, description="Parent department id (null for root-level ordering).")
    ordered_ids: list[UUID] = Field(..., min_length=1, description="Department ids in desired order.")
