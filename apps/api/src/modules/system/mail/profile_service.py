from __future__ import annotations

import hashlib
import inspect
import json
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any, Literal, Protocol, cast, runtime_checkable
from uuid import UUID

from pydantic import EmailStr
from tortoise.exceptions import IntegrityError

from src.common.email.credentials import MailCredentialCryptoError, encrypt_mail_credential
from src.common.email.dynamic_service import DynamicMailService
from src.common.email.helpers import raise_if_fatal
from src.common.email.service import EmailService
from src.common.types.json_types import JsonObject
from src.config import Settings
from src.core.exceptions import BadRequest, Conflict, ServiceUnavailable
from src.core.registries import ConnectorRegistry
from src.core.services import BaseService, ServiceContractError
from src.models.system.setting import SettingRecord
from src.modules.analytics.audit import ActivityAuditPayload
from src.modules.system.mail.profile_schema import (
    MailCredentialWriteOut,
    MailCredentialWriteRequest,
    MailServiceActionOut,
    MailServiceMutationRequest,
    MailServiceOut,
    MailServiceReadiness,
    MailServiceSenderOut,
    MailServiceTestOut,
    MailServiceTestRequest,
    MailServiceUpdateRequest,
)
from src.settings.core_schema import CORE_SETTINGS_NAMESPACE
from src.settings.runtime import invalidate_core_settings_cache
from src.settings.scopes import SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID

_ActivityWriter = Callable[..., Awaitable[object]]
_SERVICE_KEY = "service"
_RECEIPT_NAMESPACE_PREFIX = "mail.service.operation"


@runtime_checkable
class MailProviderCredentialPort(Protocol):
    async def configure_mail_credentials(
        self,
        *,
        provider_id: str,
        secret: str,
        username: str | None,
        rotate: bool,
    ) -> None: ...


class MailServiceProfileService(BaseService):
    def __init__(
        self,
        settings: Settings,
        *,
        connector_registry: ConnectorRegistry | None = None,
        email_service: EmailService | None = None,
        activity_writer: _ActivityWriter | None = None,
    ) -> None:
        super().__init__(settings)
        self._connector_registry = connector_registry
        self._email_service = email_service or EmailService(settings, connector_registry=connector_registry)
        self._activity_writer = activity_writer

    async def get_service(self) -> MailServiceOut:
        record = await self._core_record()
        mail = self._mail_config(record)
        return self._to_out(mail, self._service_state(mail))

    async def update_service(self, *, payload: MailServiceUpdateRequest, actor_user_id: UUID) -> MailServiceOut:
        fingerprint = _fingerprint({"actor": str(actor_user_id), **payload.model_dump(mode="json")})
        return await self._mutate_profile(
            operation="configure",
            expected_revision=payload.expected_revision,
            idempotency_key=payload.idempotency_key,
            fingerprint=fingerprint,
            actor_user_id=actor_user_id,
            event_name="system.mail.service.updated",
            mutate=lambda mail, state: self._apply_service_patch(mail=mail, state=state, payload=payload),
        )

    async def write_credentials(
        self,
        *,
        payload: MailCredentialWriteRequest,
        actor_user_id: UUID,
        rotate: bool,
    ) -> MailCredentialWriteOut:
        secret = payload.secret.get_secret_value()
        fingerprint = _fingerprint({
            "actor": str(actor_user_id),
            "expected_revision": payload.expected_revision,
            "username": payload.username,
            "secret_digest": _digest(secret),
            "rotate": rotate,
        })
        result = await self._mutate_profile(
            operation="rotate_credentials" if rotate else "configure_credentials",
            expected_revision=payload.expected_revision,
            idempotency_key=payload.idempotency_key,
            fingerprint=fingerprint,
            actor_user_id=actor_user_id,
            event_name="system.mail.credentials.rotated" if rotate else "system.mail.credentials.configured",
            mutate=lambda mail, state: self._apply_credentials(
                mail=mail,
                state=state,
                secret=secret,
                username=payload.username,
                rotate=rotate,
            ),
        )
        return MailCredentialWriteOut(
            provider=result.provider,
            configured=result.credential_configured,
            rotated=rotate,
            revision=result.revision,
        )

    async def disable(self, *, payload: MailServiceMutationRequest, actor_user_id: UUID) -> MailServiceOut:
        return await self._mutate_profile(
            operation="disable",
            expected_revision=payload.expected_revision,
            idempotency_key=payload.idempotency_key,
            fingerprint=_fingerprint({"actor": str(actor_user_id), **payload.model_dump(mode="json")}),
            actor_user_id=actor_user_id,
            event_name="system.mail.service.disabled",
            mutate=self._apply_disable,
        )

    async def recover(self, *, payload: MailServiceMutationRequest, actor_user_id: UUID) -> MailServiceOut:
        return await self._mutate_profile(
            operation="recover",
            expected_revision=payload.expected_revision,
            idempotency_key=payload.idempotency_key,
            fingerprint=_fingerprint({"actor": str(actor_user_id), **payload.model_dump(mode="json")}),
            actor_user_id=actor_user_id,
            event_name="system.mail.service.recovered",
            mutate=self._apply_recover,
        )

    async def test(self, *, payload: MailServiceTestRequest, actor_user_id: UUID) -> MailServiceTestOut:
        fingerprint = _fingerprint({"actor": str(actor_user_id), **payload.model_dump(mode="json")})
        receipt_namespace = _receipt_namespace(operation="test", key_hash=_digest(payload.idempotency_key))
        receipt = await self._receipt(receipt_namespace)
        if receipt is not None:
            return self._test_receipt_result(receipt=receipt, fingerprint=fingerprint)
        record = await self._core_record()
        mail = self._mail_config(record)
        state = self._service_state(mail)
        profile = self._to_out(mail, state)
        if profile.revision != payload.expected_revision:
            raise Conflict(error="MAIL_SERVICE_REVISION_CONFLICT")
        if not profile.installed or not profile.configured:
            raise ServiceUnavailable(error="MAIL_SERVICE_NOT_READY")
        if not profile.desired_active:
            raise Conflict(error="MAIL_SERVICE_DISABLED")

        provider = profile.provider
        try:
            result = await self._email_service.send_test_email(recipient=str(payload.recipient))
        except BaseException as exc:
            raise_if_fatal(exc)
            await self._record_test_result(
                expected_transport_revision=_integer(state["transport_revision"], 0),
                status="failed",
                actor_user_id=actor_user_id,
                provider=provider,
            )
            raise ServiceUnavailable(error=_test_failure_code(exc)) from exc

        profile = await self._record_test_result(
            expected_transport_revision=_integer(state["transport_revision"], 0),
            status="passed",
            actor_user_id=actor_user_id,
            provider=result.provider_id or provider,
        )
        output = MailServiceTestOut(
            state="accepted",
            provider=result.provider_id or provider,
            message_id=result.message_id,
            attempts=result.attempts,
            latency_ms=result.latency_ms,
            service=profile,
        )
        try:
            await SettingRecord.create(
                scope_type=SCOPE_TYPE_SYSTEM,
                scope_id=SYSTEM_SCOPE_ID,
                namespace=receipt_namespace,
                value={"fingerprint": fingerprint, "result": output.model_dump(mode="json")},
                updated_by=actor_user_id,
            )
        except IntegrityError:
            receipt = await self._receipt(receipt_namespace)
            if receipt is None:
                raise
            return self._test_receipt_result(receipt=receipt, fingerprint=fingerprint)
        return output

    async def _mutate_profile(
        self,
        *,
        operation: str,
        expected_revision: int,
        idempotency_key: str,
        fingerprint: str,
        actor_user_id: UUID,
        event_name: str,
        mutate: Callable[[JsonObject, JsonObject], object],
    ) -> MailServiceOut:
        key_hash = _digest(idempotency_key)
        receipt_namespace = _receipt_namespace(operation=operation, key_hash=key_hash)
        try:
            async with self.tx() as conn:
                receipt = await self._receipt(receipt_namespace, conn=conn)
                if receipt is not None:
                    return self._receipt_result(receipt=receipt, fingerprint=fingerprint)

                record = await self._core_record(conn=conn, for_update=True)
                mail = self._mail_config(record)
                state = self._service_state(mail)
                if _integer(state["revision"], 0) != expected_revision:
                    raise Conflict(error="MAIL_SERVICE_REVISION_CONFLICT")

                mutation = mutate(mail, state)
                if inspect.isawaitable(mutation):
                    await mutation
                next_state = state
                next_state["revision"] = _integer(state["revision"], 0) + 1
                mail[_SERVICE_KEY] = next_state
                record.value = {**self._root_config(record), "mail": mail}
                record.updated_by = actor_user_id
                await record.save(using_db=conn, update_fields=["value", "updated_by", "updated_at"])
                result = self._to_out(mail, next_state)
                await self._write_audit(
                    event_name=event_name,
                    actor_user_id=actor_user_id,
                    entity_id=record.id,
                    properties={
                        "provider": result.provider,
                        "revision": result.revision,
                        "credential_configured": result.credential_configured,
                    },
                    conn=conn,
                )
                await SettingRecord.create(
                    using_db=conn,
                    scope_type=SCOPE_TYPE_SYSTEM,
                    scope_id=SYSTEM_SCOPE_ID,
                    namespace=receipt_namespace,
                    value={"fingerprint": fingerprint, "result": result.model_dump(mode="json")},
                    updated_by=actor_user_id,
                )
        except IntegrityError:
            receipt = await self._receipt(receipt_namespace)
            if receipt is None:
                raise
            return self._receipt_result(receipt=receipt, fingerprint=fingerprint)
        invalidate_core_settings_cache()
        return result

    async def _record_test_result(
        self,
        *,
        expected_transport_revision: int,
        status: Literal["passed", "failed"],
        actor_user_id: UUID,
        provider: str,
    ) -> MailServiceOut:
        async with self.tx() as conn:
            record = await self._core_record(conn=conn, for_update=True)
            mail = self._mail_config(record)
            state = self._service_state(mail)
            if _integer(state["transport_revision"], 0) != expected_transport_revision:
                raise Conflict(error="MAIL_SERVICE_CHANGED_DURING_TEST")
            tested_at = datetime.now(tz=UTC).isoformat()
            state["last_test_status"] = status
            state["last_tested_at"] = tested_at
            if status == "passed":
                state["sender_verified_transport_revision"] = expected_transport_revision
                state["reachable_transport_revision"] = expected_transport_revision
            else:
                state["sender_verified_transport_revision"] = None
                state["reachable_transport_revision"] = None
            mail[_SERVICE_KEY] = state
            record.value = {**self._root_config(record), "mail": mail}
            record.updated_by = actor_user_id
            await record.save(using_db=conn, update_fields=["value", "updated_by", "updated_at"])
            result = self._to_out(mail, state)
            await self._write_audit(
                event_name="system.mail.service.tested",
                actor_user_id=actor_user_id,
                entity_id=record.id,
                properties={"provider": provider, "status": status, "transport_revision": expected_transport_revision},
                conn=conn,
            )
        invalidate_core_settings_cache()
        return result

    def _apply_service_patch(self, *, mail: JsonObject, state: JsonObject, payload: MailServiceUpdateRequest) -> None:
        changed_transport = False
        if payload.provider is not None and payload.provider != state["provider"]:
            self._require_provider_installed(payload.provider)
            mail["provider"] = payload.provider
            state["provider"] = payload.provider
            changed_transport = True
        if payload.sender_address is not None:
            address = str(payload.sender_address)
            mail["mail_from"] = address
            state["sender_address"] = address
            state["sender_domain"] = address.rsplit("@", 1)[-1].lower()
            changed_transport = True
        if payload.sender_name is not None:
            mail["mail_from_name"] = payload.sender_name.strip()
            state["sender_name"] = payload.sender_name.strip()
        if payload.sender_domain is not None:
            address = str(state.get("sender_address") or "")
            if address and address.rsplit("@", 1)[-1].lower() != payload.sender_domain:
                raise BadRequest(error="MAIL_SENDER_DOMAIN_MISMATCH")
            state["sender_domain"] = payload.sender_domain
            changed_transport = True
        if payload.active is not None:
            mail["enabled"] = payload.active
            state["desired_active"] = payload.active
        if payload.smtp is not None:
            if str(state["provider"]) != "smtp":
                raise BadRequest(error="MAIL_SMTP_ROUTE_PROVIDER_MISMATCH")
            providers = _object(mail.get("providers"))
            smtp = _object(providers.get("smtp"))
            patch = payload.smtp.model_dump(exclude_none=True)
            if patch:
                if patch.get("starttls") is True and patch.get("ssl_tls") is True:
                    raise BadRequest(error="MAIL_TRANSPORT_CONFLICT")
                smtp.update(cast(JsonObject, patch))
                providers["smtp"] = smtp
                mail["providers"] = providers
                changed_transport = True
        if str(state["provider"]) == "smtp":
            state["credential_configured"] = self._credential_configured(mail, "smtp")
        if changed_transport:
            state["transport_revision"] = _integer(state["transport_revision"], 0) + 1
            state["sender_verified_transport_revision"] = None
            state["reachable_transport_revision"] = None
            state["last_test_status"] = None
            state["last_tested_at"] = None

    async def _apply_credentials(
        self,
        *,
        mail: JsonObject,
        state: JsonObject,
        secret: str,
        username: str | None,
        rotate: bool,
    ) -> None:
        provider = str(state["provider"])
        if provider == "smtp":
            providers = _object(mail.get("providers"))
            smtp = _object(providers.get("smtp"))
            try:
                smtp["password"] = encrypt_mail_credential(
                    settings=self.settings,
                    provider_id=provider,
                    field="password",
                    value=secret,
                )
            except MailCredentialCryptoError as exc:
                raise ServiceUnavailable(error=str(exc)) from exc
            if username is not None:
                smtp["username"] = username.strip()
            providers[provider] = smtp
            mail["providers"] = providers
        else:
            await self._configure_external_credentials(
                provider=provider,
                secret=secret,
                username=username,
                rotate=rotate,
            )
        state["credential_configured"] = True
        state["transport_revision"] = _integer(state["transport_revision"], 0) + 1
        state["sender_verified_transport_revision"] = None
        state["reachable_transport_revision"] = None
        state["last_test_status"] = None
        state["last_tested_at"] = None

    @staticmethod
    def _apply_disable(mail: JsonObject, state: JsonObject) -> None:
        mail["enabled"] = False
        state["desired_active"] = False

    @staticmethod
    def _apply_recover(mail: JsonObject, state: JsonObject) -> None:
        if state.get("last_test_status") != "passed" or (
            state.get("reachable_transport_revision") != state.get("transport_revision")
        ):
            raise Conflict(error="MAIL_SERVICE_RECOVERY_TEST_REQUIRED")
        mail["enabled"] = True
        state["desired_active"] = True

    async def _core_record(self, *, conn=None, for_update: bool = False) -> SettingRecord:
        query = SettingRecord.filter(
            scope_type=SCOPE_TYPE_SYSTEM,
            scope_id=SYSTEM_SCOPE_ID,
            namespace=CORE_SETTINGS_NAMESPACE,
        )
        if conn is not None:
            query = query.using_db(conn)
        if for_update:
            query = query.select_for_update()
        record = await query.first()
        if record is not None:
            return record
        return await SettingRecord.create(
            using_db=conn,
            scope_type=SCOPE_TYPE_SYSTEM,
            scope_id=SYSTEM_SCOPE_ID,
            namespace=CORE_SETTINGS_NAMESPACE,
            value={},
        )

    async def _receipt(self, namespace: str, *, conn=None) -> SettingRecord | None:
        query = SettingRecord.filter(
            scope_type=SCOPE_TYPE_SYSTEM,
            scope_id=SYSTEM_SCOPE_ID,
            namespace=namespace,
        )
        if conn is not None:
            query = query.using_db(conn)
        return await query.first()

    def _receipt_result(self, *, receipt: SettingRecord, fingerprint: str) -> MailServiceOut:
        value = _object(receipt.value)
        if value.get("fingerprint") != fingerprint:
            raise Conflict(error="MAIL_SERVICE_IDEMPOTENCY_CONFLICT")
        result = value.get("result")
        if not isinstance(result, dict):
            raise ServiceContractError("Mail service idempotency receipt is invalid")
        return MailServiceOut.model_validate(result)

    def _test_receipt_result(self, *, receipt: SettingRecord, fingerprint: str) -> MailServiceTestOut:
        value = _object(receipt.value)
        if value.get("fingerprint") != fingerprint:
            raise Conflict(error="MAIL_SERVICE_IDEMPOTENCY_CONFLICT")
        result = value.get("result")
        if not isinstance(result, dict):
            raise ServiceContractError("Mail service test idempotency receipt is invalid")
        return MailServiceTestOut.model_validate(result)

    def _mail_config(self, record: SettingRecord) -> JsonObject:
        return _object(self._root_config(record).get("mail"))

    @staticmethod
    def _root_config(record: SettingRecord) -> JsonObject:
        return _object(record.value)

    def _service_state(self, mail: JsonObject) -> JsonObject:
        raw = _object(mail.get(_SERVICE_KEY))
        provider = _string(raw.get("provider")) or _string(mail.get("provider")) or "smtp"
        sender_address = _string(raw.get("sender_address")) or _string(mail.get("mail_from"))
        sender_domain = _string(raw.get("sender_domain"))
        if sender_domain is None and sender_address and "@" in sender_address:
            sender_domain = sender_address.rsplit("@", 1)[-1].lower()
        state: JsonObject = {
            "revision": _integer(raw.get("revision"), 0),
            "transport_revision": _integer(raw.get("transport_revision"), 0),
            "provider": provider,
            "sender_address": sender_address,
            "sender_name": _string(raw.get("sender_name")) or _string(mail.get("mail_from_name")),
            "sender_domain": sender_domain,
            "desired_active": _boolean(raw.get("desired_active"), _boolean(mail.get("enabled"), False)),
            "credential_configured": _boolean(
                raw.get("credential_configured"), self._credential_configured(mail, provider)
            ),
            "sender_verified_transport_revision": raw.get("sender_verified_transport_revision"),
            "reachable_transport_revision": raw.get("reachable_transport_revision"),
            "last_test_status": raw.get("last_test_status"),
            "last_tested_at": raw.get("last_tested_at"),
        }
        return state

    def _to_out(self, mail: JsonObject, state: JsonObject) -> MailServiceOut:
        provider = str(state["provider"])
        installed = self._provider_installed(provider)
        credential_configured = bool(state["credential_configured"])
        configured = installed and self._configured(mail=mail, state=state)
        transport_revision = _integer(state["transport_revision"], 0)
        sender_verified = configured and state.get("sender_verified_transport_revision") == transport_revision
        reachable = configured and state.get("reachable_transport_revision") == transport_revision
        desired_active = bool(state["desired_active"])
        active = desired_active and sender_verified and reachable
        unavailable = not installed or not configured
        degraded = desired_active and not unavailable and not active
        readiness = _readiness(
            installed=installed,
            configured=configured,
            sender_verified=sender_verified,
            reachable=reachable,
            active=active,
            degraded=degraded,
            unavailable=unavailable,
        )
        return MailServiceOut(
            revision=_integer(state["revision"], 0),
            transport_revision=transport_revision,
            provider=provider,
            sender=MailServiceSenderOut(
                address=cast(EmailStr | None, state.get("sender_address")),
                name=cast(str | None, state.get("sender_name")),
                domain=cast(str | None, state.get("sender_domain")),
            ),
            credential_configured=credential_configured,
            installed=installed,
            configured=configured,
            sender_verified=sender_verified,
            reachable=reachable,
            active=active,
            desired_active=desired_active,
            degraded=degraded,
            unavailable=unavailable,
            readiness=readiness,
            last_test_status=_test_status(state.get("last_test_status")),
            last_tested_at=_datetime(state.get("last_tested_at")),
            permitted_actions=self._permitted_actions(
                installed=installed,
                configured=configured,
                desired_active=desired_active,
                reachable=reachable,
                provider=provider,
            ),
        )

    def _configured(self, *, mail: JsonObject, state: JsonObject) -> bool:
        if not state.get("sender_address") or not state.get("sender_domain"):
            return False
        provider = str(state["provider"])
        if provider != "smtp":
            return bool(state.get("credential_configured"))
        smtp = _object(_object(mail.get("providers")).get("smtp"))
        return (
            bool(_string(smtp.get("server")))
            and _integer(smtp.get("port"), 0) > 0
            and bool(state.get("credential_configured"))
        )

    def _credential_configured(self, mail: JsonObject, provider: str) -> bool:
        if provider != "smtp":
            return False
        smtp = _object(_object(mail.get("providers")).get("smtp"))
        use_credentials = _boolean(smtp.get("use_credentials"), True)
        return not use_credentials or bool(_string(smtp.get("password")))

    def _provider_installed(self, provider: str) -> bool:
        try:
            self._dynamic_mail_service({"provider": provider})._get_provider(provider)
        except (ValueError, ServiceUnavailable):
            return False
        return True

    def _require_provider_installed(self, provider: str) -> None:
        if not self._provider_installed(provider):
            raise ServiceUnavailable(error="MAIL_PROVIDER_NOT_INSTALLED")

    def _dynamic_mail_service(self, mail: JsonObject) -> DynamicMailService:
        return DynamicMailService(
            settings=self.settings,
            config=mail,
            connector_registry=self._connector_registry,
        )

    async def _configure_external_credentials(
        self,
        *,
        provider: str,
        secret: str,
        username: str | None,
        rotate: bool,
    ) -> None:
        if self._connector_registry is None:
            raise ServiceUnavailable(
                error="MAIL_PROVIDER_CREDENTIAL_PORT_UNAVAILABLE",
                details={"protocol": "mail.provider.credentials.v1"},
            )
        registration = self._connector_registry.resolve(f"email.{provider}")
        connector = registration.factory() if registration is not None else None
        if connector is None or not isinstance(connector, MailProviderCredentialPort):
            raise ServiceUnavailable(
                error="MAIL_PROVIDER_CREDENTIAL_PORT_UNAVAILABLE",
                details={"protocol": "mail.provider.credentials.v1"},
            )
        await connector.configure_mail_credentials(
            provider_id=provider,
            secret=secret,
            username=username,
            rotate=rotate,
        )

    def _permitted_actions(
        self,
        *,
        installed: bool,
        configured: bool,
        desired_active: bool,
        reachable: bool,
        provider: str,
    ) -> list[MailServiceActionOut]:
        credential_available = provider == "smtp" or self._provider_credential_port_available(provider)
        return [
            MailServiceActionOut(action="configure", available=True),
            MailServiceActionOut(
                action="configure_credentials",
                available=credential_available,
                reason_code=None if credential_available else "MAIL_PROVIDER_CREDENTIAL_PORT_UNAVAILABLE",
            ),
            MailServiceActionOut(
                action="test",
                available=installed and configured and desired_active,
                reason_code=None if installed and configured and desired_active else "MAIL_SERVICE_NOT_READY",
            ),
            MailServiceActionOut(
                action="rotate_credentials",
                available=credential_available,
                reason_code=None if credential_available else "MAIL_PROVIDER_CREDENTIAL_PORT_UNAVAILABLE",
            ),
            MailServiceActionOut(action="disable", available=desired_active),
            MailServiceActionOut(
                action="recover",
                available=not desired_active and reachable,
                reason_code=None if not desired_active and reachable else "MAIL_SERVICE_RECOVERY_TEST_REQUIRED",
            ),
        ]

    def _provider_credential_port_available(self, provider: str) -> bool:
        if self._connector_registry is None:
            return False
        registration = self._connector_registry.resolve(f"email.{provider}")
        if registration is None:
            return False
        return isinstance(registration.factory(), MailProviderCredentialPort)

    async def _write_audit(
        self,
        *,
        event_name: str,
        actor_user_id: UUID,
        entity_id: UUID,
        properties: JsonObject,
        conn,
    ) -> None:
        if self._activity_writer is None:
            raise ServiceContractError("Mail service mutations require an activity audit writer")
        await self._activity_writer(
            settings=self.settings,
            payload=ActivityAuditPayload(
                event_name=event_name,
                actor_user_id=actor_user_id,
                entity_type="mail_service",
                entity_id=entity_id,
                source="api",
                properties=properties,
            ),
            conn=conn,
        )


def _object(value: object) -> JsonObject:
    return cast(JsonObject, dict(value)) if isinstance(value, dict) else {}


def _string(value: object) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def _integer(value: object, default: int) -> int:
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else default


def _boolean(value: object, default: bool) -> bool:
    return value if isinstance(value, bool) else default


def _datetime(value: object) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _test_status(value: object) -> Literal["passed", "failed"] | None:
    return cast(Literal["passed", "failed"], value) if value in {"passed", "failed"} else None


def _readiness(
    *,
    installed: bool,
    configured: bool,
    sender_verified: bool,
    reachable: bool,
    active: bool,
    degraded: bool,
    unavailable: bool,
) -> MailServiceReadiness:
    if unavailable:
        return "unavailable"
    if active:
        return "active"
    if degraded:
        return "degraded"
    if reachable:
        return "reachable"
    if sender_verified:
        return "sender_verified"
    if configured:
        return "configured"
    return "installed" if installed else "unavailable"


def _receipt_namespace(*, operation: str, key_hash: str) -> str:
    return f"{_RECEIPT_NAMESPACE_PREFIX}.{operation}.{key_hash}"


def _digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _fingerprint(value: dict[str, Any]) -> str:
    serialized = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return _digest(serialized)


def _test_failure_code(exc: BaseException) -> str:
    if isinstance(exc, RuntimeError) and str(exc) == "MAIL_DISABLED":
        return "MAIL_SERVICE_DISABLED"
    if isinstance(exc, MailCredentialCryptoError):
        return str(exc)
    if isinstance(exc, ValueError) and str(exc).startswith("MAIL_"):
        return str(exc)
    return "MAIL_SERVICE_TEST_FAILED"
