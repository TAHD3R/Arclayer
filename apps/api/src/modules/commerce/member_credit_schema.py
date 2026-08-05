from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import Field, model_validator

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.core.http.pagination import PageData
from src.models.commerce.billing import ResourceLimitKind
from src.modules.workspaces.team.schema import WorkspaceTeamUserRefOut


class MemberCreditLimitOut(BaseSchema):
    limit_kind: ResourceLimitKind
    limit_credits: int | None

    @model_validator(mode="after")
    def _validate_shape(self) -> MemberCreditLimitOut:
        _validate_limit_shape(self.limit_kind, self.limit_credits)
        return self


class MemberCreditDefaultLimitWrite(BaseSchema):
    limit_kind: ResourceLimitKind
    limit_credits: int | None
    expected_revision: int = Field(ge=1)
    idempotency_key: str = Field(min_length=1, max_length=128)

    @model_validator(mode="after")
    def _validate_shape(self) -> MemberCreditDefaultLimitWrite:
        _validate_limit_shape(self.limit_kind, self.limit_credits)
        return self


class MemberCreditOverrideWrite(BaseSchema):
    action: Literal["set", "clear"]
    limit_kind: ResourceLimitKind | None = None
    limit_credits: int | None = None
    expected_revision: int = Field(ge=1)
    idempotency_key: str = Field(min_length=1, max_length=128)

    @model_validator(mode="after")
    def _validate_shape(self) -> MemberCreditOverrideWrite:
        if self.action == "clear":
            if self.limit_kind is not None or self.limit_credits is not None:
                raise ValueError("clear override cannot include a limit")
            return self
        if self.limit_kind is None:
            raise ValueError("set override requires limit_kind")
        _validate_limit_shape(self.limit_kind, self.limit_credits)
        return self


class MemberCreditConfigurationMutationOut(BaseSchema):
    workspace_id: PublicUUID
    membership_id: PublicUUID | None
    default_limit: MemberCreditLimitOut
    override_limit: MemberCreditLimitOut | None
    effective_limit: MemberCreditLimitOut
    configuration_revision: int = Field(ge=1)
    replayed: bool = False


class MemberCreditUsageItemOut(BaseSchema):
    membership_id: PublicUUID
    user: WorkspaceTeamUserRefOut
    is_owner: bool
    effective_limit: MemberCreditLimitOut
    reserved_credits: int = Field(ge=0)
    committed_credits: int = Field(ge=0)
    available_credits: int | None = Field(default=None, ge=0)


class MemberCreditLimitItemOut(MemberCreditUsageItemOut):
    override_limit: MemberCreditLimitOut | None


class MemberCreditUsagePageOut(PageData[MemberCreditUsageItemOut]):
    period_start: datetime
    period_end: datetime


class MemberCreditLimitsPageOut(PageData[MemberCreditLimitItemOut]):
    default_limit: MemberCreditLimitOut
    configuration_revision: int = Field(ge=1)
    period_start: datetime
    period_end: datetime


def _validate_limit_shape(limit_kind: ResourceLimitKind | str, limit_credits: int | None) -> None:
    if limit_kind == ResourceLimitKind.LIMITED:
        if limit_credits is None or limit_credits <= 0:
            raise ValueError("limited member Credit configuration requires positive limit_credits")
        return
    if limit_credits is not None:
        raise ValueError("unlimited member Credit configuration requires null limit_credits")
