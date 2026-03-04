from __future__ import annotations

import ipaddress
from typing import cast
from uuid import UUID

from starlette.requests import Request
from starlette.types import ASGIApp, Receive, Scope, Send
from tortoise import Tortoise
from tortoise.exceptions import ConfigurationError

from apps.api.src.common.protocols.tortoise import HasSiteId
from apps.api.src.config import Settings
from apps.api.src.infra.cache.valkey import ValkeyClient
from apps.api.src.models.sites.site import SiteRecord
from apps.api.src.models.sites.site_domain import SiteDomainRecord

_CACHE_KEY_PREFIX = "saas:site_resolve:host"
_POSITIVE_TTL_SECONDS = 300
_NEGATIVE_TTL_SECONDS = 60


def _normalize_host(value: str | None) -> str:
    raw = (value or "").strip().lower()
    if not raw:
        return ""
    # Normalize IPv6 Host header formats like "[::1]:8000" -> "::1".
    if raw.startswith("[") and "]" in raw:
        inner = raw[1 : raw.index("]")]
        return inner.strip().lower().rstrip(".")
    # Strip port for common Host header formats like "example.com:443".
    # Keep IPv6 addresses like "[::1]:8000" intact.
    if ":" in raw and "]" not in raw:
        raw = raw.split(":", 1)[0]
    return raw.rstrip(".")


def _is_ip_host(value: str) -> bool:
    try:
        ipaddress.ip_address(value)
    except ValueError:
        return False
    return True


class SiteResolverMiddleware:
    """
    Resolve the current request host into a site id and store it on `request.state.site_id`.

    Active only in SaaS mode.

    Resolution paths:
    - Path A: `{workspace_slug}.{base_domain}` -> resolve via `Workspace.slug`
    - Path B: non-platform host -> resolve via `SiteDomainRecord.hostname` (verified + active)

    Notes:
    - This middleware only sets request state; it must not return 404/403 directly.
    - Uses best-effort Valkey cache (including negative cache) to reduce database load.
    """

    def __init__(self, app: ASGIApp, *, settings: Settings) -> None:
        self.app = app
        self.settings = settings
        self.base_domain = settings.saas.base_domain
        self.is_saas = settings.application.deployment_mode == "saas"

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope, receive=receive)
        request.state.site_id = None

        if not self.is_saas:
            await self.app(scope, receive, send)
            return

        # SaaS-only: resolve host -> site id (request-scoped tenant boundary).
        host = _normalize_host(request.headers.get("host"))
        if not host or host == "localhost" or _is_ip_host(host):
            await self.app(scope, receive, send)
            return

        if not self.settings.database.enabled:
            await self.app(scope, receive, send)
            return

        # In unit tests or early-boot states, Tortoise may not be initialized.
        # This middleware must never fail the request pipeline due to DB init state.
        if not Tortoise._inited:
            await self.app(scope, receive, send)
            return

        valkey: ValkeyClient | None = getattr(request.app.state, "valkey", None)
        cache_key = f"{_CACHE_KEY_PREFIX}:{host}"

        cached_site_id = await _read_cached_site_id(valkey, cache_key)
        if cached_site_id is not None:
            request.state.site_id = cached_site_id
            await self.app(scope, receive, send)
            return

        resolved_site_id = await _resolve_site_id(host, base_domain=self.base_domain)
        request.state.site_id = resolved_site_id
        await _write_cached_site_id(valkey, cache_key, site_id=resolved_site_id)

        await self.app(scope, receive, send)


async def _read_cached_site_id(valkey: ValkeyClient | None, cache_key: str) -> UUID | None:
    if valkey is None:
        return None
    try:
        cached = await valkey.get_json(cache_key)
    except Exception:
        cached = None
    if not (isinstance(cached, dict) and "site_id" in cached):
        return None
    raw = cached.get("site_id")
    if raw is None:
        return None
    if not isinstance(raw, str):
        return None
    if not raw:
        return None
    try:
        return UUID(raw)
    except (TypeError, ValueError):
        return None


async def _write_cached_site_id(valkey: ValkeyClient | None, cache_key: str, *, site_id: UUID | None) -> None:
    if valkey is None:
        return
    try:
        await valkey.set_json(
            cache_key,
            {"site_id": (str(site_id) if site_id is not None else None)},
            ex=_POSITIVE_TTL_SECONDS if site_id is not None else _NEGATIVE_TTL_SECONDS,
        )
    except Exception:
        # Best-effort: never block requests due to cache errors.
        pass


async def _resolve_site_id(host: str, *, base_domain: str | None) -> UUID | None:
    resolved_site_id: UUID | None = None
    try:
        # Path A: `{workspace_slug}.{base_domain}` -> SiteRecord by Workspace.slug.
        suffix = f".{(base_domain or '').strip().lower().rstrip('.')}"
        if suffix.strip(".") and host.endswith(suffix) and host != suffix.strip("."):
            workspace_slug = host[: -len(suffix)]
            if workspace_slug and "." not in workspace_slug:
                # Prevent platform-reserved subdomains from being treated as tenant slugs.
                if workspace_slug not in {"api", "app", "admin", "traefik"}:
                    site = (
                        await SiteRecord
                        .filter(
                            workspace__slug=workspace_slug,
                            workspace__is_active=True,
                            is_active=True,
                        )
                        .order_by("created_at", "id")
                        .first()
                    )
                    if site is not None:
                        resolved_site_id = UUID(str(site.id))

        # Path B: non-platform host -> SiteDomainRecord by hostname (verified + active).
        if resolved_site_id is None:
            normalized_base_domain = (base_domain or "").strip().lower().rstrip(".")
            if not normalized_base_domain or (
                host != normalized_base_domain and not host.endswith(f".{normalized_base_domain}")
            ):
                dom = (
                    await SiteDomainRecord
                    .filter(
                        hostname=host,
                        is_verified=True,
                        is_active=True,
                        site__is_active=True,
                        site__workspace__is_active=True,
                    )
                    .order_by("created_at", "id")
                    .first()
                )
                if dom is not None:
                    resolved_site_id = UUID(str(cast(HasSiteId, dom).site_id))
    except ConfigurationError:
        return None
    return resolved_site_id
