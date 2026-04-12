from __future__ import annotations

from pydantic import Field, model_validator

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID


class OrganizationLocalizationOut(BaseSchema):
    locale: str = Field(..., description="Default language for organization-level admin surfaces.")
    timezone: str = Field(..., description="Default timezone for organization-level admin surfaces.")
    date_format: str = Field(..., description="Default date format for organization-level admin surfaces.")
    use_browser_timezone: bool = Field(default=True, description="Whether to use browser timezone by default.")
    use_relative_datetime: bool = Field(default=True, description="Whether to display relative datetime by default.")


class OrganizationLocalizationPatch(BaseSchema):
    locale: str | None = Field(default=None, min_length=2, max_length=32, description="Language code.")
    timezone: str | None = Field(default=None, min_length=1, max_length=128, description="Timezone name.")
    date_format: str | None = Field(default=None, min_length=1, max_length=64, description="Date format token.")
    use_browser_timezone: bool | None = Field(default=None, description="Use browser timezone by default.")
    use_relative_datetime: bool | None = Field(default=None, description="Use relative datetime by default.")

    @model_validator(mode="after")
    def _validate_any_field(self) -> OrganizationLocalizationPatch:
        if (
            self.locale is None
            and self.timezone is None
            and self.date_format is None
            and self.use_browser_timezone is None
            and self.use_relative_datetime is None
        ):
            raise ValueError("At least one localization field is required")
        return self


class OrganizationSettingsCoreOut(BaseSchema):
    organization_id: PublicUUID = Field(..., description="Organization id.")
    organization_name: str = Field(..., description="Organization display name.")
    organization_logo_url: str | None = Field(default=None, description="Organization logo URL (optional).")
    organization_logo_asset_aligned: bool = Field(
        default=False,
        description="Whether the logo asset was auto-aligned (purpose/visibility/indexable) in this response.",
    )
    organization_localization: OrganizationLocalizationOut = Field(
        ..., description="Organization default localization preferences."
    )
    default_role_code: str = Field(..., description="Default role code assigned to newly joined members.")


class OrganizationSettingsCorePatch(BaseSchema):
    organization_name: str | None = Field(default=None, min_length=1, max_length=128, description="Organization name.")
    organization_logo_url: str | None = Field(default=None, max_length=512, description="Organization logo URL.")
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
            and self.organization_logo_url is None
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


class OrganizationDangerActionOut(BaseSchema):
    enabled: bool = Field(default=False, description="Whether the destructive action is currently allowed.")
    blocked_reason: str | None = Field(default=None, description="Explicit blocking reason code when disabled.")


class OrganizationDangerCapabilitiesOut(BaseSchema):
    organization_id: PublicUUID = Field(..., description="Organization id.")
    role_code: str = Field(..., description="Resolved organization role code for current user.")
    confirm_leave_text: str = Field(default="LEAVE", description="Exact confirmation text required for leave.")
    confirm_delete_name: str = Field(..., description="Exact organization name required for delete confirmation.")
    leave_action: OrganizationDangerActionOut = Field(..., description="Capability for leaving the organization.")
    delete_action: OrganizationDangerActionOut = Field(..., description="Capability for deleting the organization.")
