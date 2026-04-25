from __future__ import annotations

from uuid import UUID

import pytest

from src.modules.domains.hostname import HostnameValidationError, normalize_hostname, validate_custom_hostname
from src.modules.domains.platform import build_platform_hostname


def test_normalize_hostname_lowercases_and_strips_trailing_dot() -> None:
    assert normalize_hostname("Example.COM.") == "example.com"
    assert normalize_hostname("Blog.Example.COM:8443") == "blog.example.com"


@pytest.mark.parametrize(
    ("hostname", "error"),
    [
        ("127.0.0.1", "DOMAIN_BINDING_HOSTNAME_IP_NOT_SUPPORTED"),
        ("localhost", "DOMAIN_BINDING_HOSTNAME_LOCALHOST_NOT_SUPPORTED"),
        ("*.example.com", "DOMAIN_BINDING_HOSTNAME_WILDCARD_NOT_SUPPORTED"),
        ("arclayer.app", "DOMAIN_BINDING_HOSTNAME_PLATFORM_RESERVED"),
        ("www.arclayer.app", "DOMAIN_BINDING_HOSTNAME_PLATFORM_RESERVED"),
    ],
)
def test_validate_custom_hostname_rejects_reserved_and_invalid_hosts(hostname: str, error: str) -> None:
    with pytest.raises(HostnameValidationError) as exc_info:
        validate_custom_hostname(hostname, "arclayer.app")
    assert exc_info.value.error == error


def test_validate_custom_hostname_normalizes_uppercase_input() -> None:
    assert validate_custom_hostname("WWW.Example.COM.", "arclayer.app") == "www.example.com"


def test_build_platform_hostname_is_stable_for_project_identity() -> None:
    project_id = UUID("8f3k2a00-0000-0000-0000-000000000000".replace("k", "c"))
    hostname = build_platform_hostname("Blog", project_id, "arclayer.app")
    assert hostname == f"blog-{project_id.hex[-8:]}.arclayer.app"
    assert build_platform_hostname("Blog", project_id, "arclayer.app") == hostname


def test_build_platform_hostname_uses_entropy_tail_for_uuid7_ids() -> None:
    first = UUID("019dc591-6ee0-7000-8000-111111111111")
    second = UUID("019dc591-6ee0-7000-8000-222222222222")

    assert build_platform_hostname("Test Project", first, "arclayer.app") != build_platform_hostname(
        "Test Project",
        second,
        "arclayer.app",
    )
