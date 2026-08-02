from __future__ import annotations

import hashlib
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any, Literal, cast
from uuid import UUID

import httpx
from cryptography.fernet import InvalidToken
from pydantic import BaseModel, ConfigDict

from src.common.types.json_types import JsonObject
from src.config import Settings
from src.core.exceptions import BadRequest, Conflict, NotFound
from src.core.i18n import t
from src.core.services import BaseService, ServiceContractError
from src.llm.keys import encrypt_virtual_key
from src.llm.litellm_client import LiteLLMClient
from src.llm.runtime import LLMRuntimeError, _resolve_key_path
from src.models.ai.ai_api_key import AIAPIKey, KeyOwnerType, KeyType
from src.modules.system.ai_providers.schema import (
    AIProviderKind,
    SystemAIProviderAvailabilityPreviewOut,
    SystemAIProviderCreateRequest,
    SystemAIProviderOut,
    SystemAIProviderReadinessTestOut,
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
    def __init__(
        self,
        settings: Settings,
        *,
        activity_writer: Callable[..., Awaitable[object]] | None = None,
    ) -> None:
        super().__init__(settings)
        self.settings = settings
        self._activity_writer = activity_writer

    async def list_providers(self) -> list[SystemAIProviderOut]:
        records = await self._base_query().order_by("provider", "created_at")
        return [self._to_out(record) for record in records]

    async def create_provider(
        self,
        payload: SystemAIProviderCreateRequest,
        *,
        actor_user_id: UUID,
    ) -> SystemAIProviderOut:
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
        await self._write_audit(
            event_name="platform.ai_provider.connected",
            actor_user_id=actor_user_id,
            provider=record,
            properties={"provider": record.provider, "request_model": payload.request_model.strip()},
        )
        return self._to_out(record)

    async def update_provider(
        self,
        provider_id: UUID,
        payload: SystemAIProviderUpdateRequest,
        *,
        actor_user_id: UUID,
    ) -> SystemAIProviderOut:
        record = await self._get_provider(provider_id)
        metadata = self._record_metadata(record)

        if payload.provider_api_key is not None:
            self._raise_credential_revocation_port_unavailable()
        if payload.is_active is not None:
            raise Conflict(
                message=_te("AI_PROVIDER_AVAILABILITY_PREVIEW_REQUIRED"),
                error="AI_PROVIDER_AVAILABILITY_PREVIEW_REQUIRED",
            )
        if (
            payload.compatibility is not None
            or "request_model" in payload.model_fields_set
            or "base_url" in payload.model_fields_set
        ):
            self._raise_credential_revocation_port_unavailable()

        if payload.label is not None:
            metadata["label"] = payload.label.strip()
        if "expires_at" in payload.model_fields_set:
            record.expires_at = payload.expires_at

        record.metadata_json = metadata
        await record.save()
        await self._write_audit(
            event_name="platform.ai_provider.updated",
            actor_user_id=actor_user_id,
            provider=record,
            properties={
                "label_changed": payload.label is not None,
                "expires_at_changed": "expires_at" in payload.model_fields_set,
            },
        )
        return self._to_out(record)

    async def delete_provider(self, provider_id: UUID, *, actor_user_id: UUID) -> None:
        record = await self._get_provider(provider_id)
        record.is_active = False
        await record.save(update_fields=["is_active", "updated_at"])
        await self._write_audit(
            event_name="platform.ai_provider.disabled",
            actor_user_id=actor_user_id,
            provider=record,
            properties={"desired_is_active": False},
        )

    async def preview_availability(
        self,
        *,
        provider_id: UUID,
        is_active: bool,
    ) -> SystemAIProviderAvailabilityPreviewOut:
        provider = await self._get_provider(provider_id)
        providers = await self._base_query().all()
        now = datetime.now(UTC)
        before = sum(self._is_routable(item, now=now) for item in providers)
        after = (
            before
            - int(self._is_routable(provider, now=now))
            + int(self._is_routable(provider, now=now, desired_is_active=is_active))
        )
        return SystemAIProviderAvailabilityPreviewOut(
            id=provider.id,
            desired_is_active=is_active,
            routable_provider_count_before=before,
            routable_provider_count_after=after,
            would_leave_no_routable_provider=after == 0,
            revision=self._availability_revision(provider=provider, desired_is_active=is_active),
        )

    async def apply_availability(
        self,
        *,
        provider_id: UUID,
        is_active: bool,
        preview_revision: str,
        actor_user_id: UUID,
    ) -> SystemAIProviderOut:
        preview = await self.preview_availability(provider_id=provider_id, is_active=is_active)
        if preview.revision != preview_revision:
            raise Conflict(
                message=_te("AI_PROVIDER_AVAILABILITY_PREVIEW_STALE"),
                error="AI_PROVIDER_AVAILABILITY_PREVIEW_STALE",
            )
        provider = await self._get_provider(provider_id)
        provider.is_active = is_active
        await provider.save(update_fields=["is_active", "updated_at"])
        await self._write_audit(
            event_name="platform.ai_provider.availability_changed",
            actor_user_id=actor_user_id,
            provider=provider,
            properties={
                "desired_is_active": is_active,
                "routable_provider_count_after": preview.routable_provider_count_after,
                "would_leave_no_routable_provider": preview.would_leave_no_routable_provider,
            },
        )
        return self._to_out(provider)

    async def test_readiness(
        self,
        *,
        provider_id: UUID,
        actor_user_id: UUID,
    ) -> SystemAIProviderReadinessTestOut:
        provider = await self._get_provider(provider_id)
        checked_at = datetime.now(UTC)
        failure_code: str | None = None
        status: Literal["healthy", "unhealthy"] = "healthy"
        try:
            virtual_key = self._decrypt_virtual_key(provider)
            model = _clean_required(self._record_metadata(provider).get("request_model")) or provider.provider
            client = LiteLLMClient(
                base_url=self.settings.ai.litellm_base_url,
                timeout_seconds=self.settings.ai.litellm_timeout_seconds,
            )
            await client.chat(
                [{"role": "user", "content": "Respond with OK."}],
                model=model,
                temperature=0,
                max_tokens=1,
                virtual_key=virtual_key,
            )
        except (httpx.HTTPError, InvalidToken, LLMRuntimeError, ValueError):
            status = "unhealthy"
            failure_code = "AI_PROVIDER_READINESS_TEST_FAILED"

        metadata = self._record_metadata(provider)
        metadata["readiness"] = {
            "status": status,
            "checked_at": checked_at.isoformat(),
            "failure_code": failure_code,
        }
        provider.metadata_json = metadata
        await provider.save(update_fields=["metadata_json", "updated_at"])
        await self._write_audit(
            event_name="platform.ai_provider.readiness_tested",
            actor_user_id=actor_user_id,
            provider=provider,
            properties={"status": status, "failure_code": failure_code},
        )
        return SystemAIProviderReadinessTestOut(
            id=provider.id,
            status=status,
            checked_at=checked_at,
            failure_code=failure_code,
        )

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
        readiness = metadata.get("readiness")
        readiness_status: Literal["unknown", "healthy", "unhealthy"] = "unknown"
        readiness_checked_at: datetime | None = None
        readiness_failure_code: str | None = None
        if isinstance(readiness, dict):
            raw_status = readiness.get("status")
            if raw_status in {"healthy", "unhealthy"}:
                readiness_status = cast(Literal["healthy", "unhealthy"], raw_status)
            raw_checked_at = readiness.get("checked_at")
            if isinstance(raw_checked_at, str):
                try:
                    readiness_checked_at = datetime.fromisoformat(raw_checked_at)
                except ValueError:
                    readiness_status = "unknown"
            raw_failure_code = readiness.get("failure_code")
            readiness_failure_code = raw_failure_code if isinstance(raw_failure_code, str) else None
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
            readiness_status=readiness_status,
            readiness_checked_at=readiness_checked_at,
            readiness_failure_code=readiness_failure_code,
        )

    def _decrypt_virtual_key(self, record: AIAPIKey) -> str:
        if not record.virtual_key_enc:
            raise ValueError("AI provider has no configured virtual key")
        from src.llm.keys import decrypt_virtual_key

        if self.settings.ai.master_key_path is None:
            raise ValueError("AI provider master key path is not configured")
        return decrypt_virtual_key(record.virtual_key_enc, _resolve_key_path(self.settings.ai.master_key_path))

    def _is_routable(
        self,
        provider: AIAPIKey,
        *,
        now: datetime,
        desired_is_active: bool | None = None,
    ) -> bool:
        active = provider.is_active if desired_is_active is None else desired_is_active
        readiness = self._record_metadata(provider).get("readiness")
        return (
            active
            and bool(provider.virtual_key_enc)
            and (provider.expires_at is None or provider.expires_at > now)
            and isinstance(readiness, dict)
            and readiness.get("status") == "healthy"
        )

    @staticmethod
    def _availability_revision(*, provider: AIAPIKey, desired_is_active: bool) -> str:
        material = f"{provider.id}:{provider.updated_at.isoformat()}:{desired_is_active}"
        return hashlib.sha256(material.encode("utf-8")).hexdigest()

    async def _write_audit(
        self,
        *,
        event_name: str,
        actor_user_id: UUID,
        provider: AIAPIKey,
        properties: JsonObject,
    ) -> None:
        if self._activity_writer is None:
            raise ServiceContractError("AI provider mutations require an activity audit writer")
        from src.modules.analytics.audit import ActivityAuditPayload

        await self._activity_writer(
            settings=self.settings,
            payload=ActivityAuditPayload(
                event_name=event_name,
                actor_user_id=actor_user_id,
                entity_type="ai_provider",
                entity_id=provider.id,
                source="api",
                properties=properties,
            ),
        )

    @staticmethod
    def _raise_credential_revocation_port_unavailable() -> None:
        raise Conflict(
            message=_te("AI_PROVIDER_CREDENTIAL_REVOCATION_PORT_UNAVAILABLE"),
            error="AI_PROVIDER_CREDENTIAL_REVOCATION_PORT_UNAVAILABLE",
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
