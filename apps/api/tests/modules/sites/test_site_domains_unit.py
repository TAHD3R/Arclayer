from __future__ import annotations

from src.config import Settings
from src.modules.sites.domains.schema import _normalize_hostname
from src.modules.sites.domains.service import SiteDomainsService
from src.modules.sites.shared.hosts import normalize_request_host


def test_normalize_hostname_lowercase_strip_port_and_trailing_dot() -> None:
    assert _normalize_hostname("Example.COM:443") == "example.com"
    assert _normalize_hostname("Example.COM.") == "example.com"
    assert _normalize_hostname("  Blog.Example.COM:8443  ") == "blog.example.com"


def test_normalize_request_host_ipv6_brackets() -> None:
    assert normalize_request_host("[::1]:8000") == "::1"
    assert normalize_request_host("[2001:db8::1]") == "2001:db8::1"


def test_dns_instruction_contract() -> None:
    settings = Settings(
        saas={"base_domain": "arclayer.app"},
        database={"enabled": False},
    )
    service = SiteDomainsService(settings)
    dns = service.build_dns_instruction(hostname="example.com", token="abc123")
    assert dns.txt_record_name == "_arclayer-site-verification.example.com"
    assert dns.txt_record_value == "arclayer-site-verification=abc123"
