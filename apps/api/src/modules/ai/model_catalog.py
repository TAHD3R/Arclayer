from __future__ import annotations

from collections.abc import Iterable
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import httpx
from tortoise.expressions import Q

from src.config import Settings
from src.llm.litellm_client import LiteLLMClient
from src.llm.runtime import detect_provider
from src.models.agents.conversation import AgentConversationMode
from src.models.ai.ai_api_key import AIAPIKey, KeyOwnerType, KeyType
from src.modules.ai.schema import AIModelCatalogItem, AIModelCatalogResponse, AIReasoningEffort

MODEL_METADATA: dict[str, dict[str, str]] = {
    "deepseek-v4-pro": {
        "provider": "deepseek",
        "label": "DeepSeek V4 Pro",
        "label_key": "ai:AI_CHAT_MODEL_DEEPSEEK_V4_PRO",
        "description": "DeepSeek model for everyday chat, coding, and complex tasks",
        "description_key": "ai:AI_CHAT_MODEL_DEEPSEEK_V4_PRO_DESC",
    },
    "gpt-4o-mini": {
        "provider": "openai",
        "label": "GPT-4o mini",
        "label_key": "ai:AI_CHAT_MODEL_GPT_4O_MINI",
        "description": "Fast responses for everyday workspace tasks",
        "description_key": "ai:AI_CHAT_MODEL_GPT_4O_MINI_DESC",
    },
    "gpt-4o": {
        "provider": "openai",
        "label": "GPT-4o",
        "label_key": "ai:AI_CHAT_MODEL_GPT_4O",
        "description": "Higher quality reasoning for richer prompts",
        "description_key": "ai:AI_CHAT_MODEL_GPT_4O_DESC",
    },
    "claude-sonnet-4-6": {
        "provider": "anthropic",
        "label": "Claude Sonnet 4.6",
        "label_key": "ai:AI_CHAT_MODEL_CLAUDE_SONNET",
        "description": "Strong long-form analysis and writing",
        "description_key": "ai:AI_CHAT_MODEL_CLAUDE_SONNET_DESC",
    },
    "mock": {
        "provider": "mock",
        "label": "Mock",
        "label_key": "ai:AI_CHAT_MODEL_MOCK",
        "description": "Local development mock model",
        "description_key": "ai:AI_CHAT_MODEL_MOCK_DESC",
    },
}

MODEL_ORDER = tuple(MODEL_METADATA.keys())
SYSTEM_AI_PROVIDER_METADATA_SOURCE = "system.ai_providers"
AI_MODEL_CATALOG_MASTER_KEY_REQUIRED = "AI_MODEL_CATALOG_MASTER_KEY_REQUIRED"
AI_MODEL_CATALOG_EMPTY = "AI_MODEL_CATALOG_EMPTY"
AI_MODEL_CATALOG_LITELLM_UNREACHABLE = "AI_MODEL_CATALOG_LITELLM_UNREACHABLE"
AI_MODEL_CATALOG_RESPONSE_INVALID = "AI_MODEL_CATALOG_RESPONSE_INVALID"


class AIModelCatalogUnavailableError(Exception):
    """Raised when the model catalog cannot be loaded from LiteLLM."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


async def list_ai_model_catalog(
    settings: Settings,
    *,
    workspace_id: UUID,
    user_id: UUID,
    default_model: str | None = None,
    default_mode: str | None = None,
    reasoning_effort: str | None = None,
) -> AIModelCatalogResponse:
    """Load the chat model catalog from LiteLLM and enrich it with product metadata."""
    if settings.ai.mock_enabled:
        model_ids = ["mock"]
        available_providers = {"mock"}
    else:
        if not settings.ai.litellm_master_key:
            raise AIModelCatalogUnavailableError(AI_MODEL_CATALOG_MASTER_KEY_REQUIRED)
        model_ids = await _list_litellm_model_ids(settings)
        available_providers = await _list_available_providers()

    visible_model_ids = _visible_model_ids(
        model_ids,
        available_providers=available_providers,
        mock_enabled=settings.ai.mock_enabled,
    )
    if not visible_model_ids:
        raise AIModelCatalogUnavailableError(AI_MODEL_CATALOG_EMPTY)

    items = [_build_catalog_item(model_id) for model_id in visible_model_ids]
    resolved_default_model = _resolve_default_model(
        visible_model_ids=visible_model_ids,
        core_default_model=default_model,
        settings_default_model=settings.ai.default_model,
    )
    return AIModelCatalogResponse(
        default_model=resolved_default_model,
        default_mode=_resolve_default_mode(default_mode),
        reasoning_effort=_resolve_reasoning_effort(reasoning_effort),
        models=items,
    )


def _resolve_default_model(
    *,
    visible_model_ids: list[str],
    core_default_model: str | None,
    settings_default_model: str,
) -> str:
    if core_default_model in visible_model_ids:
        return core_default_model
    if settings_default_model in visible_model_ids:
        return settings_default_model
    return visible_model_ids[0]


def _resolve_default_mode(default_mode: str | None) -> AgentConversationMode:
    if default_mode == AgentConversationMode.PLAN.value:
        return AgentConversationMode.PLAN
    if default_mode == AgentConversationMode.AGENT.value:
        return AgentConversationMode.AGENT
    return AgentConversationMode.BUILD


def _resolve_reasoning_effort(reasoning_effort: str | None) -> AIReasoningEffort:
    if reasoning_effort == "low":
        return "low"
    if reasoning_effort == "high":
        return "high"
    return "medium"


async def _list_litellm_model_ids(settings: Settings) -> list[str]:
    client = LiteLLMClient(
        base_url=settings.ai.litellm_base_url,
        timeout_seconds=settings.ai.litellm_timeout_seconds,
    )
    try:
        payload = await client.list_models(master_key=str(settings.ai.litellm_master_key))
    except (httpx.HTTPError, ValueError) as exc:
        raise AIModelCatalogUnavailableError(AI_MODEL_CATALOG_LITELLM_UNREACHABLE) from exc
    return _extract_model_ids(payload)


def _extract_model_ids(payload: dict[str, Any]) -> list[str]:
    data = payload.get("data")
    if not isinstance(data, list):
        raise AIModelCatalogUnavailableError(AI_MODEL_CATALOG_RESPONSE_INVALID)

    model_ids: list[str] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        model_id = item.get("id")
        if isinstance(model_id, str) and model_id.strip():
            model_ids.append(model_id.strip())
    return model_ids


async def _list_available_providers() -> set[str]:
    now = datetime.now(UTC)
    platform_providers = (
        await AIAPIKey
        .filter(
            owner_type=KeyOwnerType.PLATFORM,
            key_type=KeyType.VIRTUAL_KEY,
            is_active=True,
            virtual_key_enc__not_isnull=True,
        )
        .filter(Q(expires_at__gt=now) | Q(expires_at__isnull=True))
        .values("provider", "metadata_json")
    )
    return _system_provider_set(platform_providers)


def _system_provider_set(records: Iterable[dict[str, Any]]) -> set[str]:
    providers: set[str] = set()
    for record in records:
        provider = record.get("provider")
        metadata = record.get("metadata_json")
        if (
            isinstance(provider, str)
            and provider.strip()
            and isinstance(metadata, dict)
            and metadata.get("source") == SYSTEM_AI_PROVIDER_METADATA_SOURCE
        ):
            providers.add(provider.strip())
    return providers


def _visible_model_ids(
    model_ids: list[str],
    *,
    available_providers: set[str],
    mock_enabled: bool,
) -> list[str]:
    unique_ids = {
        model_id
        for model_id in model_ids
        if (mock_enabled or model_id != "mock") and _model_provider(model_id) in available_providers
    }
    ordered_known = [model_id for model_id in MODEL_ORDER if model_id in unique_ids]
    ordered_unknown = sorted(unique_ids.difference(ordered_known))
    return [*ordered_known, *ordered_unknown]


def _build_catalog_item(model_id: str) -> AIModelCatalogItem:
    metadata = MODEL_METADATA.get(model_id, {})
    provider = _model_provider(model_id)
    label = metadata.get("label") or model_id
    return AIModelCatalogItem(
        id=model_id,
        provider=provider,
        label=label,
        label_key=metadata.get("label_key"),
        description=metadata.get("description"),
        description_key=metadata.get("description_key"),
        available=True,
    )


def _model_provider(model_id: str) -> str:
    metadata = MODEL_METADATA.get(model_id)
    if metadata and metadata.get("provider"):
        return metadata["provider"]
    return detect_provider(model_id)
