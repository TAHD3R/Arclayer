from __future__ import annotations

from typing import Literal

from pydantic import Field

from apps.api.common.schemas import BaseSchema
from apps.api.config import Settings

DeploymentMode = Literal["saas", "self_host"]


class SystemFlagsOut(BaseSchema):
    """System-level feature flags derived from environment configuration."""

    deployment_mode: DeploymentMode = Field(
        ...,
        description="Current deployment mode: saas or self_host.",
        examples=["saas", "self_host"],
    )
    multi_tenant: bool = Field(
        ...,
        description="Whether multi-tenant subdomain routing is active.",
        examples=[True, False],
    )
    custom_domain: bool = Field(
        ...,
        description="Whether custom domain binding is supported.",
        examples=[True, False],
    )
    visual_editor: bool = Field(
        ...,
        description="Whether cross-site visual editor is available.",
        examples=[True, False],
    )
    deployment_settings: bool = Field(
        ...,
        description="Whether instance-level deployment settings are exposed.",
        examples=[True, False],
    )
    public_register: bool = Field(
        ...,
        description="Whether public account registration is enabled.",
        examples=[True, False],
    )


def build_system_flags(*, settings: Settings) -> SystemFlagsOut:
    """Derive system flags from environment configuration. Pure function, no I/O."""

    mode: DeploymentMode = settings.application.deployment_mode
    is_saas = mode == "saas"

    return SystemFlagsOut(
        deployment_mode=mode,
        multi_tenant=is_saas,
        custom_domain=is_saas,
        visual_editor=is_saas,
        deployment_settings=not is_saas,
        public_register=settings.auth.allow_public_register,
    )
