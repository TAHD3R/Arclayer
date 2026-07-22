from __future__ import annotations

import asyncio
import ipaddress
import re
import socket
from collections.abc import Awaitable, Callable
from typing import Protocol
from urllib.parse import SplitResult, urlsplit, urlunsplit

_AMBIGUOUS_NUMERIC_HOST = re.compile(r"(?:0x[0-9a-f]+|[0-9]+(?:\.[0-9]+)*)", re.IGNORECASE)

type AddressResolver = Callable[[str, int], Awaitable[tuple[str, ...]]]


class KnowledgeUrlPolicyError(ValueError):
    """A URL cannot cross the Workspace Knowledge untrusted-network boundary."""


class PublicAddressResolver(Protocol):
    async def resolve(self, *, host: str, port: int) -> tuple[str, ...]: ...


class SystemPublicAddressResolver:
    """Resolve every address and reject the whole target if any answer is non-public."""

    def __init__(self, resolver: AddressResolver | None = None) -> None:
        self._resolver = resolver or _system_resolve

    async def resolve(self, *, host: str, port: int) -> tuple[str, ...]:
        literal = _parse_ip_literal(host)
        if literal is not None:
            _require_public_address(literal)
            return (literal.compressed,)
        addresses = await self._resolver(host, port)
        if not addresses:
            raise KnowledgeUrlPolicyError("Knowledge source hostname did not resolve")
        normalized = tuple(dict.fromkeys(_normalize_resolved_address(value) for value in addresses))
        for address in normalized:
            _require_public_address(ipaddress.ip_address(address))
        return normalized


def normalize_untrusted_http_url(value: str) -> str:
    """Return one canonical HTTP(S) URL without weakening ambiguous-host checks."""

    if not isinstance(value, str):
        raise KnowledgeUrlPolicyError("Knowledge source URL must be a string")
    candidate = value.strip()
    if not candidate or "\\" in candidate or any(_is_control(character) for character in candidate):
        raise KnowledgeUrlPolicyError("Knowledge source URL is invalid")
    try:
        parsed = urlsplit(candidate)
        port = parsed.port
    except ValueError as exc:
        raise KnowledgeUrlPolicyError("Knowledge source URL is invalid") from exc
    scheme = parsed.scheme.lower()
    if scheme not in {"http", "https"} or parsed.hostname is None:
        raise KnowledgeUrlPolicyError("Knowledge source URL must use HTTP or HTTPS")
    if parsed.username is not None or parsed.password is not None:
        raise KnowledgeUrlPolicyError("Knowledge source URL cannot contain credentials")
    if parsed.fragment:
        raise KnowledgeUrlPolicyError("Knowledge source URL cannot contain a fragment")
    host = _canonical_host(parsed)
    default_port = (scheme == "http" and port == 80) or (scheme == "https" and port == 443)
    netloc = host if port is None or default_port else f"{host}:{port}"
    return urlunsplit((scheme, netloc, parsed.path or "/", parsed.query, ""))


def url_host_and_port(url: str) -> tuple[str, int]:
    parsed = urlsplit(url)
    if parsed.hostname is None:
        raise KnowledgeUrlPolicyError("Knowledge source URL is missing a hostname")
    return parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80)


async def _system_resolve(host: str, port: int) -> tuple[str, ...]:
    loop = asyncio.get_running_loop()
    try:
        infos = await loop.getaddrinfo(host, port, family=socket.AF_UNSPEC, type=socket.SOCK_STREAM)
    except OSError as exc:
        raise KnowledgeUrlPolicyError("Knowledge source hostname resolution failed") from exc
    return tuple(str(sockaddr[0]) for _family, _type, _proto, _canonname, sockaddr in infos)


def _canonical_host(parsed: SplitResult) -> str:
    hostname = parsed.hostname
    if hostname is None or hostname.endswith(".") or "%" in hostname:
        raise KnowledgeUrlPolicyError("Knowledge source URL hostname is ambiguous")
    literal = _parse_ip_literal(hostname)
    if literal is not None:
        _require_public_address(literal)
        return f"[{literal.compressed}]" if literal.version == 6 else literal.compressed
    if _AMBIGUOUS_NUMERIC_HOST.fullmatch(hostname):
        raise KnowledgeUrlPolicyError("Knowledge source URL uses an ambiguous numeric hostname")
    try:
        ascii_hostname = hostname.encode("idna").decode("ascii").lower()
    except UnicodeError as exc:
        raise KnowledgeUrlPolicyError("Knowledge source URL hostname is invalid") from exc
    labels = ascii_hostname.split(".")
    if len(ascii_hostname) > 253 or any(
        not label
        or len(label) > 63
        or not label[0].isalnum()
        or not label[-1].isalnum()
        or any(not (character.isalnum() or character == "-") for character in label)
        for label in labels
    ):
        raise KnowledgeUrlPolicyError("Knowledge source URL hostname is invalid")
    return ascii_hostname


def _parse_ip_literal(host: str) -> ipaddress.IPv4Address | ipaddress.IPv6Address | None:
    try:
        return ipaddress.ip_address(host)
    except ValueError:
        return None


def _normalize_resolved_address(value: str) -> str:
    try:
        return ipaddress.ip_address(value).compressed
    except ValueError as exc:
        raise KnowledgeUrlPolicyError("Knowledge source DNS returned an invalid address") from exc


def _require_public_address(address: ipaddress.IPv4Address | ipaddress.IPv6Address) -> None:
    candidate = address.ipv4_mapped if isinstance(address, ipaddress.IPv6Address) else None
    if candidate is not None:
        address = candidate
    if not address.is_global:
        raise KnowledgeUrlPolicyError("Knowledge source URL resolved to a forbidden network")


def _is_control(character: str) -> bool:
    code = ord(character)
    return code < 32 or code == 127
