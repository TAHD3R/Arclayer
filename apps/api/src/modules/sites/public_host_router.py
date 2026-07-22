from __future__ import annotations

from collections.abc import Awaitable, Callable
from html import escape
from json import dumps
from urllib.parse import urlparse
from uuid import UUID

from fastapi import HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from starlette.responses import Response as StarletteResponse

from src.config import Settings, get_settings
from src.core.exceptions import Conflict, NotFound
from src.core.logging import get_logger
from src.models.workspaces.workspace import Workspace
from src.modules.sites.prelaunch import PrelaunchPageContext, render_prelaunch_page
from src.modules.sites.runtime.delivery_kernel import RuntimeDeliveryTarget, SiteRuntimeDeliveryKernel
from src.modules.sites.service import SiteService
from src.modules.tenancy.router_helpers import bind_project_tenant_context, ensure_workspace_tenant_context
from src.modules.tenancy.schema import TenantContext, TenantScope
from src.platform.cache.valkey import get_valkey

_RESERVED_PATH_PREFIXES = (
    "/api/",
    "/content-api/",
    "/management-api/",
    "/assets/",
    "/library/",
    "/openapi.json",
    "/docs",
    "/redoc",
)
logger = get_logger(__name__)


def _public_error_response(*, status_code: int, title: str, description: str) -> HTMLResponse:
    html = f"""<!doctype html>
<html lang="en-US">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>{escape(title)}</title>
</head>
<body><main><h1>{escape(title)}</h1><p>{escape(description)}</p></main></body>
</html>"""
    return HTMLResponse(
        html,
        status_code=status_code,
        headers={"Cache-Control": "no-store", "X-Robots-Tag": "noindex"},
    )


def _host_without_port(request: Request) -> str:
    forwarded_host = request.headers.get("x-forwarded-host")
    host = (forwarded_host or request.headers.get("host") or "").strip().lower()
    return host.split(":", 1)[0].rstrip(".")


def _is_project_host(host: str, settings: Settings) -> bool:
    base_domain = str(settings.saas.base_domain or "").strip().lower().lstrip(".").rstrip(".")
    if not base_domain or host == base_domain or not host.endswith(f".{base_domain}"):
        return False

    admin_host = (urlparse(str(settings.saas.admin_url or "")).hostname or "").lower()
    reserved_hosts = {
        admin_host,
        f"app.{base_domain}",
        f"api.{base_domain}",
        f"storage.{base_domain}",
        f"rustfs.{base_domain}",
        f"traefik.{base_domain}",
    }
    return host not in reserved_hosts


def _section_text(props: dict[str, object]) -> tuple[str, str]:
    title = ""
    description = ""
    for key in ("title", "heading", "name", "headline"):
        value = props.get(key)
        if isinstance(value, str) and value.strip():
            title = value.strip()
            break
    for key in ("description", "summary", "subtitle", "body"):
        value = props.get(key)
        if isinstance(value, str) and value.strip():
            description = value.strip()
            break
    return title, description


def _render_public_page(
    *,
    host: str,
    path: str,
    resolved,
    route,
    status_title: str = "No Published Page Yet",
    status_description: str = "This project domain is connected. Publish a homepage to replace this status page.",
) -> HTMLResponse:
    page_title = route.page_meta.title if route.page_meta and route.page_meta.title else host
    page_description = (
        route.page_meta.description if route.page_meta and route.page_meta.description else "Published by Arclayer."
    )
    sections = route.document.sections if route.document is not None else []
    section_html = []
    for section in sections[:12]:
        title, description = _section_text(section.props)
        section_html.append(
            '<section class="section">'
            f'<div class="eyebrow">{escape(section.component_key)}</div>'
            f"<h2>{escape(title or section.id)}</h2>"
            f"<p>{escape(description or dumps(section.props, ensure_ascii=False)[:320])}</p>"
            "</section>"
        )
    if not section_html:
        section_html.append(
            '<section class="section">'
            '<div class="eyebrow">Arclayer</div>'
            f"<h2>{escape(status_title)}</h2>"
            f"<p>{escape(status_description)}</p>"
            "</section>"
        )

    html = f"""<!doctype html>
<html lang="{escape(resolved.default_locale or "en-US")}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{escape(page_title)}</title>
  <meta name="description" content="{escape(page_description)}" />
  <style>
    :root {{ color-scheme: light dark; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }}
    body {{ margin: 0; background: Canvas; color: CanvasText; }}
    main {{ min-height: 100dvh; display: grid; align-content: center; gap: 24px; width: min(920px, calc(100% - 32px)); margin: 0 auto; padding: 64px 0; }}
    .masthead {{ display: grid; gap: 10px; }}
    .host {{ color: color-mix(in srgb, CanvasText 62%, transparent); font-size: 14px; }}
    h1 {{ margin: 0; font-size: clamp(36px, 7vw, 76px); line-height: 0.95; letter-spacing: 0; text-wrap: balance; }}
    p {{ margin: 0; color: color-mix(in srgb, CanvasText 68%, transparent); line-height: 1.65; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }}
    .section {{ border: 1px solid color-mix(in srgb, CanvasText 16%, transparent); border-radius: 8px; padding: 18px; background: color-mix(in srgb, Canvas 94%, CanvasText 6%); }}
    .eyebrow {{ color: color-mix(in srgb, CanvasText 52%, transparent); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }}
    h2 {{ margin: 8px 0; font-size: 20px; letter-spacing: 0; }}
    code {{ font: inherit; color: color-mix(in srgb, CanvasText 62%, transparent); }}
  </style>
</head>
<body>
  <main>
    <div class="masthead">
      <div class="host">{escape(host)}<code>{escape(path)}</code></div>
      <h1>{escape(page_title)}</h1>
      <p>{escape(page_description)}</p>
    </div>
    <div class="grid">{"".join(section_html)}</div>
  </main>
</body>
</html>"""
    return HTMLResponse(html, status_code=200)


async def _resolve_public_tenant_context(*, resolved) -> TenantContext:
    workspace_id = UUID(str(resolved.workspace_id))
    workspace = await Workspace.get_or_none(id=workspace_id, is_active=True)
    if workspace is None:
        raise NotFound("Workspace not found", error="WORKSPACE_NOT_FOUND")

    workspace_context = await ensure_workspace_tenant_context(
        workspace_id=workspace_id,
        organization_id=UUID(str(workspace.organization_id)),
    )
    return bind_project_tenant_context(
        project_id=UUID(str(resolved.project_id)),
        runtime_id=UUID(str(resolved.runtime_id)) if resolved.runtime_id is not None else None,
        site_id=UUID(str(resolved.site_id)),
        scope=TenantScope.RUNTIME,
        base_context=workspace_context,
    )


async def _serve_project_host(
    request: Request,
    settings: Settings,
) -> Response:
    request_path = request.url.path or "/"
    if any(request_path == prefix.rstrip("/") or request_path.startswith(prefix) for prefix in _RESERVED_PATH_PREFIXES):
        raise HTTPException(status_code=404, detail="Not found")

    host = _host_without_port(request)
    if not _is_project_host(host, settings):
        raise HTTPException(status_code=404, detail="Not found")

    try:
        valkey = get_valkey(request)
    except RuntimeError:
        valkey = None

    site_service = SiteService(settings, valkey=valkey)
    resolved = await site_service.resolve_site(host=host)
    if resolved.runtime_id is None:
        raise NotFound("Site runtime not found", error="SITE_RUNTIME_NOT_FOUND")
    tenant_context = await _resolve_public_tenant_context(resolved=resolved)

    target = RuntimeDeliveryTarget(
        runtime_id=UUID(str(resolved.runtime_id)),
        site_id=UUID(str(resolved.site_id)),
        tenant_context=tenant_context,
    )
    kernel = SiteRuntimeDeliveryKernel(site_service)
    try:
        route = await kernel.resolve_delivery_page(
            target=target,
            path=request_path,
            perspective="published",
            token=None,
        )
    except NotFound:
        has_active_release = await kernel.has_active_release(target=target)
        if not has_active_release and request_path == "/":
            runtime = await kernel.get_runtime(
                target=target,
                mode="public",
                token=None,
                locale=resolved.default_locale,
            )
            identity = runtime.site
            return render_prelaunch_page(
                PrelaunchPageContext(
                    host=host,
                    locale=resolved.default_locale,
                    site_name=identity.name if identity is not None else None,
                    subtitle=identity.subtitle if identity is not None else None,
                    description=identity.description if identity is not None else None,
                    logo_url=identity.logo_url if identity is not None else None,
                    favicon_url=identity.favicon_url if identity is not None else None,
                )
            )
        return _public_error_response(
            status_code=404,
            title="Page not found",
            description="The requested page is not part of the active site release.",
        )
    except Conflict as exc:
        if exc.error != "PAGE_BINDING_RESOLUTION_FAILED":
            raise
        logger.exception(
            "Project host published page binding resolution failed",
            host=host,
            path=request_path,
            site_id=str(resolved.site_id),
            runtime_id=str(resolved.runtime_id),
            details=exc.details,
        )
        return _public_error_response(
            status_code=500,
            title="Site rendering failed",
            description="The active release could not be rendered. The failure has been recorded.",
        )
    if route.match.kind == "redirect" and route.match.redirect_to:
        return RedirectResponse(route.match.redirect_to, status_code=route.match.redirect_status or 302)
    return _render_public_page(host=host, path=request_path, resolved=resolved, route=route)


async def project_host_routing_middleware(
    request: Request,
    call_next: Callable[[Request], Awaitable[StarletteResponse]],
) -> StarletteResponse:
    settings = get_settings()
    request_path = request.url.path or "/"
    host = _host_without_port(request)
    is_reserved_path = any(
        request_path == prefix.rstrip("/") or request_path.startswith(prefix) for prefix in _RESERVED_PATH_PREFIXES
    )
    if is_reserved_path or not _is_project_host(host, settings):
        return await call_next(request)

    response = await call_next(request)
    if response.status_code != 404:
        return response

    try:
        return await _serve_project_host(request, settings)
    except NotFound:
        return response
