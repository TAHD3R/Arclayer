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
from src.models.ai.user_key_grant import UserKeyWorkspaceGrant, is_grant_active
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


class AIModelCatalogUnavailableError(Exception):
    """Raised when the model catalog cannot be loaded from LiteLLM."""


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
            raise AIModelCatalogUnavailableError("AI__LITELLM_MASTER_KEY is required to list LiteLLM models")
        model_ids = await _list_litellm_model_ids(settings)
        available_providers = await _list_available_providers(
            workspace_id=workspace_id,
            user_id=user_id,
            allow_platform_key=settings.ai.allow_platform_key,
        )

    visible_model_ids = _visible_model_ids(
        model_ids,
        available_providers=available_providers,
        mock_enabled=settings.ai.mock_enabled,
    )
    if not visible_model_ids:
        raise AIModelCatalogUnavailableError("No selectable AI models are configured for this workspace")

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
        raise AIModelCatalogUnavailableError("Failed to load LiteLLM model catalog") from exc
    return _extract_model_ids(payload)


def _extract_model_ids(payload: dict[str, Any]) -> list[str]:
    data = payload.get("data")
    if not isinstance(data, list):
        raise AIModelCatalogUnavailableError("LiteLLM model catalog response is malformed")

    model_ids: list[str] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        model_id = item.get("id")
        if isinstance(model_id, str) and model_id.strip():
            model_ids.append(model_id.strip())
    return model_ids


async def _list_available_providers(
    *,
    workspace_id: UUID,
    user_id: UUID,
    allow_platform_key: bool,
) -> set[str]:
    now = datetime.now(UTC)
    workspace_providers = (
        await AIAPIKey
        .filter(
            owner_type=KeyOwnerType.WORKSPACE,
            owner_id=workspace_id,
            key_type=KeyType.VIRTUAL_KEY,
            is_active=True,
            virtual_key_enc__not_isnull=True,
        )
        .filter(Q(expires_at__gt=now) | Q(expires_at__isnull=True))
        .values_list("provider", flat=True)
    )
    providers = _provider_set(workspace_providers)

    grants = await UserKeyWorkspaceGrant.filter(workspace_id=workspace_id, user_id=user_id).all()
    granted_key_ids = [
        grant.api_key_id for grant in grants if is_grant_active(grant.approval_state) and grant.revoked_at is None
    ]
    if granted_key_ids:
        user_providers = (
            await AIAPIKey
            .filter(
                id__in=granted_key_ids,
                owner_type=KeyOwnerType.USER,
                owner_id=user_id,
                key_type=KeyType.VIRTUAL_KEY,
                is_active=True,
                virtual_key_enc__not_isnull=True,
            )
            .filter(Q(expires_at__gt=now) | Q(expires_at__isnull=True))
            .values_list("provider", flat=True)
        )
        providers.update(_provider_set(user_providers))

    if allow_platform_key:
        platform_providers = (
            await AIAPIKey
            .filter(
                owner_type=KeyOwnerType.PLATFORM,
                key_type=KeyType.VIRTUAL_KEY,
                is_active=True,
                virtual_key_enc__not_isnull=True,
            )
            .filter(Q(expires_at__gt=now) | Q(expires_at__isnull=True))
            .values_list("provider", flat=True)
        )
        providers.update(_provider_set(platform_providers))

    return providers


def _provider_set(values: Iterable[object]) -> set[str]:
    return {value.strip() for value in values if isinstance(value, str) and value.strip()}


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
