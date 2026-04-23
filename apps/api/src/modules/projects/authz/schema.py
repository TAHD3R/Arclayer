from __future__ import annotations

from typing import Literal

from pydantic import Field

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID


class ProjectAuthzSnapshot(BaseSchema):
    project_id: PublicUUID = Field(..., description="Project id.")
    user_id: PublicUUID = Field(..., description="Current user id.")
    scope: Literal["project"] = Field(default="project", description="Authorization scope.")
    role_codes: list[str] = Field(default_factory=list, description="Effective role codes.")
    permission_codes: list[str] = Field(default_factory=list, description="Effective permission codes.")
    is_superuser: bool = Field(default=False, description="Whether user is a superuser for this project scope.")


class ProjectPermissionActionOut(BaseSchema):
    code: str = Field(..., description="Canonical project action code.")
    description: str | None = Field(default=None, description="Action description.")
    subject_kinds: list[str] = Field(default_factory=list, description="Supported subject kinds.")
    permission_codes: list[str] = Field(default_factory=list, description="Backing permission codes.")
