from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import Field, field_validator, model_validator

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.modules.ai.provider_icon import AIProviderIcon

AIProviderKind = Literal["openai", "anthropic", "deepseek", "openai_compatible", "anthropic_compatible"]


class SystemAIProviderModelMapping(BaseSchema):
    public_model: str = Field(..., min_length=1, max_length=255)
    provider_model: str = Field(..., min_length=1, max_length=255)
    label: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, min_length=1, max_length=500)
    label_i18n: dict[Literal["zh-CN", "en-US"], str] = Field(default_factory=dict, alias="labelI18n")
    description_i18n: dict[Literal["zh-CN", "en-US"], str] = Field(
        default_factory=dict,
        alias="descriptionI18n",
    )

    @field_validator("public_model", "provider_model", "label", "description", mode="before")
    @classmethod
    def normalize_model_identifier(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator("label_i18n", "description_i18n", mode="before")
    @classmethod
    def normalize_localized_text(cls, value: object) -> object:
        if not isinstance(value, dict):
            return value
        return {
            key: item.strip()
            for key, item in value.items()
            if key in {"zh-CN", "en-US"} and isinstance(item, str) and item.strip()
        }


class SystemAIProviderTestConfig(BaseSchema):
    prompt: str = Field(default="Respond with OK.", min_length=1, max_length=2000)
    expected_text: str | None = Field(default="OK", min_length=1, max_length=512)
    max_tokens: int = Field(default=8, ge=1, le=128)


class SystemAIProviderBillingConfig(BaseSchema):
    currency: Literal["USD"] = "USD"
    input_cost_micros_per_million_tokens: int = Field(default=0, ge=0)
    output_cost_micros_per_million_tokens: int = Field(default=0, ge=0)


class SystemAIProviderOut(BaseSchema):
    id: PublicUUID
    provider: str
    label: str
    icon: AIProviderIcon | None = None
    note: str | None = None
    website_url: str | None = None
    compatibility: AIProviderKind
    auth_header: str
    is_active: bool
    is_archived: bool
    cleanup_required: bool
    has_virtual_key: bool
    litellm_key_id: str | None = None
    base_url: str | None = None
    model_mappings: list[SystemAIProviderModelMapping] = Field(default_factory=list)
    default_model: str
    test_config: SystemAIProviderTestConfig
    billing_config: SystemAIProviderBillingConfig
    created_at: datetime
    updated_at: datetime
    last_used_at: datetime | None = None
    expires_at: datetime | None = None
    readiness_status: Literal["unknown", "healthy", "unhealthy"] = "unknown"
    readiness_checked_at: datetime | None = None
    readiness_failure_code: str | None = None


class SystemAIProviderListOut(BaseSchema):
    providers: list[SystemAIProviderOut] = Field(default_factory=list)


class SystemAIProviderCreateRequest(BaseSchema):
    provider: str = Field(..., min_length=1, max_length=50)
    label: str = Field(..., min_length=1, max_length=80)
    icon: AIProviderIcon | None = None
    note: str | None = Field(default=None, max_length=2000)
    website_url: str | None = Field(default=None, max_length=512)
    compatibility: AIProviderKind = "openai_compatible"
    auth_header: str = Field(default="Authorization", min_length=1, max_length=128)
    provider_api_key: str = Field(..., min_length=1, max_length=4096)
    base_url: str | None = Field(default=None, max_length=512)
    model_mappings: list[SystemAIProviderModelMapping] = Field(..., min_length=1)
    default_model: str = Field(..., min_length=1, max_length=255)
    test_config: SystemAIProviderTestConfig = Field(default_factory=SystemAIProviderTestConfig)
    billing_config: SystemAIProviderBillingConfig = Field(default_factory=SystemAIProviderBillingConfig)
    expires_at: datetime | None = None

    @model_validator(mode="after")
    def validate_model_configuration(self) -> SystemAIProviderCreateRequest:
        _validate_model_configuration(self.model_mappings, self.default_model)
        return self


class SystemAIProviderUpdateRequest(BaseSchema):
    provider: str | None = Field(default=None, min_length=1, max_length=50)
    label: str | None = Field(default=None, min_length=1, max_length=80)
    icon: AIProviderIcon | None = None
    note: str | None = Field(default=None, max_length=2000)
    website_url: str | None = Field(default=None, max_length=512)
    compatibility: AIProviderKind | None = None
    auth_header: str | None = Field(default=None, min_length=1, max_length=128)
    provider_api_key: str | None = Field(default=None, min_length=1, max_length=4096)
    base_url: str | None = Field(default=None, max_length=512)
    model_mappings: list[SystemAIProviderModelMapping] | None = Field(default=None, min_length=1)
    default_model: str | None = Field(default=None, min_length=1, max_length=255)
    test_config: SystemAIProviderTestConfig | None = None
    billing_config: SystemAIProviderBillingConfig | None = None
    is_active: bool | None = None
    is_archived: bool | None = None
    expires_at: datetime | None = None

    @model_validator(mode="after")
    def validate_model_configuration(self) -> SystemAIProviderUpdateRequest:
        if self.model_mappings is not None:
            public_models = [item.public_model.strip() for item in self.model_mappings]
            if len(public_models) != len(set(public_models)):
                raise ValueError("AI_PROVIDER_MODEL_MAPPING_DUPLICATE")
            if self.default_model is not None and self.default_model.strip() not in public_models:
                raise ValueError("AI_PROVIDER_DEFAULT_MODEL_NOT_MAPPED")
        return self


class SystemAIProviderReadinessTestOut(BaseSchema):
    id: PublicUUID
    status: Literal["healthy", "unhealthy"]
    checked_at: datetime
    failure_code: str | None = None


class SystemAIProviderAvailabilityPreviewRequest(BaseSchema):
    is_active: bool


class SystemAIProviderAvailabilityPreviewOut(BaseSchema):
    id: PublicUUID
    desired_is_active: bool
    routable_provider_count_before: int
    routable_provider_count_after: int
    would_leave_no_routable_provider: bool
    revision: str


class SystemAIProviderAvailabilityApplyRequest(SystemAIProviderAvailabilityPreviewRequest):
    preview_revision: str = Field(..., min_length=64, max_length=64)


def _validate_model_configuration(
    mappings: list[SystemAIProviderModelMapping],
    default_model: str,
) -> None:
    public_models = [item.public_model.strip() for item in mappings]
    if len(public_models) != len(set(public_models)):
        raise ValueError("AI_PROVIDER_MODEL_MAPPING_DUPLICATE")
    if default_model.strip() not in public_models:
        raise ValueError("AI_PROVIDER_DEFAULT_MODEL_NOT_MAPPED")
