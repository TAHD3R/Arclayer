from __future__ import annotations

from typing import Literal

from pydantic import Field

from apps.api.src.common.schemas import BaseSchema
from apps.api.src.modules.system.flags.schema import SystemFlagsOut


class SystemRuntimeCapabilities(BaseSchema):
    deployment_settings_enabled: bool = Field(
        ...,
        description="Whether instance-level deployment settings (e.g. storage/mail) are exposed to the admin UI.",
    )
    public_register_enabled: bool = Field(
        ...,
        description="Whether public account registration is enabled for this deployment.",
    )


class SystemRuntimeOut(BaseSchema):
    deployment_mode: Literal["saas", "self_host"] = Field(
        ...,
        description="Deployment mode of the running backend instance.",
    )
    capabilities: SystemRuntimeCapabilities = Field(
        ...,
        description="Runtime capabilities derived from deployment mode.",
    )
    system_flags: SystemFlagsOut = Field(
        ...,
        description="Non-sensitive system flags used by the frontend for conditional UI rendering.",
    )
