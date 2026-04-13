from __future__ import annotations

import json
from collections.abc import Mapping
from contextvars import ContextVar, Token
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import Request

DEFAULT_LOCALE = "zh-CN"
SUPPORTED_LOCALES = ("zh-CN", "en-US")
LOCALES_DIR = Path(__file__).resolve().parents[4] / "locales"
_LOCALE_PATHS: list[Path] = [LOCALES_DIR]
_current_locale: ContextVar[str] = ContextVar("current_locale", default=DEFAULT_LOCALE)
_T_OPTION_RESERVED_KEYS = frozenset({"default", "defaultValue", "lng", "locale", "ns"})


def get_request_locale(request: Request | None, *, default_locale: str | None = None) -> str:
    fallback = _normalize_locale(default_locale) if default_locale else DEFAULT_LOCALE
    if request is None:
        return fallback
    value = request.headers.get("X-Locale")
    if not value:
        value = request.query_params.get("lang")
    # Only use Accept-Language when there is no explicit locale AND no workspace default.
    if not value and default_locale is None:
        value = _parse_accept_language(request.headers.get("Accept-Language"))
    if not value:
        return fallback
    return _normalize_locale(value)


def get_current_locale() -> str:
    return _current_locale.get()


def set_current_locale(value: str) -> Token:
    return _current_locale.set(_normalize_locale(value))


def reset_current_locale(token: Token) -> None:
    _current_locale.reset(token)


def t(
    namespace_or_key: str,
    key_or_options: str | Mapping[str, Any] | None = None,
    *,
    locale: str | None = None,
    default: str | None = None,
    **kwargs: Any,
) -> str:
    namespace, key, options = _resolve_t_call(namespace_or_key, key_or_options)
    option_locale = options.get("lng") or options.get("locale")
    option_default = options.get("defaultValue") or options.get("default")
    params = {k: v for k, v in options.items() if k not in _T_OPTION_RESERVED_KEYS}
    params.update(kwargs)

    lang = _normalize_locale(str(option_locale) if option_locale is not None else locale or get_current_locale())
    text = translate(namespace, key, locale=lang)
    if text is None:
        text = str(option_default) if option_default is not None else default or key
    if params:
        try:
            text = text.format_map(params)
        except (AttributeError, KeyError, ValueError):
            return text
    return text


def localize_message(message: str, *, error: str | None, locale: str) -> str:
    if not error:
        return message
    translated = translate_error(error, locale=locale)
    return translated or message


def translate_error(error: str, *, locale: str) -> str | None:
    return translate("errors", error, locale=locale)


def translate(namespace: str, key: str, *, locale: str) -> str | None:
    if not key:
        return None
    normalized = _normalize_locale(locale)
    data = _load_locale(namespace, normalized)
    value = data.get(key)
    if value is not None:
        return str(value)
    if normalized != DEFAULT_LOCALE:
        fallback = _load_locale(namespace, DEFAULT_LOCALE)
        value = fallback.get(key)
        if value is not None:
            return str(value)
    return None


def register_locale_path(path: Path) -> None:
    if not path.exists():
        return
    if path not in _LOCALE_PATHS:
        _LOCALE_PATHS.append(path)
        _load_locale.cache_clear()


def clear_locale_cache() -> None:
    """
    Clear the in-process i18n JSON cache.

    Intended for development hot-reload and diagnostics endpoints.
    """

    _load_locale.cache_clear()


def _resolve_t_call(
    namespace_or_key: str,
    key_or_options: str | Mapping[str, Any] | None,
) -> tuple[str, str, dict[str, Any]]:
    if isinstance(key_or_options, str):
        return namespace_or_key, key_or_options, {}

    options = dict(key_or_options or {})
    prefixed = namespace_or_key.strip()
    option_namespace = str(options.get("ns") or "").strip()

    if ":" in prefixed:
        namespace, key = prefixed.split(":", 1)
        return namespace.strip(), key.strip(), options

    namespace = option_namespace or "common"
    return namespace, prefixed, options


def _normalize_locale(value: str | None) -> str:
    if not value:
        return DEFAULT_LOCALE
    locale = value.replace("_", "-").strip().lower()
    if locale.startswith("zh"):
        return "zh-CN"
    if locale.startswith("en"):
        return "en-US"
    for supported in SUPPORTED_LOCALES:
        if locale == supported.lower():
            return supported
    return DEFAULT_LOCALE


def _parse_accept_language(value: str | None) -> str | None:
    if not value:
        return None
    for part in value.split(","):
        lang = part.split(";", 1)[0].strip()
        if lang:
            return lang
    return None


@lru_cache(maxsize=64)
def _load_locale(namespace: str, locale: str) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    for base_dir in list(_LOCALE_PATHS):
        path = base_dir / locale / f"{namespace}.json"
        if not path.exists():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if isinstance(data, dict):
            payload.update(data)
    return payload
