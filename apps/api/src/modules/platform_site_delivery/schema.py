from __future__ import annotations

from datetime import datetime

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.core.http.pagination import PageData
from src.models.hosting.commercial_access import HostingCommercialAccessState


class PlatformDeliveryIssueListQuery(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    kind: str | None = Field(default=None, max_length=32)


class PlatformDeliveryIssueOut(BaseSchema):
    id: PublicUUID
    kind: str
    workspace_id: PublicUUID
    project_id: PublicUUID | None
    site_id: PublicUUID | None
    state: str
    visitor_effect: str
    summary_key: str
    retryable: bool
    occurred_at: datetime
    correlation_id: str | None


class PlatformDeliveryDomainOut(BaseSchema):
    id: PublicUUID
    workspace_id: PublicUUID
    project_id: PublicUUID
    site_id: PublicUUID
    hostname: str
    source: str
    is_verified: bool
    is_active: bool
    certificate_status: str
    readiness: str
    updated_at: datetime


class PlatformDeliveryStorageOut(BaseSchema):
    id: PublicUUID
    profile_key: str
    display_name: str
    provider: str
    is_active: bool
    is_default: bool
    last_test_status: str | None
    last_tested_at: datetime | None


class PlatformDeliveryRuleOut(BaseSchema):
    id: PublicUUID
    workspace_id: PublicUUID
    state: HostingCommercialAccessState
    preserved_release_id: PublicUUID | None
    source_identity: str
    updated_at: datetime


PlatformDeliveryIssuePage = PageData[PlatformDeliveryIssueOut]
PlatformDeliveryDomainPage = PageData[PlatformDeliveryDomainOut]
PlatformDeliveryStoragePage = PageData[PlatformDeliveryStorageOut]
PlatformDeliveryRulePage = PageData[PlatformDeliveryRuleOut]
