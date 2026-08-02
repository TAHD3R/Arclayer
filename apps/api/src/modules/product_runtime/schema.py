from __future__ import annotations

from pydantic import Field

from src.common.schemas import BaseSchema


class ProductRuntimeCapabilities(BaseSchema):
    public_register_enabled: bool = Field(
        ...,
        description="Whether public account registration is enabled for the Product Application.",
    )


class ProductInstanceSetupOut(BaseSchema):
    status: str = Field(..., description="Instance setup status: uninitialized, ready, repair_required.")
    repair_reason: str | None = Field(default=None, description="Explicit repair reason code when setup is invalid.")


class ProductRuntimeOut(BaseSchema):
    capabilities: ProductRuntimeCapabilities = Field(
        ...,
        description="Public Product capabilities derived from concrete backend configuration.",
    )
    instance_setup: ProductInstanceSetupOut = Field(
        ...,
        description="Public setup state derived from install.lock and the Instance Owner singleton.",
    )
