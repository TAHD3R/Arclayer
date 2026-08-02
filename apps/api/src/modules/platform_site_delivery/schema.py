from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.common.types.public_uuid import PublicUUID
from src.core.http.pagination import PageData
from src.models.hosting.commercial_access import (
    HostingCommercialAccessState,
    HostingDeliveryOperationAction,
    HostingDeliveryOperationState,
    HostingDeliveryOperationTargetType,
    HostingDeliveryOperationVerificationState,
)


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


class PlatformDeliveryIssueActionOut(BaseSchema):
    id: PublicUUID
    kind: Literal["publish_job", "hosting_continuity"]
    resulting_state: str
    partial_failure: bool
    failed_target_count: int = Field(ge=0)
    action: Literal["retry", "reconcile", "restore"]


class PlatformDeliveryOperationRequestIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    expected_revision: datetime
    idempotency_key: str = Field(min_length=1, max_length=128)


class PlatformDeliveryOperationOut(BaseSchema):
    id: PublicUUID
    target_type: HostingDeliveryOperationTargetType
    target_id: PublicUUID
    action: HostingDeliveryOperationAction
    state: HostingDeliveryOperationState
    verification_state: HostingDeliveryOperationVerificationState
    before_state: str
    resulting_state: str | None = None
    source_operation_identity: str | None = None
    result_reference_id: PublicUUID | None = None
    failed_target_count: int = Field(ge=0)
    evidence: JsonObject
    failure_code: str | None = None
    failure_message: str | None = None
    created_at: datetime
    completed_at: datetime | None = None
    replayed: bool = False


class PlatformDeliveryEvidenceOut(BaseSchema):
    code: str
    status: str
    observed_at: datetime | None = None
    subject_id: PublicUUID | None = None
    details: JsonObject = Field(default_factory=dict)


class PlatformDeliveryActionAvailabilityOut(BaseSchema):
    action: HostingDeliveryOperationAction
    available: bool
    reason_code: str | None = None


class PlatformDeliveryScopeOut(BaseSchema):
    workspace_id: PublicUUID | None = None
    project_id: PublicUUID | None = None
    site_id: PublicUUID | None = None
    runtime_id: PublicUUID | None = None
    release_id: PublicUUID | None = None


class PlatformDeliveryDependencyOut(BaseSchema):
    code: str
    entity_type: str
    entity_id: PublicUUID
    state: str | None = None


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


class PlatformDeliveryDomainActionOut(BaseSchema):
    id: PublicUUID
    hostname: str
    action: Literal["verify_ownership"]
    is_verified: bool
    certificate_status: str
    observed_txt_values: tuple[str, ...] = ()


class PlatformDeliveryStorageOut(BaseSchema):
    id: PublicUUID
    profile_key: str
    display_name: str
    provider: str
    is_active: bool
    is_default: bool
    last_test_status: str | None
    last_tested_at: datetime | None


class PlatformDeliveryStorageTestOut(BaseSchema):
    id: PublicUUID
    ok: bool
    status: Literal["passed", "failed"]
    message: str


class PlatformDeliveryRuleOut(BaseSchema):
    id: PublicUUID
    workspace_id: PublicUUID
    state: HostingCommercialAccessState
    preserved_release_id: PublicUUID | None
    preserved_release_count: int = Field(ge=0)
    source_identity: str
    updated_at: datetime


class PlatformDeliveryIssueDossierOut(BaseSchema):
    id: PublicUUID
    kind: Literal["publish_job", "hosting_continuity"]
    revision: datetime
    state: str
    visitor_effect: str
    summary_key: str
    retryable: bool
    occurred_at: datetime
    source_identity: str | None = None
    scope: PlatformDeliveryScopeOut
    dependencies: tuple[PlatformDeliveryDependencyOut, ...]
    evidence: tuple[PlatformDeliveryEvidenceOut, ...]
    actions: tuple[PlatformDeliveryActionAvailabilityOut, ...]
    operations: tuple[PlatformDeliveryOperationOut, ...]


class PlatformDeliveryDomainDossierOut(BaseSchema):
    id: PublicUUID
    hostname: str
    revision: datetime
    source: str
    is_verified: bool
    is_active: bool
    certificate_status: str
    readiness: str
    scope: PlatformDeliveryScopeOut
    dependencies: tuple[PlatformDeliveryDependencyOut, ...]
    evidence: tuple[PlatformDeliveryEvidenceOut, ...]
    actions: tuple[PlatformDeliveryActionAvailabilityOut, ...]
    operations: tuple[PlatformDeliveryOperationOut, ...]


class PlatformDeliveryStorageDossierOut(BaseSchema):
    id: PublicUUID
    profile_key: str
    display_name: str
    revision: datetime
    provider: str
    config_source: str
    is_active: bool
    is_default: bool
    readiness: str
    last_test_status: str | None = None
    last_tested_at: datetime | None = None
    tombstoned_at: datetime | None = None
    scope: PlatformDeliveryScopeOut
    dependencies: tuple[PlatformDeliveryDependencyOut, ...]
    evidence: tuple[PlatformDeliveryEvidenceOut, ...]
    actions: tuple[PlatformDeliveryActionAvailabilityOut, ...]
    operations: tuple[PlatformDeliveryOperationOut, ...]


class PlatformDeliveryPolicyPreviewIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    expected_revision: int = Field(ge=0)
    continuity_window_seconds: int = Field(ge=1)


class PlatformDeliveryContinuityPolicyOut(BaseSchema):
    revision: int = Field(ge=0)
    continuity_window_seconds: int | None = Field(default=None, ge=1)
    is_active: bool
    affected_active_transition_count: int = Field(ge=0)


class PlatformDeliveryPolicyPreviewOut(BaseSchema):
    id: PublicUUID
    expected_revision: int = Field(ge=0)
    proposed_revision: int = Field(ge=1)
    continuity_window_seconds: int = Field(ge=1)
    affected_active_transition_count: int = Field(ge=0)
    partial_failure: bool = False


class PlatformDeliveryPolicyApplyIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    idempotency_key: str = Field(min_length=1, max_length=128)
    reason: str = Field(min_length=1, max_length=512)


class PlatformDeliveryPolicyApplyOut(BaseSchema):
    policy_revision: int = Field(ge=1)
    continuity_window_seconds: int = Field(ge=1)
    applied_at: datetime
    replayed: bool = False
    partial_failure: bool = False
    affected_active_transition_count: int = Field(ge=0)


PlatformDeliveryIssuePage = PageData[PlatformDeliveryIssueOut]
PlatformDeliveryDomainPage = PageData[PlatformDeliveryDomainOut]
PlatformDeliveryStoragePage = PageData[PlatformDeliveryStorageOut]
PlatformDeliveryRulePage = PageData[PlatformDeliveryRuleOut]
PlatformDeliveryOperationPage = PageData[PlatformDeliveryOperationOut]
