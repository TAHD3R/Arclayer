from __future__ import annotations

import hashlib
from typing import Any, cast
from uuid import UUID

import httpx
from pydantic import BaseModel, ConfigDict

from src.common.types.json_types import JsonObject
from src.config import Settings
from src.core.exceptions import BadRequest, NotFound
from src.core.i18n import t
from src.core.services import BaseService
from src.llm.keys import encrypt_virtual_key
from src.llm.litellm_client import LiteLLMClient
from src.llm.runtime import _resolve_key_path
from src.models.ai.ai_api_key import AIAPIKey, KeyOwnerType, KeyType
from src.modules.system.ai_providers.schema import (
    AIProviderKind,
    SystemAIProviderCreateRequest,
    SystemAIProviderOut,
    SystemAIProviderUpdateRequest,
)

PLATFORM_OWNER_ID = UUID(int=0)
LITELLM_PROVIDER_PREFIXES: dict[str, str] = {
    "openai": "openai",
    "openai_compatible": "openai",
    "anthropic": "anthropic",
    "anthropic_compatible": "anthropic",
    "deepseek": "deepseek",
}


def _ts(key: str, default: str) -> str:
    return t("settings", key, default=default)


def _te(key: str) -> str:
    return t("errors", key)


class SystemAIProviderService(BaseService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.settings = settings

    async def list_providers(self) -> list[SystemAIProviderOut]:
        records = await self._base_query().order_by("provider", "created_at")
        return [self._to_out(record) for record in records]

    async def create_provider(self, payload: SystemAIProviderCreateRequest) -> SystemAIProviderOut:
        provisioned = await self._provision_litellm_access(
            provider=payload.provider,
            label=payload.label,
            compatibility=payload.compatibility,
            provider_api_key=payload.provider_api_key,
            base_url=payload.base_url,
            request_model=payload.request_model,
        )
        encrypted = self._encrypt_virtual_key(provisioned.virtual_key)
        record = await AIAPIKey.create(
            owner_type=KeyOwnerType.PLATFORM,
            owner_id=PLATFORM_OWNER_ID,
            key_type=KeyType.VIRTUAL_KEY,
            provider=payload.provider.strip(),
            litellm_key_id=provisioned.litellm_key_id,
            key_hash=_hash_key(provisioned.virtual_key),
            virtual_key_enc=encrypted,
            expires_at=payload.expires_at,
            metadata_json=self._metadata(
                label=payload.label,
                compatibility=payload.compatibility,
                base_url=payload.base_url,
                request_model=payload.request_model,
            ),
        )
        return self._to_out(record)

    async def update_provider(
        self,
        provider_id: UUID,
        payload: SystemAIProviderUpdateRequest,
    ) -> SystemAIProviderOut:
        record = await self._get_provider(provider_id)
        metadata = self._record_metadata(record)
        current_base_url = _clean_optional(metadata.get("base_url"))
        current_request_model = _clean_required(metadata.get("request_model")) or record.provider

        if payload.label is not None:
            metadata["label"] = payload.label.strip()
        if payload.compatibility is not None:
            metadata["compatibility"] = payload.compatibility
        if "request_model" in payload.model_fields_set:
            metadata["request_model"] = _clean_required(payload.request_model)
        if "base_url" in payload.model_fields_set:
            metadata["base_url"] = _clean_optional(payload.base_url)
        if payload.provider_api_key is not None:
            label = _clean_required(metadata.get("label")) or record.provider
            compatibility = _clean_required(metadata.get("compatibility")) or "openai_compatible"
            request_model = _clean_required(metadata.get("request_model")) or record.provider
            provisioned = await self._provision_litellm_access(
                provider=record.provider,
                label=label,
                compatibility=compatibility,
                provider_api_key=payload.provider_api_key,
                base_url=_clean_optional(metadata.get("base_url")),
                request_model=request_model,
            )
            record.virtual_key_enc = self._encrypt_virtual_key(provisioned.virtual_key)
            record.key_hash = _hash_key(provisioned.virtual_key)
            record.litellm_key_id = provisioned.litellm_key_id
        elif (
            _clean_required(metadata.get("request_model")) != current_request_model
            or _clean_optional(metadata.get("base_url")) != current_base_url
        ):
            raise BadRequest(
                message=_te("AI_PROVIDER_API_KEY_REQUIRED_FOR_LITELLM_UPDATE"),
                error="AI_PROVIDER_API_KEY_REQUIRED_FOR_LITELLM_UPDATE",
            )
        if payload.is_active is not None:
            record.is_active = payload.is_active
        if "expires_at" in payload.model_fields_set:
            record.expires_at = payload.expires_at

        record.metadata_json = metadata
        await record.save()
        return self._to_out(record)

    async def delete_provider(self, provider_id: UUID) -> None:
        record = await self._get_provider(provider_id)
        record.is_active = False
        await record.save(update_fields=["is_active", "updated_at"])

    async def _get_provider(self, provider_id: UUID) -> AIAPIKey:
        record = await self._base_query().filter(id=provider_id).first()
        if record is None:
            raise NotFound(
                message=_ts("AI_PROVIDER_NOT_FOUND", "AI Provider 不存在"),
                error="AI_PROVIDER_NOT_FOUND",
            )
        return record

    @staticmethod
    def _base_query():
        return AIAPIKey.filter(
            owner_type=KeyOwnerType.PLATFORM,
            owner_id=PLATFORM_OWNER_ID,
            key_type=KeyType.VIRTUAL_KEY,
        )

    def _encrypt_virtual_key(self, value: str) -> str:
        if self.settings.ai.master_key_path is None:
            raise BadRequest(
                message=_ts(
                    "AI_PROVIDER_MASTER_KEY_REQUIRED",
                    "AI__MASTER_KEY_PATH 未配置，无法保存 Provider 密钥。",
                ),
                error="AI_PROVIDER_MASTER_KEY_REQUIRED",
            )
        return encrypt_virtual_key(value.strip(), _resolve_key_path(self.settings.ai.master_key_path))

    @staticmethod
    def _metadata(
        *,
        label: str,
        compatibility: str,
        base_url: str | None,
        request_model: str,
    ) -> JsonObject:
        return {
            "label": label.strip(),
            "compatibility": compatibility,
            "base_url": _clean_optional(base_url),
            "request_model": request_model.strip(),
            "source": "system.ai_providers",
        }

    @staticmethod
    def _record_metadata(record: AIAPIKey) -> JsonObject:
        metadata = record.metadata_json if isinstance(record.metadata_json, dict) else {}
        return cast(JsonObject, dict(metadata))

    def _to_out(self, record: AIAPIKey) -> SystemAIProviderOut:
        metadata = self._record_metadata(record)
        compatibility = metadata.get("compatibility")
        label = metadata.get("label")
        compatibility_value: AIProviderKind = (
            cast(AIProviderKind, compatibility)
            if compatibility in {"openai", "anthropic", "deepseek", "openai_compatible", "anthropic_compatible"}
            else "openai_compatible"
        )
        return SystemAIProviderOut(
            id=record.id,
            provider=record.provider,
            label=str(label).strip() if isinstance(label, str) and label.strip() else record.provider,
            compatibility=compatibility_value,
            is_active=bool(record.is_active),
            has_virtual_key=bool(record.virtual_key_enc),
            litellm_key_id=record.litellm_key_id,
            base_url=_clean_optional(metadata.get("base_url")),
            request_model=_clean_required(metadata.get("request_model")) or record.provider,
            created_at=record.created_at,
            updated_at=record.updated_at,
            last_used_at=record.last_used_at,
            expires_at=record.expires_at,
        )

    async def _provision_litellm_access(
        self,
        *,
        provider: str,
        label: str,
        compatibility: str,
        provider_api_key: str,
        base_url: str | None,
        request_model: str,
    ) -> _ProvisionedLiteLLMAccess:
        if not self.settings.ai.litellm_master_key:
            raise BadRequest(
                message=_te("AI_PROVIDER_LITELLM_MASTER_KEY_REQUIRED"),
                error="AI_PROVIDER_LITELLM_MASTER_KEY_REQUIRED",
            )

        model = request_model.strip()
        provider_model = _litellm_provider_model(compatibility=compatibility, model=model)
        client = LiteLLMClient(
            base_url=self.settings.ai.litellm_base_url,
            timeout_seconds=self.settings.ai.litellm_timeout_seconds,
        )
        metadata = {
            "provider": provider.strip(),
            "label": label.strip(),
            "compatibility": compatibility,
            "source": "system.ai_providers",
        }
        try:
            await client.register_model(
                master_key=str(self.settings.ai.litellm_master_key),
                model_name=model,
                provider_model=provider_model,
                provider_api_key=provider_api_key.strip(),
                api_base=_clean_optional(base_url),
                metadata=metadata,
            )
            key_payload = await client.generate_key(
                master_key=str(self.settings.ai.litellm_master_key),
                models=[model],
                metadata=metadata,
            )
        except (httpx.HTTPError, ValueError) as exc:
            raise BadRequest(
                message=_te("AI_PROVIDER_LITELLM_PROVISION_FAILED"),
                error="AI_PROVIDER_LITELLM_PROVISION_FAILED",
            ) from exc

        virtual_key = _read_litellm_virtual_key(key_payload)
        litellm_key_id = _read_litellm_key_id(key_payload)
        return _ProvisionedLiteLLMAccess(virtual_key=virtual_key, litellm_key_id=litellm_key_id)


def _hash_key(virtual_key: str) -> str:
    return hashlib.sha256(virtual_key.strip().encode("utf-8")).hexdigest()


def _litellm_provider_model(*, compatibility: str, model: str) -> str:
    if "/" in model:
        return model
    prefix = LITELLM_PROVIDER_PREFIXES.get(compatibility)
    return f"{prefix}/{model}" if prefix else model


def _clean_optional(value: object) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def _clean_required(value: object) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def _read_litellm_virtual_key(payload: dict[str, Any]) -> str:
    for key in ("key", "token", "virtual_key"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    raise BadRequest(
        message=_ts(
            "AI_PROVIDER_LITELLM_KEY_MISSING",
            "LiteLLM 未返回可保存的 virtual key。",
        ),
        error="AI_PROVIDER_LITELLM_KEY_MISSING",
    )


def _read_litellm_key_id(payload: dict[str, Any]) -> str | None:
    for key in ("key_id", "token_id", "id"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


class _ProvisionedLiteLLMAccess(BaseModel):
    model_config = ConfigDict(frozen=True)

    virtual_key: str
    litellm_key_id: str | None
