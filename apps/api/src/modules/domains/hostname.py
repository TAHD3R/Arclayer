from __future__ import annotations

import ipaddress

from src.modules.sites.shared.hosts import normalize_request_host


class HostnameValidationError(ValueError):
    def __init__(self, message: str, *, error: str) -> None:
        super().__init__(message)
        self.error = error


def normalize_hostname(hostname: str) -> str:
    return normalize_request_host(hostname)


def _normalize_base_domain(base_domain: str) -> str:
    normalized = normalize_hostname(base_domain)
    return normalized.lstrip(".")


def validate_custom_hostname(hostname: str, base_domain: str) -> str:
    normalized = normalize_hostname(hostname)
    if not normalized:
        raise HostnameValidationError("Invalid hostname", error="DOMAIN_BINDING_HOSTNAME_INVALID")
    if normalized.startswith("*.") or "*" in normalized:
        raise HostnameValidationError(
            "Wildcard hostname not supported",
            error="DOMAIN_BINDING_HOSTNAME_WILDCARD_NOT_SUPPORTED",
        )
    if "/" in normalized or " " in normalized or "\t" in normalized:
        raise HostnameValidationError("Invalid hostname", error="DOMAIN_BINDING_HOSTNAME_INVALID")

    try:
        ipaddress.ip_address(normalized)
    except ValueError:
        pass
    else:
        raise HostnameValidationError(
            "IP address hostname not supported",
            error="DOMAIN_BINDING_HOSTNAME_IP_NOT_SUPPORTED",
        )

    if normalized == "localhost":
        raise HostnameValidationError(
            "localhost hostname not supported",
            error="DOMAIN_BINDING_HOSTNAME_LOCALHOST_NOT_SUPPORTED",
        )

    if len(normalized) > 253:
        raise HostnameValidationError("Hostname too long", error="DOMAIN_BINDING_HOSTNAME_INVALID")

    labels = normalized.split(".")
    if len(labels) < 2:
        raise HostnameValidationError("Hostname must be a FQDN", error="DOMAIN_BINDING_HOSTNAME_INVALID")
    for label in labels:
        if not label or len(label) > 63:
            raise HostnameValidationError("Invalid hostname", error="DOMAIN_BINDING_HOSTNAME_INVALID")
        if label.startswith("-") or label.endswith("-"):
            raise HostnameValidationError("Invalid hostname", error="DOMAIN_BINDING_HOSTNAME_INVALID")
        for ch in label:
            is_valid = ("a" <= ch <= "z") or ("0" <= ch <= "9") or ch == "-"
            if not is_valid:
                raise HostnameValidationError("Invalid hostname", error="DOMAIN_BINDING_HOSTNAME_INVALID")

    reserved_base_domain = _normalize_base_domain(base_domain)
    if reserved_base_domain and (normalized == reserved_base_domain or normalized.endswith(f".{reserved_base_domain}")):
        raise HostnameValidationError(
            "Platform domain cannot be bound",
            error="DOMAIN_BINDING_HOSTNAME_PLATFORM_RESERVED",
        )

    return normalized
