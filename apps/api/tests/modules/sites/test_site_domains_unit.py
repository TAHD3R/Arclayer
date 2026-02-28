from __future__ import annotations

from apps.api.config import Settings
from apps.api.core.middleware.site_resolver import _normalize_host
from apps.api.modules.sites.schema_domains import _normalize_hostname
from apps.api.modules.sites.service_domains import SiteDomainsService


def test_normalize_hostname_lowercase_strip_port_and_trailing_dot() -> None:
    assert _normalize_hostname("Example.COM:443") == "example.com"
    assert _normalize_hostname("Example.COM.") == "example.com"
    assert _normalize_hostname("  Blog.Example.COM:8443  ") == "blog.example.com"


def test_site_resolver_normalize_host_ipv6_brackets() -> None:
    assert _normalize_host("[::1]:8000") == "::1"
    assert _normalize_host("[2001:db8::1]") == "2001:db8::1"


def test_dns_instruction_contract() -> None:
    settings = Settings(
        application={"deployment_mode": "saas"},
        saas={"base_domain": "celestial.app"},
        database={"enabled": False},
    )
    service = SiteDomainsService(settings)
    dns = service.build_dns_instruction(hostname="example.com", token="abc123")
    assert dns.txt_record_name == "_celestial-site-verification.example.com"
    assert dns.txt_record_value == "celestial-site-verification=abc123"
