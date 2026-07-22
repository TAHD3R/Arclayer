from __future__ import annotations

import hashlib
from typing import NoReturn

import orjson

from src.common.types.json_types import JsonObject
from src.core.exceptions import Conflict
from src.core.i18n import t


def require_builder_idempotency_key(value: str) -> str:
    key = value.strip()
    if not key or len(key) > 128:
        _raise_conflict("BUILDER_IDEMPOTENCY_KEY_INVALID")
    return key


def builder_request_fingerprint(value: JsonObject) -> str:
    return hashlib.sha256(orjson.dumps(value, option=orjson.OPT_SORT_KEYS)).hexdigest()


def _raise_conflict(code: str) -> NoReturn:
    raise Conflict(error=code, message=t("errors", code))
