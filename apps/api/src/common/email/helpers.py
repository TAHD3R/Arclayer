from __future__ import annotations

import asyncio

from pydantic import EmailStr, NameEmail, TypeAdapter, ValidationError

_FATAL_EMAIL_ERRORS: tuple[type[BaseException], ...] = (
    asyncio.CancelledError,
    GeneratorExit,
    KeyboardInterrupt,
    SystemExit,
)

_EMAIL_ADAPTER = TypeAdapter(EmailStr)


def raise_if_fatal(exc: BaseException) -> None:
    if isinstance(exc, _FATAL_EMAIL_ERRORS):
        raise exc


def valid_recipient(recipient: str) -> bool:
    try:
        _EMAIL_ADAPTER.validate_python(recipient)
        return True
    except ValidationError:
        return False


def to_name_email(email: str) -> NameEmail:
    local_part = email.split("@", 1)[0].strip()
    return NameEmail(name=local_part or email, email=email)


def pick_str(value: object, fallback: str) -> str:
    return value if isinstance(value, str) else fallback


def pick_int(value: object, fallback: int) -> int:
    return value if isinstance(value, int) else fallback


def pick_bool(value: object, fallback: bool) -> bool:
    return value if isinstance(value, bool) else fallback
