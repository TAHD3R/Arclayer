from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from apps.api.config import Settings
from apps.api.modules.sites.models.site import SiteRecord


class SiteResolverMiddleware(BaseHTTPMiddleware):
    """
    Extract subdomain from Host header and resolve to a SiteRecord.

    In SaaS mode, requests to `{workspace_slug}.{base_domain}` are resolved to the
    matching workspace/site via `Workspace.slug` (workspaceSlug). The resolved
    site id is injected into `request.state.site_id`.
    """

    def __init__(self, app, settings: Settings) -> None:  # type: ignore[no-untyped-def]
        super().__init__(app)
        self.base_domain = settings.saas.base_domain
        self.is_saas = settings.application.deployment_mode == "saas"

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request.state.site_id = None

        if not self.is_saas:
            return await call_next(request)

        host = (request.headers.get("host") or "").split(":")[0].lower()
        if not host or not host.endswith(f".{self.base_domain}"):
            return await call_next(request)

        # SaaS: {workspace_slug}.{base_domain}
        suffix = f".{self.base_domain}"
        workspace_slug = host[: -len(suffix)]
        if not workspace_slug or "." in workspace_slug:
            return await call_next(request)

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
            request.state.site_id = site.id

        return await call_next(request)
