from __future__ import annotations

from datetime import datetime
from typing import Protocol
from uuid import UUID

# NOTE:
# Tortoise ORM exposes model attributes via field descriptors that don't map cleanly
# to static type checkers. These lightweight Protocols let us narrow types locally
# (via typing.cast) without modifying model classes or runtime behavior.


class HasOrganizationId(Protocol):
    organization_id: UUID | str


class HasSiteId(Protocol):
    site_id: UUID | str


class HasWorkspaceId(Protocol):
    workspace_id: UUID | str


class HasProjectId(Protocol):
    project_id: UUID | str


class HasRuntimeId(Protocol):
    runtime_id: UUID | str | None


class HasUserId(Protocol):
    user_id: UUID | str


class HasParentId(Protocol):
    parent_id: UUID | str | None


class HasEntryTypeId(Protocol):
    entry_type_id: UUID | str


class HasEntryId(Protocol):
    entry_id: UUID | str


class WorkspaceMembershipIds(Protocol):
    workspace_id: UUID | str
    user_id: UUID | str


class AssetUsageHasAssetId(Protocol):
    asset_id: UUID | str


class ContentEntryMutableFields(Protocol):
    published_revision: int | None
    updated_by_user_id: UUID | None


class SettingUpdatedBy(Protocol):
    updated_by: UUID | None


class SysConfigActiveMutableFields(Protocol):
    activated_by: UUID | None


class PermissionMutableFields(Protocol):
    description: str | None
    name_i18n: str | None
    description_i18n: str | None
    owner_key: str | None


class UploadPartMutableFields(Protocol):
    checksum_sha256: str | None
    etag: str | None


class WorkspaceEmailInviteMutableFields(Protocol):
    role_code: str | None
    expires_at: datetime | None


class WorkspaceInviteLinkMutableFields(Protocol):
    expires_at: datetime | None


class OrganizationLogoUrlMutableFields(Protocol):
    logo_url: str | None


class WorkspaceArchiveMutableFields(Protocol):
    archived_at: datetime | None
    archived_by_user_id: UUID | None


class DomainBindingRecordView(Protocol):
    id: UUID | str
    workspace_id: UUID | str
    project_id: UUID | str
    runtime_id: UUID | str
    site_id: UUID | str
    environment_id: UUID | str | None
    hostname: str
    source: str
    target_type: str
    is_primary: bool
    is_verified: bool
    is_active: bool
    verification_token: str | None
    verified_at: datetime | None
    certificate_status: str
    created_by_user_id: UUID | str | None


class UserMutableFields(Protocol):
    username: str
    email: str | None
    display_name: str | None
    avatar_url: str | None
    avatar_asset_id: UUID | None
