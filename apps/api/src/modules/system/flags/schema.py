from __future__ import annotations

from typing import Literal

from pydantic import Field

from apps.api.src.common.schemas import BaseSchema

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
