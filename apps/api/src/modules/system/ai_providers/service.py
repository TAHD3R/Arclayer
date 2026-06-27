from __future__ import annotations

import hashlib
from typing import cast
from uuid import UUID

from src.common.types.json_types import JsonObject
from src.config import Settings
from src.core.exceptions import BadRequest, NotFound
from src.core.i18n import t
from src.core.services import BaseService
from src.llm.keys import encrypt_virtual_key
from src.llm.runtime import _resolve_key_path
from src.models.ai.ai_api_key import AIAPIKey, KeyOwnerType, KeyType
from src.modules.system.ai_providers.schema import (
    AIProviderKind,
    SystemAIProviderCreateRequest,
    SystemAIProviderOut,
    SystemAIProviderUpdateRequest,
)

PLATFORM_OWNER_ID = UUID(int=0)


def _ts(key: str, default: str) -> str:
    return t("settings", key, default=default)


class SystemAIProviderService(BaseService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.settings = settings

    async def list_providers(self) -> list[SystemAIProviderOut]:
        records = await self._base_query().order_by("provider", "created_at")
        return [self._to_out(record) for record in records]

    async def create_provider(self, payload: SystemAIProviderCreateRequest) -> SystemAIProviderOut:
        encrypted = self._encrypt_virtual_key(payload.virtual_key)
        record = await AIAPIKey.create(
            owner_type=KeyOwnerType.PLATFORM,
            owner_id=PLATFORM_OWNER_ID,
            key_type=KeyType.VIRTUAL_KEY,
            provider=payload.provider.strip(),
            litellm_key_id=_clean_optional(payload.litellm_key_id),
            key_hash=_hash_key(payload.virtual_key),
            virtual_key_enc=encrypted,
            expires_at=payload.expires_at,
            metadata_json=self._metadata(
                label=payload.label,
                compatibility=payload.compatibility,
                base_url=payload.base_url,
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

        if payload.label is not None:
            metadata["label"] = payload.label.strip()
        if payload.compatibility is not None:
            metadata["compatibility"] = payload.compatibility
        if "base_url" in payload.model_fields_set:
            metadata["base_url"] = _clean_optional(payload.base_url)
        if "litellm_key_id" in payload.model_fields_set:
            record.litellm_key_id = _clean_optional(payload.litellm_key_id)
        if payload.virtual_key is not None:
            record.virtual_key_enc = self._encrypt_virtual_key(payload.virtual_key)
            record.key_hash = _hash_key(payload.virtual_key)
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
    def _metadata(*, label: str, compatibility: str, base_url: str | None) -> JsonObject:
        return {
            "label": label.strip(),
            "compatibility": compatibility,
            "base_url": _clean_optional(base_url),
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
            created_at=record.created_at,
            updated_at=record.updated_at,
            last_used_at=record.last_used_at,
            expires_at=record.expires_at,
        )


def _hash_key(virtual_key: str) -> str:
    return hashlib.sha256(virtual_key.strip().encode("utf-8")).hexdigest()


def _clean_optional(value: object) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None
