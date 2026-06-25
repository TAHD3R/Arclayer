from __future__ import annotations

from pydantic import Field

from src.common.schemas import BaseSchema
from src.core.extensions.manifest import PackageState, ProcessState


class WorkspaceExtensionProvidesOut(BaseSchema):
    services: list[str] = Field(default_factory=list)
    middlewares: list[str] = Field(default_factory=list)
    providers: list[str] = Field(default_factory=list)
    content_types: list[str] = Field(default_factory=list)


class WorkspaceExtensionListItemOut(BaseSchema):
    name: str
    version: str
    package_state: PackageState
    process_state: ProcessState
    active: bool
    extension_revision: int
    provides: WorkspaceExtensionProvidesOut


class WorkspaceExtensionActivationOut(BaseSchema):
    name: str
    active: bool
    extension_revision: int
