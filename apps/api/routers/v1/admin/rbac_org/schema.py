from __future__ import annotations

from pydantic import Field

from apps.api.common.schemas import BaseSchema


class RoleCodeSet(BaseSchema):
    role_codes: list[str] = Field(default_factory=list, description="Role code list.")


class RoleCodeItem(BaseSchema):
    role_code: str = Field(..., min_length=1, max_length=64, description="Role code.")
