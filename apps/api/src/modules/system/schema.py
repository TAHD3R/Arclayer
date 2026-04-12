from __future__ import annotations

from pydantic import Field

from src.common.schemas import BaseSchema


class SystemRuntimeCapabilities(BaseSchema):
    deployment_settings_enabled: bool = Field(
        ...,
        description="Whether instance-level deployment settings (e.g. storage/mail) are exposed to the admin UI.",
    )
    public_register_enabled: bool = Field(
        ...,
        description="Whether public account registration is enabled for this runtime.",
    )


class SystemRuntimeOut(BaseSchema):
    capabilities: SystemRuntimeCapabilities = Field(
        ...,
        description="Public runtime capabilities derived from concrete backend configuration.",
    )
