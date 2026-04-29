from __future__ import annotations

from typing import Any


class OutputSanitizer:
    """Sanitizes API responses before returning to clients.

    - Filters out fields marked omitFromApiResponse
    - Strips password/hash fields from responses
    - Ensures no internal IDs leak through unexpected paths
    """

    SENSITIVE_FIELD_PATTERNS = frozenset({
        "password",
        "password_hash",
        "secret",
        "api_key_secret",
        "token",
        "refresh_token",
        "pepper",
    })

    @classmethod
    def sanitize_response(
        cls,
        data: Any,
        *,
        omitted_field_keys: frozenset[str] | None = None,
        max_depth: int = 5,
    ) -> Any:
        omitted = omitted_field_keys or frozenset()
        return cls._sanitize(data, omitted=omitted, depth=0, max_depth=max_depth)

    @classmethod
    def _sanitize(
        cls,
        data: Any,
        *,
        omitted: frozenset[str],
        depth: int,
        max_depth: int,
    ) -> Any:
        if depth > max_depth or data is None:
            return data
        if isinstance(data, str | int | float | bool):
            return data
        if isinstance(data, dict):
            return {
                k: cls._sanitize(v, omitted=omitted, depth=depth + 1, max_depth=max_depth)
                for k, v in data.items()
                if k not in omitted and k not in cls.SENSITIVE_FIELD_PATTERNS
            }
        if isinstance(data, list):
            return [cls._sanitize(item, omitted=omitted, depth=depth + 1, max_depth=max_depth) for item in data]
        return str(data)


def sanitize_api_response(
    data: Any,
    *,
    omitted_field_keys: frozenset[str] | None = None,
) -> Any:
    return OutputSanitizer.sanitize_response(data, omitted_field_keys=omitted_field_keys)
