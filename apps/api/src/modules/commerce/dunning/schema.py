from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.modules.commerce.access_state.schema import CommercialAccessState


class RestrictedRecoveryCommandClass(StrEnum):
    PRESERVED = "preserved"
    RECOVERY = "recovery"
    SECURITY = "security"
    LIFECYCLE = "lifecycle"
    VALUE_EXPANSION = "value_expansion"


class RestrictedRecoveryEffect(StrEnum):
    READ_EXISTING = "read_existing"
    DOWNLOAD_EXISTING = "download_existing"
    EXPORT_EXISTING = "export_existing"
    INSPECT_PLAN_USAGE = "inspect_plan_usage"
    OPEN_PROVIDER_RECOVERY = "open_provider_recovery"
    COMPLETE_PAYMENT_RECOVERY = "complete_payment_recovery"
    REVOKE_SESSION = "revoke_session"
    REVOKE_API_KEY = "revoke_api_key"
    REVOKE_CONNECTOR_CREDENTIAL = "revoke_connector_credential"
    REVOKE_PENDING_INVITATION = "revoke_pending_invitation"
    REMOVE_MEMBER_ACCESS = "remove_member_access"
    REVOKE_FEATURE_SEAT = "revoke_feature_seat"
    CONTACT_SUPPORT = "contact_support"
    PRIVACY_RIGHT = "privacy_right"
    WORKSPACE_LIFECYCLE = "workspace_lifecycle"
    CONTENT_MUTATION = "content_mutation"
    METERED_EXTERNAL_EFFECT = "metered_external_effect"
    ACCESS_EXPANSION = "access_expansion"
    ASSIGN_FEATURE_SEAT = "assign_feature_seat"


class RestrictedRecoveryDecision(BaseSchema):
    allowed: bool
    command_class: RestrictedRecoveryCommandClass
    explanation_key: str | None = None
    permitted_recovery_action: str | None = None


class RestrictedRecoveryCommand(BaseSchema):
    effects: set[RestrictedRecoveryEffect] = Field(min_length=1)


class PaymentRestrictedErrorMeta(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    commercial_access_state: CommercialAccessState = CommercialAccessState.PAYMENT_RESTRICTED
    explanation_key: str = "commerce:PAYMENT_RESTRICTED"
    permitted_recovery_action: str = "open_payment_recovery"


class PaymentRecoveryRequiredErrorMeta(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    commercial_access_state: CommercialAccessState = CommercialAccessState.PAYMENT_GRACE
    recovery_deadline: datetime
    explanation_key: str = "commerce:PAYMENT_GRACE"
    permitted_recovery_action: str = "open_payment_recovery"
