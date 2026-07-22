from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal, cast

from src.common.email.dynamic_service import DynamicMailService, ProviderInfo
from src.common.email.errors import raise_mail_delivery_error
from src.common.email.service import EmailService
from src.common.types.json_types import JsonObject, JsonValue
from src.config import Settings
from src.core.exceptions import BadRequest, ServiceUnavailable
from src.core.i18n import t
from src.core.registries import ConnectorRegistry
from src.core.services import BaseService
from src.models.system.setting import SettingRecord
from src.modules.system.mail.schema import MailProviderInfo, MailTestResult
from src.settings.core_schema import CORE_SETTINGS_NAMESPACE
from src.settings.scopes import SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID
from src.settings.validation import merge_deep


class AdminMailService(BaseService):
    def __init__(
        self,
        settings: Settings,
        *,
        connector_registry: ConnectorRegistry | None = None,
        email_service: EmailService | None = None,
    ) -> None:
        super().__init__(settings)
        self.connector_registry = connector_registry
        self.email_service = email_service or EmailService(
            settings,
            connector_registry=connector_registry,
        )

    async def send_test_email(self, *, recipient: str, locale: str | None = None) -> MailTestResult:
        mail = await self._get_core_mail_config()
        provider = self._active_provider_id(mail)
        try:
            result = await self.email_service.send_test_email(recipient=recipient, locale=locale)
            provider = result.provider_id or provider
            await self._remember_provider_test(provider=provider, status="passed", message=None)
            return MailTestResult(ok=True, provider=provider)
        except RuntimeError as exc:
            if str(exc) == "MAIL_DISABLED":
                raise BadRequest(
                    message=t("settings", "MAIL_DISABLED"),
                    error="MAIL_DISABLED",
                )
            await self._remember_provider_test(provider=provider, status="failed", message=str(exc) or None)
            raise ServiceUnavailable(
                message=t("settings", "MAIL_SEND_FAILED"),
                error="MAIL_SEND_FAILED",
            )
        except ValueError:
            raise BadRequest(
                message=t("settings", "MAIL_INVALID_RECIPIENT"),
                error="MAIL_INVALID_RECIPIENT",
            )
        except BaseException as exc:
            await self._remember_provider_test(provider=provider, status="failed", message=str(exc) or None)
            raise_mail_delivery_error(exc)

    async def list_providers(self) -> list[MailProviderInfo]:
        mail = await self.email_service._get_core_mail_config()
        service = self._dynamic_mail_service_factory(mail)
        infos = await service.get_available_providers()
        return [self._provider_info_with_test_state(info=info, mail=mail) for info in infos]

    async def switch_provider(self, *, provider: str) -> list[MailProviderInfo]:
        mail = await self.email_service._get_core_mail_config()
        service = self._dynamic_mail_service_factory(mail)
        await service.switch_provider(provider)
        await self._patch_mail_settings({"provider": provider})
        return await self.list_providers()

    def _dynamic_mail_service_factory(self, config: JsonObject) -> DynamicMailService:
        return DynamicMailService(
            settings=self.settings,
            config=config,
            connector_registry=self.connector_registry,
        )

    async def _get_core_mail_config(self) -> JsonObject:
        getter = getattr(self.email_service, "_get_core_mail_config", None)
        if getter is None:
            return {}
        mail = await getter()
        return mail if isinstance(mail, dict) else {}

    def _provider_info_with_test_state(self, *, info: ProviderInfo, mail: JsonObject) -> MailProviderInfo:
        payload = info.model_dump()
        test_state = self._provider_test_state(mail, str(payload.get("provider_id", "")))
        return MailProviderInfo(
            provider_id=str(payload["provider_id"]),
            label=str(payload["label"]),
            active=bool(payload["active"]),
            configured=bool(payload["configured"]),
            available=bool(payload["available"]),
            error=cast(str | None, payload.get("error")),
            last_test_status=cast(Literal["passed", "failed"] | None, test_state.get("last_test_status")),
            last_test_message=cast(str | None, test_state.get("last_test_message")),
            last_tested_at=cast(datetime | None, test_state.get("last_tested_at")),
        )

    def _provider_test_state(self, mail: JsonObject, provider: str) -> JsonObject:
        provider_config = self._provider_config(mail, provider)
        status = provider_config.get("last_test_status")
        if status not in {"passed", "failed"}:
            return {}
        message = provider_config.get("last_test_message")
        tested_at = provider_config.get("last_tested_at")
        return {
            "last_test_status": status,
            "last_test_message": message if isinstance(message, str) else None,
            "last_tested_at": tested_at if isinstance(tested_at, str) else None,
        }

    async def _remember_provider_test(
        self,
        *,
        provider: str,
        status: Literal["passed", "failed"],
        message: str | None,
    ) -> None:
        await self._patch_mail_settings({
            "providers": {
                provider: {
                    "last_test_status": status,
                    "last_test_message": message,
                    "last_tested_at": datetime.now(tz=UTC).isoformat(),
                }
            }
        })

    def _active_provider_id(self, mail: JsonObject) -> str:
        provider = mail.get("provider")
        return provider if isinstance(provider, str) and provider else "smtp"

    def _provider_config(self, mail: JsonObject, provider: str) -> JsonObject:
        providers = mail.get("providers")
        if not isinstance(providers, dict):
            return {}
        provider_config = cast(JsonValue, providers.get(provider))
        return cast(JsonObject, provider_config) if isinstance(provider_config, dict) else {}

    async def _patch_mail_settings(self, patch: JsonObject) -> None:
        record, _created = await SettingRecord.get_or_create(
            scope_type=SCOPE_TYPE_SYSTEM,
            scope_id=SYSTEM_SCOPE_ID,
            namespace=CORE_SETTINGS_NAMESPACE,
            defaults={"value": {}},
        )
        value = record.value if isinstance(record.value, dict) else {}
        merged = merge_deep(value, {"mail": patch})
        record.value = merged
        await record.save(update_fields=["value"])
