from __future__ import annotations

import ipaddress
from typing import cast
from uuid import UUID

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response
from tortoise import Tortoise
from tortoise.exceptions import ConfigurationError

from apps.api.src.common.protocols.tortoise import HasSiteId
from apps.api.src.config import Settings
from apps.api.src.infra.cache.valkey import ValkeyClient
from apps.api.src.modules.sites.models.site import SiteRecord
from apps.api.src.modules.sites.models.site_domain import SiteDomainRecord

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


class SiteResolverMiddleware(BaseHTTPMiddleware):
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

    def __init__(self, app, settings: Settings) -> None:  # type: ignore[no-untyped-def]
        super().__init__(app)
        self.settings = settings
        self.base_domain = settings.saas.base_domain
        self.is_saas = settings.application.deployment_mode == "saas"

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request.state.site_id = None

        if not self.is_saas:
            return await call_next(request)

        # SaaS-only: resolve host -> site id (request-scoped tenant boundary).
        host = _normalize_host(request.headers.get("host"))
        if not host or host == "localhost" or _is_ip_host(host):
            return await call_next(request)

        if not self.settings.database.enabled:
            return await call_next(request)

        # In unit tests or early-boot states, Tortoise may not be initialized.
        # This middleware must never fail the request pipeline due to DB init state.
        if not Tortoise._inited:
            return await call_next(request)

        # Best-effort Valkey cache.
        valkey: ValkeyClient | None = getattr(request.app.state, "valkey", None)
        cache_key = f"{_CACHE_KEY_PREFIX}:{host}"
        if valkey is not None:
            try:
                cached = await valkey.get_json(cache_key)
            except Exception:
                cached = None
            if isinstance(cached, dict) and "site_id" in cached:
                site_id_raw = cached.get("site_id")
                if isinstance(site_id_raw, str) and site_id_raw:
                    try:
                        request.state.site_id = UUID(site_id_raw)
                    except (TypeError, ValueError):
                        request.state.site_id = None
                return await call_next(request)

        resolved_site_id: UUID | None = None

        try:
            # Path A: `{workspace_slug}.{base_domain}` -> SiteRecord by Workspace.slug.
            suffix = f".{(self.base_domain or '').strip().lower().rstrip('.')}"
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
                base_domain = (self.base_domain or "").strip().lower().rstrip(".")
                if not base_domain or (host != base_domain and not host.endswith(f".{base_domain}")):
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
            resolved_site_id = None

        request.state.site_id = resolved_site_id

        if valkey is not None:
            try:
                await valkey.set_json(
                    cache_key,
                    {"site_id": (str(resolved_site_id) if resolved_site_id is not None else None)},
                    ex=_POSITIVE_TTL_SECONDS if resolved_site_id is not None else _NEGATIVE_TTL_SECONDS,
                )
            except Exception:
                # Best-effort: never block requests due to cache errors.
                pass

        return await call_next(request)
