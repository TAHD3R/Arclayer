from __future__ import annotations

from typing import Literal

from apps.api.common.services.base import BaseService
from apps.api.core.exceptions import Forbidden
from apps.api.routers.v1.sites.schema import (
    ContainerBlock,
    ContainerBlockProps,
    DividerBlock,
    DividerBlockProps,
    DocumentIR,
    DocumentMeta,
    HeadingBlock,
    HeadingBlockProps,
    ParagraphBlock,
    ParagraphBlockProps,
    SiteResolveOut,
    SiteRouteMatchOut,
    SiteRouteResolveOut,
    SiteRuntimeOut,
    SiteThemeOut,
)

DEMO_SITE_ID = "00000000-0000-0000-0000-000000000001"
DEMO_PREVIEW_TOKENS = {"demo"}


class SiteService(BaseService):
    """
    Stub-only Site service (no persistence, no database).

    This is intentionally minimal to validate protocol shape and SSR integration
    before implementing the actual RouteTemplate resolver and revision storage.
    """

    def assert_preview_access(self, *, mode: Literal["public", "preview"], token: str | None) -> None:
        if mode != "preview":
            return
        if token is None or not token.strip():
            raise Forbidden("Preview token required", error="PREVIEW_TOKEN_REQUIRED")
        if token not in DEMO_PREVIEW_TOKENS:
            raise Forbidden("Invalid preview token", error="PREVIEW_TOKEN_INVALID")

    async def resolve_site(self, *, host: str) -> SiteResolveOut:
        # Sprint 2/3: host -> siteId mapping will be backed by DB and domain verification.
        # For now, keep it deterministic.
        _ = host
        return SiteResolveOut(site_id=DEMO_SITE_ID, default_locale="zh-CN", fallback_locale="en-US")

    async def get_runtime(self, *, site_id: str, mode: Literal["public", "preview"]) -> SiteRuntimeOut:
        # Sprint 2/3: runtime config will be fetched from SiteSettings namespaces.
        _ = site_id
        _ = mode
        return SiteRuntimeOut(
            site_id=DEMO_SITE_ID,
            mode=mode,
            theme=SiteThemeOut(
                css_vars={
                    "--color-primary": "#1677ff",
                    "--color-background": "#ffffff",
                    "--color-foreground": "#111827",
                    "--color-border": "rgba(17, 24, 39, 0.12)",
                    "--font-sans": "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
                }
            ),
            fonts=[],
        )

    async def resolve_route(
        self,
        *,
        site_id: str,
        path: str,
        mode: Literal["public", "preview"],
    ) -> SiteRouteResolveOut:
        _ = site_id
        _ = mode
        pathname = normalize_path(path)

        # Redirect stub: validate redirect protocol and SSR integration.
        # Sprint 2/3: redirects will be driven by RouteTemplate resolver / site settings.
        if pathname == "/old-about":
            return SiteRouteResolveOut(
                match=SiteRouteMatchOut(
                    kind="redirect",
                    params={},
                    redirect_to="/about",
                    redirect_status=301,
                ),
                document=None,
            )

        if pathname == "/":
            return SiteRouteResolveOut(match=SiteRouteMatchOut(kind="page"), document=build_home_document())

        if pathname == "/about":
            return SiteRouteResolveOut(match=SiteRouteMatchOut(kind="page"), document=build_about_document())

        blog = match_blog_route(pathname)
        if blog is not None:
            slug = blog["slug"]
            return SiteRouteResolveOut(
                match=SiteRouteMatchOut(kind="route_template", params={"slug": slug}),
                document=build_blog_document(slug=slug),
            )

        return SiteRouteResolveOut(match=SiteRouteMatchOut(kind="not_found"), document=None)


def normalize_path(path: str) -> str:
    if not path:
        return "/"
    pathname = path if path.startswith("/") else f"/{path}"
    if pathname == "/":
        return "/"
    return pathname[:-1] if pathname.endswith("/") else pathname


def match_blog_route(pathname: str) -> dict[str, str] | None:
    if not pathname.startswith("/blog/"):
        return None
    slug = pathname[len("/blog/") :]
    if not slug or "/" in slug:
        return None
    return {"slug": slug}


def build_home_document() -> DocumentIR:
    return DocumentIR(
        version=1,
        meta=DocumentMeta(
            title={"zh-CN": "Celestial Portal", "en-US": "Celestial Portal"},
            description={
                "zh-CN": "后端 stub：验证 sites/routes/resolve 协议与 Portal SSR 集成。",
                "en-US": "Backend stub: validate sites/routes/resolve protocol and Portal SSR integration.",
            },
        ),
        blocks=[
            ContainerBlock(
                id="b1",
                type="container",
                props=ContainerBlockProps(as_="section"),
                children=[
                    HeadingBlock(
                        id="b1-h1",
                        type="heading",
                        props=HeadingBlockProps(
                            level=1,
                            text={"zh-CN": "来自 API 的首页", "en-US": "Home from API"},
                        ),
                    ),
                    ParagraphBlock(
                        id="b1-p1",
                        type="paragraph",
                        props=ParagraphBlockProps(
                            text={
                                "zh-CN": "该页面数据来自 /api/v1/sites/{siteId}/routes/resolve（stub）。",
                                "en-US": "This page is served from /api/v1/sites/{siteId}/routes/resolve (stub).",
                            }
                        ),
                    ),
                    DividerBlock(
                        id="b1-div",
                        type="divider",
                        props=DividerBlockProps(variant="subtle"),
                    ),
                ],
            )
        ],
    )


def build_about_document() -> DocumentIR:
    return DocumentIR(
        version=1,
        meta=DocumentMeta(
            title={"zh-CN": "关于 Celestial", "en-US": "About Celestial"},
            description={
                "zh-CN": "后端 stub：/about 页面。",
                "en-US": "Backend stub: /about page.",
            },
        ),
        blocks=[
            ContainerBlock(
                id="about",
                type="container",
                props=ContainerBlockProps(as_="section"),
                children=[
                    HeadingBlock(
                        id="about-h1",
                        type="heading",
                        props=HeadingBlockProps(level=1, text={"zh-CN": "关于（API）", "en-US": "About (API)"}),
                    ),
                    ParagraphBlock(
                        id="about-p1",
                        type="paragraph",
                        props=ParagraphBlockProps(
                            text={
                                "zh-CN": "该页面用于验证「路径 -> route resolver -> DocumentIR」的后端协议。",
                                "en-US": "This page validates the backend protocol for route resolution.",
                            }
                        ),
                    ),
                ],
            )
        ],
    )


def build_blog_document(*, slug: str) -> DocumentIR:
    return DocumentIR(
        version=1,
        meta=DocumentMeta(
            title={"zh-CN": f"博客：{slug}", "en-US": f"Blog: {slug}"},
            description={
                "zh-CN": "后端 stub：RouteTemplate 示例 /blog/:slug。",
                "en-US": "Backend stub: RouteTemplate example /blog/:slug.",
            },
        ),
        blocks=[
            ContainerBlock(
                id="blog",
                type="container",
                props=ContainerBlockProps(as_="article"),
                children=[
                    HeadingBlock(
                        id="blog-h1",
                        type="heading",
                        props=HeadingBlockProps(level=1, text={"zh-CN": f"博客文章：{slug}", "en-US": f"Blog: {slug}"}),
                    ),
                    ParagraphBlock(
                        id="blog-p1",
                        type="paragraph",
                        props=ParagraphBlockProps(
                            text={
                                "zh-CN": "该内容来自后端 stub，用于模拟未来 RouteTemplate resolver 输出。",
                                "en-US": "This content is from backend stub to simulate future RouteTemplate resolver output.",
                            }
                        ),
                    ),
                ],
            )
        ],
    )
