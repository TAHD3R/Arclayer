from __future__ import annotations

import smtplib
from typing import NoReturn

from fastapi_mail.errors import ConnectionErrors

from src.core.exceptions import BadRequest, ServiceUnavailable
from src.core.i18n import t


def raise_mail_connection_error(
    exc: ConnectionErrors,
    *,
    namespace: str = "settings",
    failure_key: str = "MAIL_SEND_FAILED",
    failure_error: str = "MAIL_SEND_FAILED",
    expose_configuration_details: bool = True,
) -> NoReturn:
    message = str(exc).lower()
    if expose_configuration_details:
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
        message=t(namespace, failure_key),
        error=failure_error,
    )


def raise_mail_delivery_error(
    exc: BaseException,
    *,
    namespace: str = "settings",
    failure_key: str = "MAIL_SEND_FAILED",
    failure_error: str = "MAIL_SEND_FAILED",
    expose_configuration_details: bool = True,
) -> NoReturn:
    if isinstance(exc, ConnectionErrors):
        raise_mail_connection_error(
            exc,
            namespace=namespace,
            failure_key=failure_key,
            failure_error=failure_error,
            expose_configuration_details=expose_configuration_details,
        )
    if isinstance(exc, (ConnectionError, OSError, TimeoutError, smtplib.SMTPException)):
        raise ServiceUnavailable(
            message=t(namespace, failure_key),
            error=failure_error,
        )
    raise exc
