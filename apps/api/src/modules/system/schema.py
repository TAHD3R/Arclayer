from __future__ import annotations

from pydantic import Field

from src.common.schemas import BaseSchema
from src.modules.auth.schema import RegisterRequest


class SystemRuntimeCapabilities(BaseSchema):
    deployment_settings_enabled: bool = Field(
        ...,
        description="Whether instance-level deployment settings (e.g. storage/mail) are exposed to the admin UI.",
    )
    public_register_enabled: bool = Field(
        ...,
        description="Whether public account registration is enabled for this runtime.",
    )


class SystemInstanceSetupOut(BaseSchema):
    status: str = Field(..., description="Instance setup status: uninitialized, ready, repair_required.")
    repair_reason: str | None = Field(default=None, description="Explicit repair reason code when setup is invalid.")


class SystemRuntimeOut(BaseSchema):
    capabilities: SystemRuntimeCapabilities = Field(
        ...,
        description="Public runtime capabilities derived from concrete backend configuration.",
    )
    instance_setup: SystemInstanceSetupOut = Field(
        ...,
        description="Public instance setup state derived from install.lock and super-admin truth.",
    )


class SystemBootstrapRequest(RegisterRequest):
    """Bootstrap the instance by creating the first super-admin account."""
