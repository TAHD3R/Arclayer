from __future__ import annotations

from uuid import UUID

from pydantic import Field

from apps.api.common.schemas import BaseOut, BaseSchema


class DepartmentOut(BaseOut):
    code: str | None = Field(default=None, description="Department code.")
    name: str = Field(..., description="Department name.")
    parent_id: UUID | None = Field(default=None, description="Parent department id.")
    sort: int = Field(..., description="Sort order.")
    is_active: bool = Field(..., description="Whether the department is active.")
    description: str | None = Field(default=None, description="Department description.")


class DepartmentCreate(BaseSchema):
    code: str | None = Field(default=None, max_length=64, description="Department code.")
    name: str = Field(..., min_length=1, max_length=128, description="Department name.")
    parent_id: UUID | None = Field(default=None, description="Parent department id.")
    sort: int = Field(default=0, description="Sort order.")
    is_active: bool = Field(default=True, description="Whether the department is active.")
    description: str | None = Field(default=None, description="Department description.")


class DepartmentUpdate(BaseSchema):
    name: str | None = Field(default=None, min_length=1, max_length=128, description="Department name.")
    parent_id: UUID | None = Field(default=None, description="Parent department id.")
    sort: int | None = Field(default=None, description="Sort order.")
    is_active: bool | None = Field(default=None, description="Whether the department is active.")
    description: str | None = Field(default=None, description="Department description.")


class PositionOut(BaseOut):
    code: str = Field(..., description="Position code.")
    name: str = Field(..., description="Position name.")
    sort: int = Field(..., description="Sort order.")
    is_active: bool = Field(..., description="Whether the position is active.")
    description: str | None = Field(default=None, description="Position description.")


class PositionCreate(BaseSchema):
    code: str = Field(..., min_length=1, max_length=64, description="Position code.")
    name: str = Field(..., min_length=1, max_length=128, description="Position name.")
    sort: int = Field(default=0, description="Sort order.")
    is_active: bool = Field(default=True, description="Whether the position is active.")
    description: str | None = Field(default=None, description="Position description.")


class PositionUpdate(BaseSchema):
    name: str | None = Field(default=None, min_length=1, max_length=128, description="Position name.")
    sort: int | None = Field(default=None, description="Sort order.")
    is_active: bool | None = Field(default=None, description="Whether the position is active.")
    description: str | None = Field(default=None, description="Position description.")


class UserDepartmentOut(BaseOut):
    user_id: UUID = Field(..., description="User id.")
    department_id: UUID = Field(..., description="Department id.")
    is_primary: bool = Field(..., description="Whether this department is the user's primary department.")


class UserPositionOut(BaseOut):
    user_id: UUID = Field(..., description="User id.")
    position_id: UUID = Field(..., description="Position id.")
