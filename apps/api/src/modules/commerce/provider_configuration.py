"""Durable, write-only Platform billing Provider configuration."""

from __future__ import annotations

from hashlib import sha256
from pathlib import Path
from typing import cast
from uuid import UUID

from pydantic import SecretStr

from src.config import Settings
from src.core.exceptions import Conflict, ServiceUnavailable
from src.core.services import BaseService
from src.llm.keys import decrypt_virtual_key, encrypt_virtual_key
from src.llm.runtime import _resolve_key_path
from src.models.system.setting import (
    PlatformSystemSettingsCommandReceipt,
    SettingRecord,
)
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.commerce.platform_operations_schema import (
    ProviderConfigurationWrite,
    ProviderConfigurationWriteOut,
)
from src.settings.scopes import SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID

PROVIDER_CONFIGURATION_NAMESPACE = "commerce.billing.provider"


class BillingProviderConfigurationWriter(BaseService):
    """Persist encrypted Provider credentials and apply them to this API process."""

    async def write(self, *, request: ProviderConfigurationWrite, actor_user_id: UUID) -> ProviderConfigurationWriteOut:
        provider = request.provider.strip().lower()
        if provider not in {"disabled", "stripe", "simulated"}:
            raise Conflict(error="BILLING_PROVIDER_UNSUPPORTED")
        key_hash = _digest(request.idempotency_key)
        fingerprint = _fingerprint(request)
        secret = _secret_value(request.secret)
        webhook_secret = _secret_value(request.webhook_secret)
        async with self.tx() as conn:
            receipt = await (
                PlatformSystemSettingsCommandReceipt
                .filter(idempotency_key_hash=key_hash)
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if receipt is not None:
                if receipt.request_fingerprint != fingerprint or receipt.section != "commerce.provider":
                    raise Conflict(error="BILLING_PROVIDER_IDEMPOTENCY_CONFLICT")
                return ProviderConfigurationWriteOut.model_validate(receipt.result_snapshot)

            record = await (
                SettingRecord
                .filter(
                    scope_type=SCOPE_TYPE_SYSTEM,
                    scope_id=SYSTEM_SCOPE_ID,
                    namespace=PROVIDER_CONFIGURATION_NAMESPACE,
                )
                .using_db(conn)
                .select_for_update()
                .first()
            )
            current = _record_value(record)
            current_revision = _integer(current.get("revision"))
            if current_revision != request.expected_revision:
                raise Conflict(error="BILLING_PROVIDER_REVISION_STALE")
            old_secret = _decrypt_secret(current.get("secret_enc"), self.settings) or _runtime_secret(
                self.settings, "stripe_secret_key"
            )
            old_webhook_secret = _decrypt_secret(current.get("webhook_secret_enc"), self.settings) or _runtime_secret(
                self.settings, "stripe_webhook_secret"
            )
            if provider == "simulated" and webhook_secret is None:
                old_webhook_secret = _decrypt_secret(
                    current.get("webhook_secret_enc"), self.settings
                ) or _runtime_secret(self.settings, "simulated_signing_secret")
            effective_secret = secret if secret is not None else old_secret
            effective_webhook_secret = webhook_secret if webhook_secret is not None else old_webhook_secret
            if provider == "stripe" and not effective_secret:
                raise Conflict(error="BILLING_PROVIDER_SECRET_REQUIRED")
            if provider == "simulated" and not effective_webhook_secret:
                raise Conflict(error="BILLING_SIMULATOR_SIGNING_SECRET_REQUIRED")
            value = {
                "provider": provider,
                "mode": request.mode,
                "revision": current_revision + 1,
                "secret_enc": _encrypt_secret(effective_secret, self.settings),
                "webhook_secret_enc": _encrypt_secret(effective_webhook_secret, self.settings),
                "configured": bool(effective_secret) if provider == "stripe" else provider == "simulated",
                "webhook_configured": bool(effective_webhook_secret),
            }
            if record is None:
                record = await SettingRecord.create(
                    scope_type=SCOPE_TYPE_SYSTEM,
                    scope_id=SYSTEM_SCOPE_ID,
                    namespace=PROVIDER_CONFIGURATION_NAMESPACE,
                    value=value,
                    updated_by=actor_user_id,
                    using_db=conn,
                )
            else:
                record.value = value
                record.updated_by = actor_user_id
                await record.save(using_db=conn, update_fields=["value", "updated_by", "updated_at"])
            result = ProviderConfigurationWriteOut(
                provider=provider,
                mode=request.mode,
                revision=current_revision + 1,
                configured=bool(value["configured"]),
            )
            audit = await write_required_activity_event(
                settings=self.settings,
                payload=ActivityAuditPayload(
                    event_name="commerce.provider_configuration.updated",
                    actor_user_id=actor_user_id,
                    entity_type="commerce_provider_configuration",
                    entity_id=record.id,
                    properties={
                        "provider": provider,
                        "mode": request.mode,
                        "revision": current_revision + 1,
                        "secret_replaced": secret is not None,
                        "webhook_secret_replaced": webhook_secret is not None,
                        "idempotency_key": key_hash,
                    },
                ),
                conn=conn,
            )
            await PlatformSystemSettingsCommandReceipt.create(
                section="commerce.provider",
                idempotency_key_hash=key_hash,
                request_fingerprint=fingerprint,
                actor_user_id=actor_user_id,
                result_revision=current_revision + 1,
                result_snapshot=result.model_dump(mode="json"),
                audit_event_id=audit.id,
                using_db=conn,
            )
        self._apply_runtime(
            provider=provider, mode=request.mode, secret=effective_secret, webhook_secret=effective_webhook_secret
        )
        return result

    async def readiness_config(self) -> dict[str, object] | None:
        record = await SettingRecord.get_or_none(
            scope_type=SCOPE_TYPE_SYSTEM,
            scope_id=SYSTEM_SCOPE_ID,
            namespace=PROVIDER_CONFIGURATION_NAMESPACE,
        )
        if record is None:
            return None
        value = _record_value(record)
        provider = str(value.get("provider") or "disabled")
        self._apply_runtime(
            provider=provider,
            mode=str(value.get("mode") or "test"),
            secret=_decrypt_secret(value.get("secret_enc"), self.settings),
            webhook_secret=_decrypt_secret(value.get("webhook_secret_enc"), self.settings),
        )
        return value

    def _apply_runtime(self, *, provider: str, mode: str, secret: str | None, webhook_secret: str | None) -> None:
        billing = self.settings.billing.model_copy(
            update={
                "provider": provider,
                "stripe_secret_key": SecretStr(secret or "")
                if provider == "stripe"
                else billing_secret(self.settings.billing.stripe_secret_key),
                "stripe_webhook_secret": SecretStr(webhook_secret or "")
                if provider == "stripe"
                else billing_secret(self.settings.billing.stripe_webhook_secret),
                "simulated_signing_secret": SecretStr(webhook_secret or "")
                if provider == "simulated"
                else billing_secret(self.settings.billing.simulated_signing_secret),
            }
        )
        self.settings.billing = billing


async def apply_persisted_billing_provider_configuration(settings: Settings) -> dict[str, object] | None:
    """Load the durable Platform Provider configuration into this API process."""
    return await BillingProviderConfigurationWriter(settings).readiness_config()


def billing_secret(value: SecretStr) -> SecretStr:
    return SecretStr(value.get_secret_value())


def _record_value(record: SettingRecord | None) -> dict[str, object]:
    return cast(dict[str, object], record.value) if record is not None and isinstance(record.value, dict) else {}


def _secret_value(value: SecretStr | None) -> str | None:
    if value is None:
        return None
    raw = value.get_secret_value().strip()
    return raw or None


def _runtime_secret(settings: Settings, field: str) -> str | None:
    value = getattr(settings.billing, field, None)
    return _secret_value(value if isinstance(value, SecretStr) else None)


def _master_key_path(settings: Settings) -> Path:
    raw = settings.ai.master_key_path
    if not raw:
        raise ServiceUnavailable(error="BILLING_PROVIDER_SECRET_STORAGE_UNAVAILABLE")
    return _resolve_key_path(raw)


def _encrypt_secret(value: str | None, settings: Settings) -> str | None:
    return None if not value else encrypt_virtual_key(value, _master_key_path(settings))


def _decrypt_secret(value: object, settings: Settings) -> str | None:
    if not isinstance(value, str) or not value:
        return None
    return decrypt_virtual_key(value, _master_key_path(settings))


def _digest(value: str) -> str:
    return sha256(value.encode()).hexdigest()


def _fingerprint(request: ProviderConfigurationWrite) -> str:
    secret = _secret_value(request.secret)
    webhook_secret = _secret_value(request.webhook_secret)
    payload = f"{request.provider}|{request.mode}|{request.expected_revision}|{_digest(secret or '')}|{_digest(webhook_secret or '')}"
    return _digest(payload)


def _integer(value: object, default: int = 0) -> int:
    if isinstance(value, bool):
        return default
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        try:
            return int(value)
        except ValueError:
            return default
    return default
