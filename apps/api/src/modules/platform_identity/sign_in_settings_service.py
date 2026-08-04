from __future__ import annotations

from collections.abc import Mapping
from hashlib import sha256
from typing import cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonObject
from src.config import Settings
from src.core.exceptions import BadRequest, Conflict, NotFound
from src.core.registries import ConnectorRegistry
from src.core.services import BaseService
from src.models.system.setting import SettingRecord
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.auth.oauth.social.providers import OAuthProviderDefinition, list_oauth_provider_connectors
from src.modules.platform_identity.permissions import PlatformActionCode
from src.modules.platform_identity.repository import PlatformIdentityRepository
from src.modules.platform_identity.sign_in_settings_schema import (
    PlatformProvisioningSettingsOut,
    PlatformRegistrationSettingsOut,
    PlatformSignInPolicyUpdateRequest,
    PlatformSignInProviderDeleteRequest,
    PlatformSignInProviderSettingsOut,
    PlatformSignInProviderUpdateRequest,
    PlatformSignInSettingsOut,
)
from src.modules.platform_identity.step_up import PlatformStepUpService
from src.modules.platform_identity.step_up_schema import PlatformStepUpProofConsumeRequest
from src.settings.core_schema import CORE_SETTINGS_NAMESPACE
from src.settings.runtime import invalidate_core_settings_cache
from src.settings.scopes import SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID

_AUTH_REVISION_KEY = "configuration_revision"


class PlatformSignInSettingsRepository:
    async def get_core(
        self, *, conn: BaseDBAsyncClient | None = None, for_update: bool = False
    ) -> SettingRecord | None:
        query = SettingRecord.filter(
            scope_type=SCOPE_TYPE_SYSTEM,
            scope_id=SYSTEM_SCOPE_ID,
            namespace=CORE_SETTINGS_NAMESPACE,
        )
        if for_update:
            query = query.select_for_update()
        if conn is not None:
            query = query.using_db(conn)
        return await query.first()

    async def save_core(
        self,
        *,
        record: SettingRecord | None,
        value: JsonObject,
        actor_user_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> SettingRecord:
        if record is None:
            return await SettingRecord.create(
                scope_type=SCOPE_TYPE_SYSTEM,
                scope_id=SYSTEM_SCOPE_ID,
                namespace=CORE_SETTINGS_NAMESPACE,
                value=value,
                updated_by=actor_user_id,
                using_db=conn,
            )
        record.value = value
        record.updated_by = actor_user_id
        await record.save(update_fields=["value", "updated_by", "updated_at"], using_db=conn)
        return record


class PlatformSignInSettingsService(BaseService):
    def __init__(
        self,
        *,
        settings: Settings,
        connector_registry: ConnectorRegistry,
        repository: PlatformSignInSettingsRepository | None = None,
        identity_repository: PlatformIdentityRepository | None = None,
    ) -> None:
        super().__init__(settings)
        self._settings = settings
        self._connector_registry = connector_registry
        self._repository = repository or PlatformSignInSettingsRepository()
        self._identity_repository = identity_repository or PlatformIdentityRepository()
        self._step_up = PlatformStepUpService(repository=self._identity_repository, settings=settings)

    async def get_settings(self) -> PlatformSignInSettingsOut:
        record = await self._repository.get_core()
        return self._settings_out(self._core_value(record))

    async def update_policy(
        self,
        *,
        actor_user_id: UUID,
        actor_session_id: UUID,
        request: PlatformSignInPolicyUpdateRequest,
    ) -> PlatformSignInSettingsOut:
        await self._consume_step_up(
            actor_user_id=actor_user_id,
            actor_session_id=actor_session_id,
            expected_revision=request.expected_revision,
            idempotency_key=request.idempotency_key,
            proof=request.step_up_proof,
            operation="update_policy",
        )
        domains = self._normalize_domains(request.email_domains_allowlist)
        async with self.tx() as conn:
            record = await self._repository.get_core(conn=conn, for_update=True)
            core = self._core_value(record)
            self._require_revision(core, request.expected_revision)
            core["auth"] = {
                _AUTH_REVISION_KEY: request.expected_revision + 1,
                "public_register_enabled": request.public_registration_enabled,
                "public_register_require_email": request.require_email,
                "public_register_require_email_verification": request.require_email_verification,
                "public_register_email_domains_allowlist": list(domains),
            }
            core["oauth_provisioning"] = {
                "auto_provision_enabled": request.auto_provision_enabled,
                "auto_accept_email_invites": request.auto_accept_email_invites,
            }
            await self._persist(
                record=record,
                core=core,
                actor_user_id=actor_user_id,
                correlation_id=request.correlation_id,
                idempotency_key=request.idempotency_key,
                event_name="platform.access.sign_in_policy.updated",
                properties={
                    "revision": request.expected_revision + 1,
                    "public_registration_enabled": request.public_registration_enabled,
                    "require_email": request.require_email,
                    "require_email_verification": request.require_email_verification,
                    "email_domain_count": len(domains),
                    "auto_provision_enabled": request.auto_provision_enabled,
                    "auto_accept_email_invites": request.auto_accept_email_invites,
                },
                conn=conn,
            )
        invalidate_core_settings_cache()
        return self._settings_out(core)

    async def update_provider(
        self,
        *,
        actor_user_id: UUID,
        actor_session_id: UUID,
        provider_key: str,
        request: PlatformSignInProviderUpdateRequest,
    ) -> PlatformSignInSettingsOut:
        definition = self._require_provider(provider_key)
        await self._consume_step_up(
            actor_user_id=actor_user_id,
            actor_session_id=actor_session_id,
            expected_revision=request.expected_revision,
            idempotency_key=request.idempotency_key,
            proof=request.step_up_proof,
            operation="update_provider",
            provider_key=definition.key,
        )
        async with self.tx() as conn:
            record = await self._repository.get_core(conn=conn, for_update=True)
            core = self._core_value(record)
            self._require_revision(core, request.expected_revision)
            current = self._section(core, definition.section_id)
            client_id = request.client_id.strip()
            client_secret = self._updated_secret(current=current, request=request)
            if request.enabled and (not client_id or not client_secret):
                raise BadRequest(error="PLATFORM_SIGN_IN_PROVIDER_CONFIGURATION_REQUIRED")
            core[definition.section_id] = {
                "enabled": request.enabled,
                "client_id": client_id or None,
                "client_secret": client_secret or None,
            }
            self._set_revision(core, request.expected_revision + 1)
            await self._persist(
                record=record,
                core=core,
                actor_user_id=actor_user_id,
                correlation_id=request.correlation_id,
                idempotency_key=request.idempotency_key,
                event_name="platform.access.sign_in_provider.updated",
                properties={
                    "revision": request.expected_revision + 1,
                    "provider": definition.key,
                    "enabled": request.enabled,
                    "client_id_changed": client_id != self._string(current.get("client_id")),
                    "client_secret_replaced": request.client_secret is not None,
                    "client_secret_cleared": request.clear_client_secret,
                },
                conn=conn,
            )
        invalidate_core_settings_cache()
        return self._settings_out(core)

    async def delete_provider(
        self,
        *,
        actor_user_id: UUID,
        actor_session_id: UUID,
        provider_key: str,
        request: PlatformSignInProviderDeleteRequest,
    ) -> PlatformSignInSettingsOut:
        definition = self._require_provider(provider_key)
        await self._consume_step_up(
            actor_user_id=actor_user_id,
            actor_session_id=actor_session_id,
            expected_revision=request.expected_revision,
            idempotency_key=request.idempotency_key,
            proof=request.step_up_proof,
            operation="delete_provider",
            provider_key=definition.key,
        )
        async with self.tx() as conn:
            record = await self._repository.get_core(conn=conn, for_update=True)
            core = self._core_value(record)
            self._require_revision(core, request.expected_revision)
            core.pop(definition.section_id, None)
            self._set_revision(core, request.expected_revision + 1)
            await self._persist(
                record=record,
                core=core,
                actor_user_id=actor_user_id,
                correlation_id=request.correlation_id,
                idempotency_key=request.idempotency_key,
                event_name="platform.access.sign_in_provider.deleted",
                properties={"revision": request.expected_revision + 1, "provider": definition.key},
                conn=conn,
            )
        invalidate_core_settings_cache()
        return self._settings_out(core)

    async def _consume_step_up(
        self,
        *,
        actor_user_id: UUID,
        actor_session_id: UUID,
        expected_revision: int,
        idempotency_key: str,
        proof: str,
        operation: str,
        provider_key: str | None = None,
    ) -> None:
        scope: JsonObject = {"operation": operation}
        if provider_key is not None:
            scope["provider_key"] = provider_key
        await self._step_up.consume(
            request=PlatformStepUpProofConsumeRequest(
                actor_user_id=actor_user_id,
                session_id=actor_session_id,
                action_code=PlatformActionCode.CHANGE_SIGN_IN_SETTINGS,
                target_type="platform_sign_in_settings",
                target_id=None,
                scope=scope,
                expected_revision=expected_revision,
                idempotency_key=idempotency_key,
                proof=proof,
            )
        )

    async def _persist(
        self,
        *,
        record: SettingRecord | None,
        core: JsonObject,
        actor_user_id: UUID,
        correlation_id: UUID,
        idempotency_key: str,
        event_name: str,
        properties: JsonObject,
        conn: BaseDBAsyncClient,
    ) -> None:
        saved = await self._repository.save_core(
            record=record,
            value=core,
            actor_user_id=actor_user_id,
            conn=conn,
        )
        await write_required_activity_event(
            settings=self._settings,
            payload=ActivityAuditPayload(
                event_name=event_name,
                actor_user_id=actor_user_id,
                entity_type="system_settings",
                entity_id=saved.id,
                properties={
                    "correlation_id": str(correlation_id),
                    "idempotency_key_hash": sha256(idempotency_key.encode()).hexdigest(),
                    **properties,
                },
            ),
            conn=conn,
        )

    def _settings_out(self, core: JsonObject) -> PlatformSignInSettingsOut:
        auth = self._section(core, "auth")
        provisioning = self._section(core, "oauth_provisioning")
        raw_domains = auth.get("public_register_email_domains_allowlist")
        domains = (
            tuple(value for value in raw_domains if isinstance(value, str)) if isinstance(raw_domains, list) else ()
        )
        return PlatformSignInSettingsOut(
            revision=self._revision(core),
            registration=PlatformRegistrationSettingsOut(
                public_registration_enabled=self._boolean(
                    auth.get("public_register_enabled"), self._settings.auth.allow_public_register
                ),
                require_email=self._boolean(auth.get("public_register_require_email"), False),
                require_email_verification=self._boolean(auth.get("public_register_require_email_verification"), False),
                email_domains_allowlist=self._normalize_domains(domains),
            ),
            provisioning=PlatformProvisioningSettingsOut(
                auto_provision_enabled=self._boolean(provisioning.get("auto_provision_enabled"), False),
                auto_accept_email_invites=self._boolean(provisioning.get("auto_accept_email_invites"), False),
            ),
            providers=tuple(
                self._provider_out(connector.definition, core)
                for connector in list_oauth_provider_connectors(self._connector_registry)
            ),
        )

    def _provider_out(self, definition: OAuthProviderDefinition, core: JsonObject) -> PlatformSignInProviderSettingsOut:
        section = self._section(core, definition.section_id)
        client_id = self._string(section.get("client_id")) or None
        has_client_secret = bool(self._string(section.get("client_secret")))
        enabled = section.get("enabled") is True
        return PlatformSignInProviderSettingsOut(
            key=definition.key,
            label=definition.label,
            installed=True,
            enabled=enabled,
            configured=bool(client_id and has_client_secret),
            client_id=client_id,
            has_client_secret=has_client_secret,
        )

    def _require_provider(self, provider_key: str) -> OAuthProviderDefinition:
        normalized = provider_key.strip().lower()
        for connector in list_oauth_provider_connectors(self._connector_registry):
            if connector.definition.key == normalized:
                return connector.definition
        raise NotFound(error="PLATFORM_SIGN_IN_PROVIDER_NOT_FOUND")

    @staticmethod
    def _core_value(record: SettingRecord | None) -> JsonObject:
        raw = record.value if record is not None else None
        return cast(JsonObject, dict(raw)) if isinstance(raw, dict) else {}

    @staticmethod
    def _section(core: Mapping[str, object], key: str) -> JsonObject:
        value = core.get(key)
        return cast(JsonObject, dict(value)) if isinstance(value, dict) else {}

    @classmethod
    def _revision(cls, core: Mapping[str, object]) -> int:
        value = cls._section(core, "auth").get(_AUTH_REVISION_KEY)
        return value if isinstance(value, int) and not isinstance(value, bool) and value >= 1 else 1

    @classmethod
    def _set_revision(cls, core: JsonObject, revision: int) -> None:
        auth = cls._section(core, "auth")
        auth[_AUTH_REVISION_KEY] = revision
        core["auth"] = auth

    @classmethod
    def _require_revision(cls, core: Mapping[str, object], expected_revision: int) -> None:
        current_revision = cls._revision(core)
        if current_revision != expected_revision:
            raise Conflict(
                error="PLATFORM_SIGN_IN_SETTINGS_REVISION_CONFLICT",
                meta={"expectedRevision": expected_revision, "currentRevision": current_revision},
            )

    @staticmethod
    def _normalize_domains(values: tuple[str, ...]) -> tuple[str, ...]:
        return tuple(sorted({value.strip().lower().lstrip("@.") for value in values if value.strip()}))

    @staticmethod
    def _boolean(value: object, default: bool) -> bool:
        return value if isinstance(value, bool) else default

    @staticmethod
    def _string(value: object) -> str:
        return value.strip() if isinstance(value, str) else ""

    @classmethod
    def _updated_secret(
        cls,
        *,
        current: Mapping[str, object],
        request: PlatformSignInProviderUpdateRequest,
    ) -> str:
        if request.clear_client_secret:
            return ""
        if request.client_secret is not None:
            return request.client_secret.strip()
        return cls._string(current.get("client_secret"))
