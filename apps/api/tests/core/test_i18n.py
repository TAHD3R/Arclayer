from __future__ import annotations

import json
import re
from pathlib import Path

from fastapi import FastAPI, Request

from src.core import i18n
from src.core.i18n import get_request_locale, localize_message, t
from tests.utils.asgi_client import asgi_client

REPO_ROOT = Path(__file__).resolve().parents[4]
API_SRC_ROOT = REPO_ROOT / "apps" / "api" / "src"
LOCALES_ROOT = REPO_ROOT / "locales"
TEST_LOCALES = ("zh-CN", "en-US")
SHARED_TEST_NAMESPACES = ("auth", "common", "errors", "notifications", "rbac", "settings", "sys", "team")


async def test_get_request_locale_priority() -> None:
    app = FastAPI()

    @app.get("/locale")
    async def locale_handler(request: Request) -> dict[str, str]:
        return {"locale": get_request_locale(request)}

    async with asgi_client(app) as client:
        response = await client.get(
            "/locale?lang=zh-CN",
            headers={"X-Locale": "en-US", "Accept-Language": "zh-CN"},
        )
        assert response.json()["locale"] == "en-US"

        response = await client.get("/locale?lang=zh-CN", headers={"Accept-Language": "en-US"})
        assert response.json()["locale"] == "zh-CN"

        response = await client.get("/locale", headers={"Accept-Language": "en-US,en;q=0.9"})
        assert response.json()["locale"] == "en-US"

        response = await client.get("/locale")
        assert response.json()["locale"] == "zh-CN"


def test_t_fallback_and_translate() -> None:
    assert t("auth", "LOGIN_SUCCESS", locale="en-US") == "Login succeeded"
    assert t("auth:LOGIN_SUCCESS", {"lng": "en-US"}) == "Login succeeded"
    assert t("LOGIN_SUCCESS", {"ns": "auth", "lng": "en-US"}) == "Login succeeded"
    assert t("auth", "UNKNOWN_KEY", locale="en-US", default="Fallback") == "Fallback"
    assert t("auth:UNKNOWN_KEY", {"lng": "en-US", "defaultValue": "Fallback"}) == "Fallback"
    assert t("auth", "UNKNOWN_KEY", locale="en-US") == "UNKNOWN_KEY"


def test_localize_message() -> None:
    assert localize_message("Denied", error="FORBIDDEN", locale="en-US") == "Forbidden"
    assert localize_message("Denied", error="FORBIDDEN", locale="zh-CN") == "权限不足"


def test_register_locale_path_merges(tmp_path: Path) -> None:
    locale_root = tmp_path / "locales"
    en_dir = locale_root / "en-US"
    en_dir.mkdir(parents=True)
    (en_dir / "custom.json").write_text(json.dumps({"HELLO": "Hello from plugin"}), encoding="utf-8")

    original_paths = list(i18n._LOCALE_PATHS)
    try:
        i18n.register_locale_path(locale_root)
        assert t("custom", "HELLO", locale="en-US") == "Hello from plugin"
    finally:
        i18n._LOCALE_PATHS[:] = original_paths
        i18n._load_locale.cache_clear()


def test_backend_translation_refs_exist_in_shared_locales() -> None:
    locale_keys = _load_shared_locale_keys()
    used_refs: dict[str, set[str]] = {namespace: set() for namespace in SHARED_TEST_NAMESPACES}

    direct_calls = re.compile(r't\(\s*["\']([a-z_]+)["\']\s*,\s*["\']([A-Z0-9_:-]+)["\']')
    prefixed_calls = re.compile(r't\(\s*["\']([a-z_]+):([A-Z0-9_:-]+)["\']')

    for path in API_SRC_ROOT.rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        wrapper_namespaces = _detect_wrapper_namespaces(text)

        for namespace, key in direct_calls.findall(text):
            if namespace in used_refs:
                used_refs[namespace].add(key)

        for namespace, key in prefixed_calls.findall(text):
            if namespace in used_refs:
                used_refs[namespace].add(key)

        for key in re.findall(r'_ta\(\s*["\']([A-Z0-9_:-]+)["\']', text):
            used_refs["auth"].add(key)

        for wrapper_name, namespace in wrapper_namespaces.items():
            if namespace not in used_refs:
                continue
            pattern = rf'{wrapper_name}\(\s*["\']([A-Z0-9_:-]+)["\']'
            for key in re.findall(pattern, text):
                used_refs[namespace].add(key)

    missing = {
        locale: {
            namespace: sorted(keys - locale_keys[locale][namespace])
            for namespace, keys in used_refs.items()
            if keys - locale_keys[locale][namespace]
        }
        for locale in TEST_LOCALES
    }
    missing = {locale: value for locale, value in missing.items() if value}
    assert not missing, json.dumps(missing, ensure_ascii=False, indent=2)


def test_hardcoded_api_error_codes_exist_in_errors_locale() -> None:
    locale_keys = _load_shared_locale_keys()
    errors_keys = locale_keys["zh-CN"]["errors"]
    hardcoded_errors: set[str] = set()
    exception_calls = re.compile(
        r"raise\s+(?:BadRequest|NotFound|Conflict|Forbidden|Unauthorized|ServiceUnavailable)\((.*?)\)",
        re.S,
    )

    for path in API_SRC_ROOT.rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        for chunk in exception_calls.findall(text):
            if not re.search(r"message\s*=\s*(?:t\(|(?:self\.)?_[a-z]+\()", chunk):
                error_match = re.search(r'error\s*=\s*["\']([A-Z0-9_:-]+)["\']', chunk)
                message_match = re.search(r"message\s*=", chunk)
                if error_match and message_match:
                    hardcoded_errors.add(error_match.group(1))

    missing = sorted(hardcoded_errors - errors_keys)
    assert not missing, json.dumps(missing, ensure_ascii=False, indent=2)


def test_backend_product_code_does_not_use_literal_translation_fallbacks() -> None:
    literal_default_patterns = (
        re.compile(r't\([^#\n]*default\s*=\s*["\']'),
        re.compile(r't\([^#\n]*["\']defaultValue["\']\s*:\s*["\']'),
    )
    violations: dict[str, list[int]] = {}

    for path in API_SRC_ROOT.rglob("*.py"):
        if path == API_SRC_ROOT / "core" / "i18n.py":
            continue
        lines = path.read_text(encoding="utf-8").splitlines()
        line_hits = [
            line_no
            for line_no, line in enumerate(lines, start=1)
            if any(pattern.search(line) for pattern in literal_default_patterns)
        ]
        if line_hits:
            violations[str(path.relative_to(REPO_ROOT))] = line_hits

    assert not violations, json.dumps(violations, ensure_ascii=False, indent=2)


def test_backend_product_code_does_not_embed_hardcoded_user_messages() -> None:
    exception_calls = re.compile(
        r"raise\s+(?:BadRequest|NotFound|Conflict|Forbidden|Unauthorized|ServiceUnavailable)\((.*?)\)",
        re.S,
    )
    response_like_calls = re.compile(
        r"(?:ApiResponse\.(?:success|fail)|_build_response|SysConfigTestCheck)\((.*?)\)",
        re.S,
    )
    literal_message = re.compile(r'message\s*=\s*["\']')
    violations: dict[str, list[str]] = {}

    for path in API_SRC_ROOT.rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        chunks: list[str] = []
        chunks.extend(chunk for chunk in exception_calls.findall(text) if literal_message.search(chunk))
        chunks.extend(chunk for chunk in response_like_calls.findall(text) if literal_message.search(chunk))
        if chunks:
            violations[str(path.relative_to(REPO_ROOT))] = [chunk.strip()[:160] for chunk in chunks[:10]]

    assert not violations, json.dumps(violations, ensure_ascii=False, indent=2)


def _load_shared_locale_keys() -> dict[str, dict[str, set[str]]]:
    return {
        locale: {
            namespace: set(json.loads((LOCALES_ROOT / locale / f"{namespace}.json").read_text(encoding="utf-8")).keys())
            for namespace in SHARED_TEST_NAMESPACES
        }
        for locale in TEST_LOCALES
    }


def _detect_wrapper_namespaces(text: str) -> dict[str, str]:
    wrappers: dict[str, str] = {"_ta": "auth", "_tr": "rbac"}
    for wrapper_name in ("_ts",):
        match = re.search(
            rf'def\s+{wrapper_name}\([^)]*\)\s*->\s*str:\s*[\r\n]+\s*return\s+t\(\s*["\']([a-z_]+)["\']',
            text,
        )
        if match is not None:
            wrappers[wrapper_name] = match.group(1)
    return wrappers
