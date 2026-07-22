from __future__ import annotations

from typing import NoReturn

from src.common.types.json_types import JsonValue
from src.core.exceptions import Conflict, NotFound
from src.core.i18n import t


def raise_render_not_found(code: str) -> NoReturn:
    raise NotFound(error=code, message=t("errors", code))


def raise_render_conflict(code: str, *, details: object | None = None) -> NoReturn:
    raise Conflict(error=code, message=t("errors", code), details=details)


def raise_render_invalid(code: str, **meta: JsonValue) -> NoReturn:
    raise_render_conflict(
        "BUILDER_RENDER_DOCUMENT_INVALID",
        details=[{"code": code, "meta": meta}],
    )


__all__ = ["raise_render_conflict", "raise_render_invalid", "raise_render_not_found"]
