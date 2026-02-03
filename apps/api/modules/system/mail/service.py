from __future__ import annotations

from apps.api.common.email.service import EmailService
from apps.api.common.services.base import BaseService
from apps.api.config import Settings
from apps.api.core.exceptions import BadRequest, ServiceUnavailable
from apps.api.core.i18n import t
from apps.api.modules.system.mail.schema import MailTestResult


class AdminMailService(BaseService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.email_service = EmailService(settings)

    async def send_test_email(self, *, recipient: str, locale: str | None = None) -> MailTestResult:
        try:
            await self.email_service.send_test_email(recipient=recipient, locale=locale)
            return MailTestResult(ok=True)
        except RuntimeError as exc:
            if str(exc) == "MAIL_DISABLED":
                raise BadRequest(
                    message=t("settings", "MAIL_DISABLED", default="邮件服务未开启"),
                    error="MAIL_DISABLED",
                )
            raise ServiceUnavailable(
                message=t("settings", "MAIL_SEND_FAILED", default="发送失败，请检查邮箱配置与网络连接"),
                error="MAIL_SEND_FAILED",
            )
        except ValueError:
            raise BadRequest(
                message=t("settings", "MAIL_INVALID_RECIPIENT", default="收件人邮箱无效"),
                error="MAIL_INVALID_RECIPIENT",
            )
        except Exception:
            raise ServiceUnavailable(
                message=t("settings", "MAIL_SEND_FAILED", default="发送失败，请检查邮箱配置与网络连接"),
                error="MAIL_SEND_FAILED",
            )
