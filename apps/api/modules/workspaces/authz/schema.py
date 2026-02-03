from __future__ import annotations

from uuid import UUID

from pydantic import Field

from apps.api.common.schemas import BaseSchema


class AuthzSnapshot(BaseSchema):
    """
    Authorization snapshot for current scope context.

    Notes:
    - v1: org-scoped (legacy).
    - v2: workspace-scoped for admin governance.
    - `is_superuser` means the user effectively has all permissions in the current scope.
    """

    user_id: UUID = Field(..., description="User id.")
    role_codes: list[str] = Field(default_factory=list, description="Effective role codes.")
    permission_codes: list[str] = Field(default_factory=list, description="Effective permission codes.")
    is_superuser: bool = Field(default=False, description="Whether user is a superuser.")
