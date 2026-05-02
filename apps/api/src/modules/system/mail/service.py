from __future__ import annotations

from src.common.email.dynamic_service import DynamicMailService
from src.common.email.errors import raise_mail_delivery_error
from src.common.email.service import EmailService
from src.common.services import BaseService
from src.config import Settings
from src.core.exceptions import BadRequest, ServiceUnavailable
from src.core.i18n import t
from src.models.system.setting import SettingRecord
from src.modules.system.mail.schema import MailProviderInfo, MailTestResult
from src.settings.core_schema import CORE_SETTINGS_NAMESPACE
from src.settings.scopes import SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID
from src.settings.validation import merge_deep


class AdminMailService(BaseService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.email_service = EmailService(settings)

    async def send_test_email(self, *, recipient: str, locale: str | None = None) -> MailTestResult:
        try:
            await self.email_service.send_test_email(recipient=recipient, locale=locale)
            mail = await self.email_service._get_core_mail_config()
            provider = mail.get("provider")
            return MailTestResult(ok=True, provider=provider if isinstance(provider, str) else "smtp")
        except RuntimeError as exc:
            if str(exc) == "MAIL_DISABLED":
                raise BadRequest(
                    message=t("settings", "MAIL_DISABLED"),
                    error="MAIL_DISABLED",
                )
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
            raise_mail_delivery_error(exc)

    async def list_providers(self) -> list[MailProviderInfo]:
        mail = await self.email_service._get_core_mail_config()
        service = DynamicMailService(settings=self.settings, config=mail)
        infos = await service.get_available_providers()
        return [MailProviderInfo(**info.__dict__) for info in infos]

    async def switch_provider(self, *, provider: str) -> list[MailProviderInfo]:
        mail = await self.email_service._get_core_mail_config()
        service = DynamicMailService(settings=self.settings, config=mail)
        await service.switch_provider(provider)
        await self._patch_mail_settings({"provider": provider})
        return await self.list_providers()

    async def _patch_mail_settings(self, patch: dict[str, object]) -> None:
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
