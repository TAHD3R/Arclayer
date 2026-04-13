from __future__ import annotations

import smtplib

from src.common.email.service import EmailService
from src.common.services import BaseService
from src.config import Settings
from src.core.exceptions import BadRequest, ServiceUnavailable
from src.core.i18n import t
from src.modules.system.mail.schema import MailTestResult


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
        except (ConnectionError, OSError, TimeoutError, smtplib.SMTPException):
            raise ServiceUnavailable(
                message=t("settings", "MAIL_SEND_FAILED"),
                error="MAIL_SEND_FAILED",
            )
