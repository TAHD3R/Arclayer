from __future__ import annotations

from pydantic import Field, model_validator

from apps.api.common.schemas import BaseSchema
from apps.api.common.types.public_uuid import PublicUUID


class OrganizationLocalizationOut(BaseSchema):
    locale: str = Field(..., description="Default language for organization-level admin surfaces.")
    timezone: str = Field(..., description="Default timezone for organization-level admin surfaces.")
    date_format: str = Field(..., description="Default date format for organization-level admin surfaces.")


class OrganizationLocalizationPatch(BaseSchema):
    locale: str | None = Field(default=None, min_length=2, max_length=32, description="Language code.")
    timezone: str | None = Field(default=None, min_length=1, max_length=128, description="Timezone name.")
    date_format: str | None = Field(default=None, min_length=1, max_length=64, description="Date format token.")

    @model_validator(mode="after")
    def _validate_any_field(self) -> OrganizationLocalizationPatch:
        if self.locale is None and self.timezone is None and self.date_format is None:
            raise ValueError("At least one localization field is required")
        return self


class OrganizationSettingsCoreOut(BaseSchema):
    organization_id: PublicUUID = Field(..., description="Organization id.")
    organization_name: str = Field(..., description="Organization display name.")
    organization_localization: OrganizationLocalizationOut = Field(
        ..., description="Organization default localization preferences."
    )
    default_role_code: str = Field(..., description="Default role code assigned to newly joined members.")


class OrganizationSettingsCorePatch(BaseSchema):
    organization_name: str | None = Field(default=None, min_length=1, max_length=128, description="Organization name.")
    organization_localization: OrganizationLocalizationPatch | None = Field(
        default=None,
        description="Organization localization merge patch.",
    )
    default_role_code: str | None = Field(
        default=None,
        min_length=1,
        max_length=64,
        description="Default organization role code.",
    )

    @model_validator(mode="after")
    def _validate_any_field(self) -> OrganizationSettingsCorePatch:
        if (
            self.organization_name is None
            and self.organization_localization is None
            and self.default_role_code is None
        ):
            raise ValueError("At least one patch field is required")
        return self


class OrganizationAssignDefaultRoleRequest(BaseSchema):
    role_code: str = Field(..., min_length=1, max_length=64, description="Role code applied to target members.")
    confirm_name: str = Field(..., min_length=1, max_length=128, description="Organization name confirmation.")


class OrganizationAssignDefaultRoleResult(BaseSchema):
    organization_id: PublicUUID = Field(..., description="Organization id.")
    role_code: str = Field(..., description="Applied role code.")
    updated_count: int = Field(default=0, ge=0, description="How many members were updated.")


class LeaveOrganizationRequest(BaseSchema):
    confirm_text: str = Field(..., min_length=1, max_length=32, description="Confirmation text, must be LEAVE.")


class LeaveOrganizationResult(BaseSchema):
    organization_id: PublicUUID = Field(..., description="Organization id.")
    membership_id: PublicUUID = Field(..., description="Deleted organization membership id.")
    left: bool = Field(default=True, description="Whether current user left the organization.")


class DeleteOrganizationResult(BaseSchema):
    organization_id: PublicUUID = Field(..., description="Deleted organization id.")
    deleted: bool = Field(default=True, description="Whether organization was deleted.")
