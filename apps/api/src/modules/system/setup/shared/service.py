from __future__ import annotations

import asyncio

from apps.api.src.core.i18n import t


def _ts(key: str, default: str) -> str:
    return t("setup", key, default=default)


_FATAL_SYSTEM_SETUP_ERRORS: tuple[type[BaseException], ...] = (
    asyncio.CancelledError,
    GeneratorExit,
    KeyboardInterrupt,
    SystemExit,
)


def _raise_if_fatal(exc: BaseException) -> None:
    if isinstance(exc, _FATAL_SYSTEM_SETUP_ERRORS):
        raise exc
