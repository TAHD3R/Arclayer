from __future__ import annotations

from typing import Any
from uuid import UUID

import httpx

from src.config import Settings
from src.llm.litellm_client import LiteLLMClient
from src.models.agents.conversation import AgentConversationMode
from src.modules.ai.schema import AIModelCatalogItem, AIModelCatalogResponse, AIReasoningEffort
from src.modules.system.ai_providers.configuration import ConfiguredSystemModel, list_active_system_models

AI_MODEL_CATALOG_MASTER_KEY_REQUIRED = "AI_MODEL_CATALOG_MASTER_KEY_REQUIRED"
AI_MODEL_CATALOG_LITELLM_UNREACHABLE = "AI_MODEL_CATALOG_LITELLM_UNREACHABLE"
AI_MODEL_CATALOG_PROVIDER_CONFLICT = "AI_MODEL_CATALOG_PROVIDER_CONFLICT"
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
    default_mode: str | None = None,
    reasoning_effort: str | None = None,
) -> AIModelCatalogResponse:
    """Load the chat model catalog from LiteLLM and enrich it with product metadata."""
    if settings.ai.mock_enabled:
        items = [_mock_catalog_item()]
        resolved_default_model = "mock"
    else:
        if not settings.ai.litellm_master_key:
            raise AIModelCatalogUnavailableError(AI_MODEL_CATALOG_MASTER_KEY_REQUIRED)
        model_ids = await _list_litellm_model_ids(settings)
        configured_models = await list_active_system_models()
        _configured_models_by_public_name(configured_models)
        visible_models = _visible_models(
            model_ids,
            configured_models=configured_models,
        )
        items = [_build_catalog_item(item) for item in visible_models]
        resolved_default_model = next(
            (item.public_model for item in visible_models if item.is_default),
            None,
        )
    return AIModelCatalogResponse(
        default_model=resolved_default_model,
        default_mode=_resolve_default_mode(default_mode),
        reasoning_effort=_resolve_reasoning_effort(reasoning_effort),
        models=items,
    )


def _configured_models_by_public_name(
    configured_models: list[ConfiguredSystemModel],
) -> dict[str, ConfiguredSystemModel]:
    configured_by_model: dict[str, ConfiguredSystemModel] = {}
    conflicts: set[str] = set()
    for item in configured_models:
        if item.public_model in configured_by_model:
            conflicts.add(item.public_model)
        else:
            configured_by_model[item.public_model] = item
    if conflicts:
        raise AIModelCatalogUnavailableError(AI_MODEL_CATALOG_PROVIDER_CONFLICT)
    return configured_by_model


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


def _visible_models(
    model_ids: list[str],
    *,
    configured_models: list[ConfiguredSystemModel],
) -> list[ConfiguredSystemModel]:
    available_ids = set(model_ids)
    return [item for item in configured_models if item.public_model in available_ids]


def _build_catalog_item(
    configured: ConfiguredSystemModel,
) -> AIModelCatalogItem:
    return AIModelCatalogItem(
        id=configured.public_model,
        provider=configured.provider,
        label=configured.label,
        label_i18n=configured.label_i18n,
        description=configured.description,
        description_i18n=configured.description_i18n,
        provider_icon=configured.provider_icon,
        available=True,
    )


def _mock_catalog_item() -> AIModelCatalogItem:
    return AIModelCatalogItem(
        id="mock",
        provider="mock",
        label="Mock",
        description="Local development mock model",
        provider_icon=None,
        available=True,
    )
