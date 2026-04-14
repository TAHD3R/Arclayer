from __future__ import annotations

import smtplib
from typing import NoReturn

from fastapi_mail.errors import ConnectionErrors

from src.common.email.service import EmailService
from src.common.services import BaseService
from src.config import Settings
from src.core.exceptions import BadRequest, ServiceUnavailable
from src.core.i18n import t
from src.modules.system.mail.schema import MailTestResult


def _raise_mail_connection_error(exc: ConnectionErrors) -> NoReturn:
    message = str(exc).lower()
    if "smtp auth extension is not supported" in message:
        raise BadRequest(
            message=t("settings", "MAIL_AUTH_NOT_SUPPORTED"),
            error="MAIL_AUTH_NOT_SUPPORTED",
        )
    if "starttls extension not supported" in message:
        raise BadRequest(
            message=t("settings", "MAIL_STARTTLS_NOT_SUPPORTED"),
            error="MAIL_STARTTLS_NOT_SUPPORTED",
        )
    if "start_tls and use_tls options are not compatible" in message:
        raise BadRequest(
            message=t("settings", "MAIL_TRANSPORT_CONFLICT"),
            error="MAIL_TRANSPORT_CONFLICT",
        )

    raise ServiceUnavailable(
        message=t("settings", "MAIL_SEND_FAILED"),
        error="MAIL_SEND_FAILED",
    )


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
        except ConnectionErrors as exc:
            _raise_mail_connection_error(exc)
        except (ConnectionError, OSError, TimeoutError, smtplib.SMTPException):
            raise ServiceUnavailable(
                message=t("settings", "MAIL_SEND_FAILED"),
                error="MAIL_SEND_FAILED",
            )
