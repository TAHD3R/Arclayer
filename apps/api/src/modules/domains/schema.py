from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import ConfigDict, Field, field_validator

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.modules.domains.hostname import normalize_hostname


class DomainBindingCreateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    hostname: Annotated[str, Field(..., description="Custom hostname to bind (e.g. example.com).")]

    @field_validator("hostname", mode="after")
    @classmethod
    def _normalize_binding_hostname(cls, value: str) -> str:
        return normalize_hostname(value)


class DomainBindingUpdateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    is_active: bool | None = Field(
        default=None,
        alias="isActive",
        description="Whether the binding is active for routing.",
    )


class DomainBindingDnsInstructionOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    txt_record_name: str = Field(..., alias="txtRecordName", description="DNS TXT record name to publish.")
    txt_record_value: str = Field(..., alias="txtRecordValue", description="DNS TXT record value to publish.")


class DomainBindingOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    binding_id: PublicUUID = Field(..., alias="bindingId", description="Domain binding id.")
    hostname: str = Field(..., description="Bound hostname.")
    source: str = Field(..., description="Binding source: platform or custom.")
    target_type: str = Field(..., alias="targetType", description="Resolved binding target type.")

    workspace_id: PublicUUID = Field(..., alias="workspaceId", description="Workspace id.")
    project_id: PublicUUID = Field(..., alias="projectId", description="Project id.")
    runtime_id: PublicUUID = Field(..., alias="runtimeId", description="Runtime id.")
    runtime_name: str | None = Field(default=None, alias="runtimeName", description="Runtime display name.")
    site_id: PublicUUID = Field(..., alias="siteId", description="Site id.")
    environment_id: PublicUUID | None = Field(
        default=None,
        alias="environmentId",
        description="Environment id when runtime environments are modeled.",
    )

    is_primary: bool = Field(..., alias="isPrimary", description="Whether this is the primary binding.")
    is_verified: bool = Field(..., alias="isVerified", description="Whether the binding is verified for routing.")
    is_active: bool = Field(..., alias="isActive", description="Whether the binding is active for routing.")
    verification_token: str | None = Field(
        default=None,
        alias="verificationToken",
        description="DNS TXT verification token for custom domains.",
    )
    verified_at_ms: int | None = Field(default=None, alias="verifiedAtMs", description="Verification time in ms.")
    certificate_status: str = Field(
        ...,
        alias="certificateStatus",
        description="Certificate provisioning state.",
    )
    created_by_user_id: PublicUUID | None = Field(
        default=None,
        alias="createdByUserId",
        description="User id that created the binding.",
    )
    dns: DomainBindingDnsInstructionOut | None = Field(
        default=None,
        description="DNS instructions for unverified custom domains.",
    )


class DomainBindingCreateOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    binding: DomainBindingOut = Field(..., description="Created domain binding.")


class DomainBindingVerifyOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    binding: DomainBindingOut = Field(..., description="Binding after verification attempt.")
    observed_txt_values: list[str] = Field(
        default_factory=list,
        alias="observedTxtValues",
        description="Observed TXT values returned by DNS lookup.",
    )


class DomainBindingDeleteOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    binding_id: PublicUUID = Field(..., alias="bindingId", description="Deleted binding id.")


def resolve_routable_domain_binding(
    bindings: Sequence[DomainBindingOut],
    *,
    site_id: UUID | None = None,
) -> DomainBindingOut | None:
    routable = [
        binding
        for binding in bindings
        if binding.is_active and binding.is_verified and (site_id is None or binding.site_id == site_id)
    ]
    return next((binding for binding in routable if binding.is_primary), routable[0] if routable else None)


def domain_datetime_to_ms(value: datetime | None) -> int | None:
    if not isinstance(value, datetime):
        return None
    return int(value.timestamp() * 1000)
