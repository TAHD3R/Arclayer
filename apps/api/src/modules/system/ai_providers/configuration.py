from __future__ import annotations

from collections.abc import Iterable
from datetime import UTC, datetime
from typing import Any, cast
from uuid import UUID

from pydantic import BaseModel, ConfigDict
from tortoise.expressions import Q

from src.common.types.json_types import JsonObject
from src.core.i18n import t
from src.llm.errors import LLMErrorCode
from src.llm.runtime import LLMRuntimeError
from src.models.ai.ai_api_key import AIAPIKey, KeyOwnerType, KeyType
from src.modules.ai.provider_icon import AIProviderIcon
from src.modules.system.ai_providers.schema import (
    SystemAIProviderBillingConfig,
    SystemAIProviderModelMapping,
)

PLATFORM_OWNER_ID = UUID(int=0)
SYSTEM_AI_PROVIDER_METADATA_SOURCE = "system.ai_providers"


class ConfiguredSystemModel(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    provider_id: UUID
    provider: str
    public_model: str
    provider_model: str
    label: str
    description: str | None
    label_i18n: dict[str, str]
    description_i18n: dict[str, str]
    is_default: bool
    billing: SystemAIProviderBillingConfig | None
    provider_icon: AIProviderIcon | None


async def list_active_system_models() -> list[ConfiguredSystemModel]:
    now = datetime.now(UTC)
    records = (
        await AIAPIKey
        .filter(
            owner_type=KeyOwnerType.PLATFORM,
            owner_id=PLATFORM_OWNER_ID,
            key_type=KeyType.VIRTUAL_KEY,
            is_active=True,
            virtual_key_enc__not_isnull=True,
        )
        .filter(Q(expires_at__gt=now) | Q(expires_at__isnull=True))
        .order_by("created_at")
        .values("id", "provider", "metadata_json")
    )
    return configured_models_from_records(records)


async def resolve_active_system_model(model: str) -> ConfiguredSystemModel | None:
    normalized = model.strip()
    matches = [item for item in await list_active_system_models() if item.public_model == normalized]
    if len(matches) > 1:
        raise LLMRuntimeError(
            code=LLMErrorCode.PROVIDER_MODEL_CONFIGURATION_CONFLICT,
            message=t(
                "errors",
                LLMErrorCode.PROVIDER_MODEL_CONFIGURATION_CONFLICT.value,
                default="Multiple AI services use the requested public model name",
            ),
            status_code=409,
        )
    return matches[0] if matches else None


async def resolve_default_system_model() -> ConfiguredSystemModel | None:
    return next((item for item in await list_active_system_models() if item.is_default), None)


def configured_models_from_records(records: Iterable[dict[str, Any]]) -> list[ConfiguredSystemModel]:
    configured: list[ConfiguredSystemModel] = []
    for record in records:
        metadata = _metadata(record.get("metadata_json"))
        provider = record.get("provider")
        provider_id = record.get("id")
        if (
            not isinstance(provider_id, UUID)
            or not isinstance(provider, str)
            or not provider.strip()
            or metadata.get("source") != SYSTEM_AI_PROVIDER_METADATA_SOURCE
            or metadata.get("archived_at")
            or metadata.get("cleanup_required") is True
        ):
            continue
        mappings = model_mappings_from_metadata(metadata, provider=provider)
        if not mappings:
            continue
        default_model = default_model_from_metadata(metadata, provider=provider)
        billing = _configured_billing(metadata)
        provider_icon = provider_icon_from_metadata(metadata)
        provider_label = _optional_text(metadata.get("label")) or provider.strip()
        provider_note = _optional_text(metadata.get("note"))
        use_provider_copy = len(mappings) == 1
        configured.extend(
            ConfiguredSystemModel(
                provider_id=provider_id,
                provider=provider.strip(),
                public_model=mapping.public_model,
                provider_model=mapping.provider_model,
                label=mapping.label or (provider_label if use_provider_copy else mapping.public_model),
                description=mapping.description or (provider_note if use_provider_copy else None),
                label_i18n={str(key): value for key, value in mapping.label_i18n.items()},
                description_i18n={str(key): value for key, value in mapping.description_i18n.items()},
                is_default=mapping.public_model == default_model,
                billing=billing,
                provider_icon=provider_icon,
            )
            for mapping in mappings
        )
    return configured


def model_mappings_from_metadata(
    metadata: JsonObject,
    *,
    provider: str,
) -> list[SystemAIProviderModelMapping]:
    raw_mappings = metadata.get("model_mappings")
    if isinstance(raw_mappings, list):
        mappings: list[SystemAIProviderModelMapping] = []
        for item in raw_mappings:
            if not isinstance(item, dict):
                continue
            try:
                mappings.append(SystemAIProviderModelMapping.model_validate(item))
            except ValueError:
                continue
        if mappings:
            return mappings

    return []


def default_model_from_metadata(metadata: JsonObject, *, provider: str) -> str:
    mappings = model_mappings_from_metadata(metadata, provider=provider)
    default_model = metadata.get("default_model")
    if isinstance(default_model, str) and any(item.public_model == default_model.strip() for item in mappings):
        return default_model.strip()
    if mappings:
        return mappings[0].public_model
    return ""


def billing_config_from_metadata(metadata: JsonObject) -> SystemAIProviderBillingConfig:
    return _configured_billing(metadata) or SystemAIProviderBillingConfig()


def provider_icon_from_metadata(metadata: JsonObject) -> AIProviderIcon | None:
    value = metadata.get("icon")
    if value is None:
        return None
    return AIProviderIcon.model_validate(value)


def _configured_billing(metadata: JsonObject) -> SystemAIProviderBillingConfig | None:
    value = metadata.get("billing_config")
    if isinstance(value, dict):
        try:
            return SystemAIProviderBillingConfig.model_validate(value)
        except ValueError:
            pass
    return None


def _metadata(value: object) -> JsonObject:
    return cast(JsonObject, dict(value)) if isinstance(value, dict) else {}


def _optional_text(value: object) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None
