from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field, model_validator

from src.common.schemas import BaseSchema
from src.core.http.pagination import PageData


class AiPolicyDraftInput(BaseSchema):
    allowed_models: list[str] = Field(default_factory=list, min_length=0, max_length=256)
    default_model: str | None = Field(default=None, min_length=1, max_length=255)
    max_tokens_per_request: int = Field(default=0, ge=0)
    max_cost_micros_per_request: int = Field(default=0, ge=0)
    max_concurrent_runs: int = Field(default=0, ge=0)
    external_data_egress_allowed: bool = False
    tool_allowlist: list[str] = Field(default_factory=list, max_length=256)
    approval_required_effect_classes: list[Literal["read", "write", "external_egress", "destructive"]] = Field(
        default_factory=list,
        max_length=16,
    )
    retry_limit: int = Field(default=0, ge=0, le=20)

    @model_validator(mode="after")
    def validate_supported_policy(self) -> AiPolicyDraftInput:
        if len(set(self.allowed_models)) != len(self.allowed_models):
            raise ValueError("AI_POLICY_ALLOWED_MODELS_DUPLICATE")
        if len(set(self.tool_allowlist)) != len(self.tool_allowlist):
            raise ValueError("AI_POLICY_TOOL_ALLOWLIST_DUPLICATE")
        if self.default_model is not None and self.allowed_models and self.default_model not in self.allowed_models:
            raise ValueError("AI_POLICY_DEFAULT_MODEL_NOT_ALLOWED")
        return self


class AiPolicyRevisionOut(AiPolicyDraftInput):
    id: UUID
    sequence: int
    status: Literal["draft", "published", "retired"]
    content_hash: str
    published_at: datetime | None = None
    applied_at: datetime | None = None


class AiPolicyOut(BaseSchema):
    draft: AiPolicyRevisionOut | None = None
    published: AiPolicyRevisionOut | None = None


AiPolicyRevisionPage = PageData[AiPolicyRevisionOut]


class AiPolicyPreviewRequest(BaseSchema):
    draft_id: UUID


class AiPolicyPreviewOut(BaseSchema):
    draft_id: UUID
    source_hash: str
    model_count: int
    tool_count: int
    unsupported_controls: tuple[str, ...] = ()
    is_applicable: bool


class AiPolicyPublishRequest(BaseSchema):
    draft_id: UUID
    preview_hash: str = Field(min_length=64, max_length=64)
    reason: str = Field(min_length=1, max_length=512)


class AiPolicyApplyRequest(BaseSchema):
    revision_id: UUID
    idempotency_key: str = Field(min_length=1, max_length=128)
    reason: str = Field(min_length=1, max_length=512)


class AiPolicyApplyOut(BaseSchema):
    revision: AiPolicyRevisionOut
    replayed: bool = False
