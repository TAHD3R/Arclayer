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
from src.common.utils.ids import uuid7
from src.config import Settings
from src.core.exceptions import BadRequest, Conflict, NotFound
from src.core.i18n import t
from src.core.services import BaseService, ServiceContractError
from src.llm.keys import decrypt_virtual_key, encrypt_virtual_key
from src.llm.litellm_client import LiteLLMClient
from src.llm.runtime import LLMRuntimeError, _resolve_key_path
from src.models.ai.ai_api_key import AIAPIKey, KeyOwnerType, KeyType
from src.modules.ai.provider_icon import AIProviderIcon
from src.modules.system.ai_providers.configuration import (
    PLATFORM_OWNER_ID,
    SYSTEM_AI_PROVIDER_METADATA_SOURCE,
    billing_config_from_metadata,
    default_model_from_metadata,
    model_mappings_from_metadata,
    provider_icon_from_metadata,
)
from src.modules.system.ai_providers.schema import (
    AIProviderKind,
    SystemAIProviderAvailabilityPreviewOut,
    SystemAIProviderBillingConfig,
    SystemAIProviderCreateRequest,
    SystemAIProviderModelMapping,
    SystemAIProviderOut,
    SystemAIProviderReadinessTestOut,
    SystemAIProviderTestConfig,
    SystemAIProviderUpdateRequest,
)

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
        await self._assert_public_model_aliases_available(payload.model_mappings)
        provider_id = uuid7()
        provisioned = await self._provision_litellm_access(
            provider_id=provider_id,
            provider=payload.provider,
            label=payload.label,
            compatibility=payload.compatibility,
            auth_header=payload.auth_header,
            provider_api_key=payload.provider_api_key,
            base_url=payload.base_url,
            model_mappings=payload.model_mappings,
        )
        try:
            encrypted = self._encrypt_virtual_key(provisioned.virtual_key)
            record = await AIAPIKey.create(
                id=provider_id,
                owner_type=KeyOwnerType.PLATFORM,
                owner_id=PLATFORM_OWNER_ID,
                key_type=KeyType.VIRTUAL_KEY,
                provider=payload.provider.strip(),
                litellm_key_id=provisioned.litellm_key_id,
                key_hash=_hash_key(provisioned.virtual_key),
                virtual_key_enc=encrypted,
                provider_api_key_enc=self._encrypt_provider_api_key(payload.provider_api_key),
                expires_at=payload.expires_at,
                metadata_json=self._metadata(
                    label=payload.label,
                    icon=payload.icon,
                    note=payload.note,
                    website_url=payload.website_url,
                    compatibility=payload.compatibility,
                    auth_header=payload.auth_header,
                    base_url=payload.base_url,
                    model_mappings=payload.model_mappings,
                    default_model=payload.default_model,
                    test_config=payload.test_config,
                    billing_config=payload.billing_config,
                    registered_model_ids=provisioned.registered_model_ids,
                    generation_id=provisioned.generation_id,
                ),
            )
        except BaseException:
            await self._cleanup_litellm_access(
                virtual_key=provisioned.virtual_key,
                registered_model_ids=provisioned.registered_model_ids,
            )
            raise
        await self._write_audit(
            event_name="platform.ai_provider.connected",
            actor_user_id=actor_user_id,
            provider=record,
            properties={
                "provider": record.provider,
                "models": [item.public_model for item in payload.model_mappings],
                "default_model": payload.default_model.strip(),
            },
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
        if payload.is_active is not None:
            raise Conflict(
                message=_te("AI_PROVIDER_AVAILABILITY_PREVIEW_REQUIRED"),
                error="AI_PROVIDER_AVAILABILITY_PREVIEW_REQUIRED",
            )
        fields = payload.model_fields_set
        configuration_changed = bool(fields - {"is_archived", "expires_at"})
        connection_changed = False
        cleanup_required = False
        if configuration_changed:
            current = self._configuration(record)
            updated = self._updated_configuration(current=current, payload=payload)
            if updated.is_archived and record.is_active:
                raise Conflict(
                    message=_te("AI_PROVIDER_ARCHIVE_REQUIRES_DISABLED"),
                    error="AI_PROVIDER_ARCHIVE_REQUIRES_DISABLED",
                )
            if current.model_mappings != updated.model_mappings:
                await self._assert_public_model_aliases_available(
                    updated.model_mappings,
                    exclude_provider_id=record.id,
                )
            connection_changed = self._connection_changed(current=current, updated=updated)
            provider_api_key = payload.provider_api_key
            if connection_changed and provider_api_key is None:
                provider_api_key = self._stored_provider_api_key(record)
            if provider_api_key is not None:
                cleanup_required = await self._replace_litellm_access(
                    record=record,
                    configuration=updated,
                    provider_api_key=provider_api_key,
                )
            else:
                previous_metadata = self._record_metadata(record)
                record.provider = updated.provider
                record.metadata_json = self._metadata_from_configuration(
                    updated,
                    registered_model_ids=self._registered_model_ids(previous_metadata),
                    generation_id=self._generation_id(previous_metadata),
                    pending_cleanup=self._pending_cleanup(previous_metadata),
                    previous_metadata=previous_metadata,
                )
        else:
            if payload.is_archived is True and record.is_active:
                raise Conflict(
                    message=_te("AI_PROVIDER_ARCHIVE_REQUIRES_DISABLED"),
                    error="AI_PROVIDER_ARCHIVE_REQUIRES_DISABLED",
                )
            if "is_archived" in fields:
                # Lifecycle changes must preserve legacy provider metadata instead of
                # materializing an invalid empty model configuration.
                metadata = self._record_metadata(record)
                metadata["archived_at"] = datetime.now(UTC).isoformat() if payload.is_archived else None
                record.metadata_json = metadata
        if "expires_at" in fields:
            record.expires_at = payload.expires_at
        await record.save()
        await self._write_audit(
            event_name="platform.ai_provider.updated",
            actor_user_id=actor_user_id,
            provider=record,
            properties={
                "label_changed": payload.label is not None,
                "connection_changed": connection_changed,
                "models_changed": payload.model_mappings is not None,
                "default_model_changed": payload.default_model is not None,
                "archived_changed": payload.is_archived is not None,
                "expires_at_changed": "expires_at" in fields,
                "cleanup_required": cleanup_required,
            },
        )
        if cleanup_required:
            raise Conflict(
                message=_te("AI_PROVIDER_UPDATED_CLEANUP_REQUIRED"),
                error="AI_PROVIDER_UPDATED_CLEANUP_REQUIRED",
            )
        return self._to_out(record)

    async def delete_provider(self, provider_id: UUID, *, actor_user_id: UUID) -> None:
        record = await self._get_provider(provider_id)
        metadata = self._record_metadata(record)
        if record.is_active or not metadata.get("archived_at"):
            raise Conflict(
                message=_te("AI_PROVIDER_DELETE_REQUIRES_ARCHIVE"),
                error="AI_PROVIDER_DELETE_REQUIRES_ARCHIVE",
            )
        if not await self._retry_pending_cleanup(record):
            raise Conflict(
                message=_te("AI_PROVIDER_UPDATED_CLEANUP_REQUIRED"),
                error="AI_PROVIDER_UPDATED_CLEANUP_REQUIRED",
            )
        metadata = self._record_metadata(record)
        registered_model_ids = self._registered_model_ids(metadata)
        if not registered_model_ids:
            registered_model_ids = await self._discover_provider_model_ids(
                provider_id=record.id,
                generation_id=self._generation_id(metadata),
            )
        await self._cleanup_litellm_access(
            virtual_key=self._decrypt_virtual_key(record),
            registered_model_ids=registered_model_ids,
        )
        await self._write_audit(
            event_name="platform.ai_provider.deleted",
            actor_user_id=actor_user_id,
            provider=record,
            properties={"provider": record.provider},
        )
        await record.delete()

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
        if is_active and self._record_metadata(provider).get("archived_at"):
            raise Conflict(
                message=_te("AI_PROVIDER_ARCHIVED_CANNOT_ENABLE"),
                error="AI_PROVIDER_ARCHIVED_CANNOT_ENABLE",
            )
        if is_active:
            await self._assert_public_model_aliases_available(
                self._configuration(provider).model_mappings,
                exclude_provider_id=provider.id,
            )
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
            configuration = self._configuration(provider)
            test_config = configuration.test_config
            client = LiteLLMClient(
                base_url=self.settings.ai.litellm_base_url,
                timeout_seconds=self.settings.ai.litellm_timeout_seconds,
            )
            response = await client.chat(
                [{"role": "user", "content": test_config.prompt}],
                model=configuration.default_model,
                temperature=0,
                max_tokens=test_config.max_tokens,
                virtual_key=virtual_key,
                **_readiness_provider_params(
                    provider=configuration.provider,
                    compatibility=configuration.compatibility,
                ),
            )
            content = _read_chat_content(response)
            if test_config.expected_text and (content is None or test_config.expected_text not in content):
                status = "unhealthy"
                failure_code = "AI_PROVIDER_READINESS_RESPONSE_MISMATCH"
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

    def _encrypt_provider_api_key(self, value: str) -> str:
        if self.settings.ai.master_key_path is None:
            raise BadRequest(
                message=_ts(
                    "AI_PROVIDER_MASTER_KEY_REQUIRED",
                    "AI__MASTER_KEY_PATH 未配置，无法保存 Provider 密钥。",
                ),
                error="AI_PROVIDER_MASTER_KEY_REQUIRED",
            )
        return encrypt_virtual_key(value.strip(), _resolve_key_path(self.settings.ai.master_key_path))

    def _stored_provider_api_key(self, record: AIAPIKey) -> str:
        encrypted = getattr(record, "provider_api_key_enc", None)
        if not isinstance(encrypted, str) or not encrypted:
            raise BadRequest(
                message=_te("AI_PROVIDER_STORED_API_KEY_UNAVAILABLE"),
                error="AI_PROVIDER_STORED_API_KEY_UNAVAILABLE",
            )
        if self.settings.ai.master_key_path is None:
            raise BadRequest(
                message=_te("AI_PROVIDER_STORED_API_KEY_UNAVAILABLE"),
                error="AI_PROVIDER_STORED_API_KEY_UNAVAILABLE",
            )
        try:
            return decrypt_virtual_key(encrypted, _resolve_key_path(self.settings.ai.master_key_path))
        except (InvalidToken, LLMRuntimeError, ValueError) as exc:
            raise BadRequest(
                message=_te("AI_PROVIDER_STORED_API_KEY_UNAVAILABLE"),
                error="AI_PROVIDER_STORED_API_KEY_UNAVAILABLE",
            ) from exc

    @staticmethod
    def _metadata(
        *,
        label: str,
        icon: AIProviderIcon | None,
        note: str | None,
        website_url: str | None,
        compatibility: str,
        auth_header: str,
        base_url: str | None,
        model_mappings: list[SystemAIProviderModelMapping],
        default_model: str,
        test_config: SystemAIProviderTestConfig,
        billing_config: SystemAIProviderBillingConfig,
        registered_model_ids: dict[str, str],
        generation_id: str | None = None,
        pending_cleanup: _PendingLiteLLMCleanup | None = None,
        archived_at: str | None = None,
    ) -> JsonObject:
        return {
            "label": label.strip(),
            "icon": icon.model_dump(mode="json") if icon else None,
            "note": _clean_optional(note),
            "website_url": _clean_optional(website_url),
            "compatibility": compatibility,
            "auth_header": auth_header.strip(),
            "base_url": _clean_optional(base_url),
            "model_mappings": [item.model_dump(mode="json") for item in model_mappings],
            "default_model": default_model.strip(),
            "test_config": test_config.model_dump(mode="json"),
            "billing_config": billing_config.model_dump(mode="json"),
            "registered_model_ids": registered_model_ids,
            "generation_id": generation_id,
            "pending_cleanup": pending_cleanup.model_dump(mode="json") if pending_cleanup else None,
            "cleanup_required": pending_cleanup is not None,
            "archived_at": archived_at,
            "source": SYSTEM_AI_PROVIDER_METADATA_SOURCE,
        }

    def _metadata_from_configuration(
        self,
        configuration: _ProviderConfiguration,
        *,
        registered_model_ids: dict[str, str],
        generation_id: str | None,
        pending_cleanup: _PendingLiteLLMCleanup | None,
        previous_metadata: JsonObject | None = None,
        preserve_readiness: bool = True,
    ) -> JsonObject:
        metadata = self._metadata(
            label=configuration.label,
            icon=configuration.icon,
            note=configuration.note,
            website_url=configuration.website_url,
            compatibility=configuration.compatibility,
            auth_header=configuration.auth_header,
            base_url=configuration.base_url,
            model_mappings=configuration.model_mappings,
            default_model=configuration.default_model,
            test_config=configuration.test_config,
            billing_config=configuration.billing_config,
            registered_model_ids=registered_model_ids,
            generation_id=generation_id,
            pending_cleanup=pending_cleanup,
            archived_at=datetime.now(UTC).isoformat() if configuration.is_archived else None,
        )
        previous = previous_metadata or {}
        if preserve_readiness and "readiness" in previous:
            metadata["readiness"] = previous["readiness"]
        return metadata

    @staticmethod
    def _record_metadata(record: AIAPIKey) -> JsonObject:
        metadata = record.metadata_json if isinstance(record.metadata_json, dict) else {}
        return cast(JsonObject, dict(metadata))

    def _configuration(self, record: AIAPIKey) -> _ProviderConfiguration:
        metadata = self._record_metadata(record)
        provider = record.provider.strip()
        compatibility = metadata.get("compatibility")
        compatibility_value: AIProviderKind = (
            cast(AIProviderKind, compatibility)
            if compatibility in {"openai", "anthropic", "deepseek", "openai_compatible", "anthropic_compatible"}
            else "openai_compatible"
        )
        label = metadata.get("label")
        return _ProviderConfiguration(
            provider=provider,
            label=str(label).strip() if isinstance(label, str) and label.strip() else provider,
            icon=provider_icon_from_metadata(metadata),
            note=_clean_optional(metadata.get("note")),
            website_url=_clean_optional(metadata.get("website_url")),
            compatibility=compatibility_value,
            auth_header=_clean_required(metadata.get("auth_header")) or "Authorization",
            base_url=_clean_optional(metadata.get("base_url")),
            model_mappings=model_mappings_from_metadata(metadata, provider=provider),
            default_model=default_model_from_metadata(metadata, provider=provider),
            test_config=self._test_config(metadata),
            billing_config=billing_config_from_metadata(metadata),
            is_archived=bool(metadata.get("archived_at")),
        )

    def _updated_configuration(
        self,
        *,
        current: _ProviderConfiguration,
        payload: SystemAIProviderUpdateRequest,
    ) -> _ProviderConfiguration:
        fields = payload.model_fields_set
        mappings = payload.model_mappings or current.model_mappings
        default_model = payload.default_model or current.default_model
        if default_model not in {item.public_model for item in mappings}:
            raise BadRequest(
                message=_te("AI_PROVIDER_DEFAULT_MODEL_NOT_MAPPED"),
                error="AI_PROVIDER_DEFAULT_MODEL_NOT_MAPPED",
            )
        return _ProviderConfiguration(
            provider=payload.provider.strip() if payload.provider is not None else current.provider,
            label=payload.label.strip() if payload.label is not None else current.label,
            icon=payload.icon if "icon" in fields else current.icon,
            note=payload.note if "note" in fields else current.note,
            website_url=payload.website_url if "website_url" in fields else current.website_url,
            compatibility=payload.compatibility or current.compatibility,
            auth_header=payload.auth_header.strip() if payload.auth_header is not None else current.auth_header,
            base_url=payload.base_url if "base_url" in fields else current.base_url,
            model_mappings=mappings,
            default_model=default_model,
            test_config=payload.test_config or current.test_config,
            billing_config=payload.billing_config or current.billing_config,
            is_archived=payload.is_archived if payload.is_archived is not None else current.is_archived,
        )

    async def _assert_public_model_aliases_available(
        self,
        model_mappings: list[SystemAIProviderModelMapping],
        *,
        exclude_provider_id: UUID | None = None,
    ) -> None:
        requested = {item.public_model for item in model_mappings}
        query = self._base_query()
        if exclude_provider_id is not None:
            query = query.exclude(id=exclude_provider_id)
        records = await query.values("provider", "metadata_json")
        conflicts = sorted({
            mapping.public_model
            for record in records
            for mapping in model_mappings_from_metadata(
                cast(JsonObject, dict(record.get("metadata_json") or {})),
                provider=str(record.get("provider") or ""),
            )
            if mapping.public_model in requested
        })
        if conflicts:
            raise Conflict(
                message=_te("AI_PROVIDER_PUBLIC_MODEL_CONFLICT"),
                error="AI_PROVIDER_PUBLIC_MODEL_CONFLICT",
                meta={"public_models": conflicts},
            )

    @staticmethod
    def _connection_changed(
        *,
        current: _ProviderConfiguration,
        updated: _ProviderConfiguration,
    ) -> bool:
        return any((
            current.provider != updated.provider,
            current.compatibility != updated.compatibility,
            current.auth_header != updated.auth_header,
            current.base_url != updated.base_url,
            current.model_mappings != updated.model_mappings,
        ))

    @staticmethod
    def _registered_model_ids(metadata: JsonObject) -> dict[str, str]:
        value = metadata.get("registered_model_ids")
        if not isinstance(value, dict):
            return {}
        return {
            str(model): str(model_id)
            for model, model_id in value.items()
            if isinstance(model, str) and isinstance(model_id, str) and model.strip() and model_id.strip()
        }

    @staticmethod
    def _cleanup_required(metadata: JsonObject) -> bool:
        return metadata.get("cleanup_required") is True

    @staticmethod
    def _generation_id(metadata: JsonObject) -> str | None:
        value = metadata.get("generation_id")
        return value.strip() if isinstance(value, str) and value.strip() else None

    @staticmethod
    def _pending_cleanup(metadata: JsonObject) -> _PendingLiteLLMCleanup | None:
        value = metadata.get("pending_cleanup")
        if not isinstance(value, dict):
            return None
        try:
            return _PendingLiteLLMCleanup.model_validate(value)
        except ValueError:
            return None

    @staticmethod
    def _test_config(metadata: JsonObject) -> SystemAIProviderTestConfig:
        value = metadata.get("test_config")
        if isinstance(value, dict):
            try:
                return SystemAIProviderTestConfig.model_validate(value)
            except ValueError:
                pass
        return SystemAIProviderTestConfig()

    def _to_out(self, record: AIAPIKey) -> SystemAIProviderOut:
        metadata = self._record_metadata(record)
        configuration = self._configuration(record)
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
            provider=configuration.provider,
            label=configuration.label,
            icon=configuration.icon,
            note=configuration.note,
            website_url=configuration.website_url,
            compatibility=configuration.compatibility,
            auth_header=configuration.auth_header,
            is_active=bool(record.is_active),
            is_archived=configuration.is_archived,
            cleanup_required=self._cleanup_required(metadata),
            has_virtual_key=bool(record.virtual_key_enc),
            litellm_key_id=record.litellm_key_id,
            base_url=configuration.base_url,
            model_mappings=configuration.model_mappings,
            default_model=configuration.default_model,
            test_config=configuration.test_config,
            billing_config=configuration.billing_config,
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
        if self.settings.ai.master_key_path is None:
            raise ValueError("AI provider master key path is not configured")
        return decrypt_virtual_key(record.virtual_key_enc, _resolve_key_path(self.settings.ai.master_key_path))

    def _decrypt_virtual_key_value(self, value: str) -> str:
        if self.settings.ai.master_key_path is None:
            raise ValueError("AI provider master key path is not configured")
        return decrypt_virtual_key(value, _resolve_key_path(self.settings.ai.master_key_path))

    def _is_routable(
        self,
        provider: AIAPIKey,
        *,
        now: datetime,
        desired_is_active: bool | None = None,
    ) -> bool:
        active = provider.is_active if desired_is_active is None else desired_is_active
        metadata = self._record_metadata(provider)
        readiness = metadata.get("readiness")
        return (
            active
            and not metadata.get("archived_at")
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

    async def _replace_litellm_access(
        self,
        *,
        record: AIAPIKey,
        configuration: _ProviderConfiguration,
        provider_api_key: str,
    ) -> bool:
        if not await self._retry_pending_cleanup(record):
            raise Conflict(
                message=_te("AI_PROVIDER_UPDATED_CLEANUP_REQUIRED"),
                error="AI_PROVIDER_UPDATED_CLEANUP_REQUIRED",
            )
        previous_metadata = self._record_metadata(record)
        previous_virtual_key = self._decrypt_virtual_key(record)
        previous_model_ids = self._registered_model_ids(previous_metadata)
        if not previous_model_ids:
            previous_model_ids = await self._discover_provider_model_ids(
                provider_id=record.id,
                generation_id=self._generation_id(previous_metadata),
            )
        pending_cleanup = _PendingLiteLLMCleanup(
            virtual_key_enc=record.virtual_key_enc,
            litellm_key_id=record.litellm_key_id,
            registered_model_ids=previous_model_ids,
        )
        provisioned = await self._provision_litellm_access(
            provider_id=record.id,
            provider=configuration.provider,
            label=configuration.label,
            compatibility=configuration.compatibility,
            auth_header=configuration.auth_header,
            provider_api_key=provider_api_key,
            base_url=configuration.base_url,
            model_mappings=configuration.model_mappings,
        )
        try:
            record.provider = configuration.provider
            record.litellm_key_id = provisioned.litellm_key_id
            record.key_hash = _hash_key(provisioned.virtual_key)
            record.virtual_key_enc = self._encrypt_virtual_key(provisioned.virtual_key)
            record.provider_api_key_enc = self._encrypt_provider_api_key(provider_api_key)
            record.metadata_json = self._metadata_from_configuration(
                configuration,
                registered_model_ids=provisioned.registered_model_ids,
                generation_id=provisioned.generation_id,
                pending_cleanup=pending_cleanup,
                previous_metadata=previous_metadata,
                preserve_readiness=False,
            )
            await record.save()
        except BaseException:
            await self._cleanup_litellm_access(
                virtual_key=provisioned.virtual_key,
                registered_model_ids=provisioned.registered_model_ids,
            )
            raise
        try:
            await self._cleanup_litellm_access(
                virtual_key=previous_virtual_key,
                registered_model_ids=previous_model_ids,
            )
        except BadRequest:
            return True
        await self._clear_pending_cleanup(record)
        return False

    async def _provision_litellm_access(
        self,
        *,
        provider_id: UUID,
        provider: str,
        label: str,
        compatibility: str,
        auth_header: str,
        provider_api_key: str,
        base_url: str | None,
        model_mappings: list[SystemAIProviderModelMapping],
    ) -> _ProvisionedLiteLLMAccess:
        if not self.settings.ai.litellm_master_key:
            raise BadRequest(
                message=_te("AI_PROVIDER_LITELLM_MASTER_KEY_REQUIRED"),
                error="AI_PROVIDER_LITELLM_MASTER_KEY_REQUIRED",
            )

        client = LiteLLMClient(
            base_url=self.settings.ai.litellm_base_url,
            timeout_seconds=self.settings.ai.litellm_timeout_seconds,
        )
        generation_id = str(uuid7())
        metadata = {
            "provider": provider.strip(),
            "label": label.strip(),
            "compatibility": compatibility,
            "arclayer_provider_id": str(provider_id),
            "arclayer_generation_id": generation_id,
            "source": SYSTEM_AI_PROVIDER_METADATA_SOURCE,
        }
        registered_model_ids: dict[str, str] = {}
        virtual_key: str | None = None
        try:
            for mapping in model_mappings:
                result = await client.register_model(
                    master_key=str(self.settings.ai.litellm_master_key),
                    model_name=mapping.public_model.strip(),
                    provider_model=_litellm_provider_model(
                        compatibility=compatibility,
                        model=mapping.provider_model.strip(),
                    ),
                    provider_api_key=provider_api_key.strip(),
                    api_base=_clean_optional(base_url),
                    extra_headers=_auth_extra_headers(
                        auth_header=auth_header,
                        provider_api_key=provider_api_key,
                    ),
                    metadata=metadata,
                )
                model_id = _read_litellm_model_id(result)
                if model_id:
                    registered_model_ids[mapping.public_model] = model_id
            key_payload = await client.generate_key(
                master_key=str(self.settings.ai.litellm_master_key),
                models=[item.public_model for item in model_mappings],
                metadata=metadata,
            )
            virtual_key = _read_litellm_virtual_key(key_payload)
            litellm_key_id = _read_litellm_key_id(key_payload)
            if len(registered_model_ids) != len(model_mappings):
                registered_model_ids.update(
                    await self._discover_model_ids(
                        client,
                        provider_id=provider_id,
                        generation_id=generation_id,
                    )
                )
        except (httpx.HTTPError, ValueError) as exc:
            await self._cleanup_litellm_access(
                virtual_key=virtual_key,
                registered_model_ids=registered_model_ids,
                client=client,
            )
            raise BadRequest(
                message=_te("AI_PROVIDER_LITELLM_PROVISION_FAILED"),
                error="AI_PROVIDER_LITELLM_PROVISION_FAILED",
            ) from exc

        if virtual_key is None:
            raise BadRequest(
                message=_te("AI_PROVIDER_LITELLM_PROVISION_FAILED"),
                error="AI_PROVIDER_LITELLM_PROVISION_FAILED",
            )
        return _ProvisionedLiteLLMAccess(
            virtual_key=virtual_key,
            litellm_key_id=litellm_key_id,
            registered_model_ids=registered_model_ids,
            generation_id=generation_id,
        )

    async def _cleanup_litellm_access(
        self,
        *,
        virtual_key: str | None,
        registered_model_ids: dict[str, str],
        client: LiteLLMClient | None = None,
    ) -> None:
        if not self.settings.ai.litellm_master_key:
            raise BadRequest(
                message=_te("AI_PROVIDER_LITELLM_MASTER_KEY_REQUIRED"),
                error="AI_PROVIDER_LITELLM_MASTER_KEY_REQUIRED",
            )
        cleanup_client = client or LiteLLMClient(
            base_url=self.settings.ai.litellm_base_url,
            timeout_seconds=self.settings.ai.litellm_timeout_seconds,
        )
        try:
            if virtual_key:
                await cleanup_client.delete_key(
                    master_key=str(self.settings.ai.litellm_master_key),
                    key=virtual_key,
                )
            await self._delete_model_deployments(
                client=cleanup_client,
                registered_model_ids=registered_model_ids,
            )
        except (httpx.HTTPError, ValueError) as exc:
            raise BadRequest(
                message=_te("AI_PROVIDER_LITELLM_CLEANUP_FAILED"),
                error="AI_PROVIDER_LITELLM_CLEANUP_FAILED",
            ) from exc

    async def _delete_model_deployments(
        self,
        *,
        client: LiteLLMClient,
        registered_model_ids: dict[str, str],
    ) -> None:
        for model_id in sorted(set(registered_model_ids.values())):
            await client.delete_model(
                master_key=str(self.settings.ai.litellm_master_key),
                model_id=model_id,
            )

    async def _discover_model_ids(
        self,
        client: LiteLLMClient,
        *,
        provider_id: UUID,
        generation_id: str | None = None,
    ) -> dict[str, str]:
        payload = await client.list_model_info(master_key=str(self.settings.ai.litellm_master_key))
        data = payload.get("data")
        if not isinstance(data, list):
            raise ValueError("LiteLLM model info response is invalid")
        discovered: dict[str, str] = {}
        for item in data:
            if not isinstance(item, dict):
                continue
            model_info = item.get("model_info")
            model_name = item.get("model_name")
            if not isinstance(model_info, dict) or str(model_info.get("arclayer_provider_id")) != str(provider_id):
                continue
            if generation_id is not None and str(model_info.get("arclayer_generation_id")) != generation_id:
                continue
            model_id = model_info.get("id")
            if isinstance(model_name, str) and isinstance(model_id, str):
                discovered[model_name] = model_id
        return discovered

    async def _discover_provider_model_ids(
        self,
        *,
        provider_id: UUID,
        generation_id: str | None,
    ) -> dict[str, str]:
        if not self.settings.ai.litellm_master_key:
            raise BadRequest(
                message=_te("AI_PROVIDER_LITELLM_MASTER_KEY_REQUIRED"),
                error="AI_PROVIDER_LITELLM_MASTER_KEY_REQUIRED",
            )
        client = LiteLLMClient(
            base_url=self.settings.ai.litellm_base_url,
            timeout_seconds=self.settings.ai.litellm_timeout_seconds,
        )
        try:
            return await self._discover_model_ids(
                client,
                provider_id=provider_id,
                generation_id=generation_id,
            )
        except (httpx.HTTPError, ValueError) as exc:
            raise BadRequest(
                message=_te("AI_PROVIDER_LITELLM_CLEANUP_FAILED"),
                error="AI_PROVIDER_LITELLM_CLEANUP_FAILED",
            ) from exc

    async def _retry_pending_cleanup(self, record: AIAPIKey) -> bool:
        pending = self._pending_cleanup(self._record_metadata(record))
        if pending is None:
            return True
        try:
            await self._cleanup_litellm_access(
                virtual_key=self._decrypt_virtual_key_value(pending.virtual_key_enc),
                registered_model_ids=pending.registered_model_ids,
            )
        except (BadRequest, InvalidToken, LLMRuntimeError, ValueError):
            return False
        await self._clear_pending_cleanup(record)
        return True

    async def _clear_pending_cleanup(self, record: AIAPIKey) -> None:
        metadata = self._record_metadata(record)
        metadata["pending_cleanup"] = None
        metadata["cleanup_required"] = False
        record.metadata_json = metadata
        await record.save(update_fields=["metadata_json", "updated_at"])


def _hash_key(virtual_key: str) -> str:
    return hashlib.sha256(virtual_key.strip().encode("utf-8")).hexdigest()


def _litellm_provider_model(*, compatibility: str, model: str) -> str:
    if "/" in model:
        return model
    prefix = LITELLM_PROVIDER_PREFIXES.get(compatibility)
    return f"{prefix}/{model}" if prefix else model


def _auth_extra_headers(*, auth_header: str, provider_api_key: str) -> dict[str, str] | None:
    header = auth_header.strip()
    if header.lower() == "authorization":
        return None
    return {header: provider_api_key.strip()}


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


def _read_litellm_model_id(payload: dict[str, Any]) -> str | None:
    model_info = payload.get("model_info")
    if isinstance(model_info, dict):
        value = model_info.get("id")
        if isinstance(value, str) and value.strip():
            return value.strip()
    for key in ("model_id", "id"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _read_chat_content(payload: dict[str, Any]) -> str | None:
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
        raise ValueError("LiteLLM readiness response has no choice")
    message = choices[0].get("message")
    if not isinstance(message, dict):
        raise ValueError("LiteLLM readiness response has no message")
    content = message.get("content")
    if content is None:
        return None
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        text_blocks = [
            block.get("text") for block in content if isinstance(block, dict) and isinstance(block.get("text"), str)
        ]
        return "".join(text_blocks) or None
    raise ValueError("LiteLLM readiness response has invalid message content")


def _readiness_provider_params(
    *,
    provider: str,
    compatibility: AIProviderKind,
) -> dict[str, Any]:
    if provider.strip().lower() == "deepseek" or compatibility == "deepseek":
        return {"thinking": {"type": "disabled"}}
    return {}


class _ProviderConfiguration(BaseModel):
    model_config = ConfigDict(frozen=True)

    provider: str
    label: str
    icon: AIProviderIcon | None
    note: str | None
    website_url: str | None
    compatibility: AIProviderKind
    auth_header: str
    base_url: str | None
    model_mappings: list[SystemAIProviderModelMapping]
    default_model: str
    test_config: SystemAIProviderTestConfig
    billing_config: SystemAIProviderBillingConfig
    is_archived: bool


class _ProvisionedLiteLLMAccess(BaseModel):
    model_config = ConfigDict(frozen=True)

    virtual_key: str
    litellm_key_id: str | None
    registered_model_ids: dict[str, str]
    generation_id: str


class _PendingLiteLLMCleanup(BaseModel):
    model_config = ConfigDict(frozen=True)

    virtual_key_enc: str
    litellm_key_id: str | None
    registered_model_ids: dict[str, str]
