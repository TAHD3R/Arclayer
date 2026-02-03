from __future__ import annotations

from uuid import UUID

from apps.api.core.logging import get_logger
from apps.api.modules.sites.repository import SitesRepository
from apps.api.modules.sites.schema import (
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
)
from apps.api.modules.workspaces.models.workspace import Workspace

logger = get_logger(__name__)

DEMO_SITE_ID = UUID("00000000-0000-0000-0000-000000000001")


async def ensure_demo_site_ready() -> None:
    """
    Best-effort dev bootstrap for Portal SSR integration tests.

    Sprint 3:
    - The admin UI for site/page management isn't prioritized, but Portal still needs real data
      to validate the DB-backed resolver and revision flows.
    - This function creates a deterministic demo site (and some demo content) if missing.

    Production:
    - Do not call this in production environments.
    """

    # Ensure a default workspace exists.
    ws = await Workspace.filter(slug="default", is_active=True).first()
    if ws is None:
        logger.warning("Demo site bootstrap skipped: no default workspace found")
        return

    repo = SitesRepository()
    await repo.ensure_demo_site_ready(
        workspace_id=UUID(str(ws.id)),
        site_id=DEMO_SITE_ID,
        primary_host="localhost",
        home_document=_build_home_document(),
        about_document=_build_about_document(),
        blog_document=_build_blog_document(slug="hello"),
    )


def _build_home_document() -> DocumentIR:
    return DocumentIR(
        version=1,
        meta=DocumentMeta(
            title={"zh-CN": "Celestial Portal", "en-US": "Celestial Portal"},
            description={
                "zh-CN": "Sprint 3 demo：DB-backed sites/routes/resolve",
                "en-US": "Sprint 3 demo: DB-backed sites/routes/resolve",
            },
        ),
        blocks=[
            ContainerBlock(
                id="b1",
                type="container",
                props=ContainerBlockProps(as_tag="section"),
                children=[
                    HeadingBlock(
                        id="b1-h1",
                        type="heading",
                        props=HeadingBlockProps(level=1, text={"zh-CN": "来自 DB 的首页", "en-US": "Home from DB"}),
                    ),
                    ParagraphBlock(
                        id="b1-p1",
                        type="paragraph",
                        props=ParagraphBlockProps(
                            text={
                                "zh-CN": "该页面数据来自 DB（SitePageRevision），用于验证 Sprint 3 发布闭环。",
                                "en-US": "This page is served from DB to validate Sprint 3 publishing flow.",
                            }
                        ),
                    ),
                    DividerBlock(id="b1-div", type="divider", props=DividerBlockProps(variant="subtle")),
                ],
            )
        ],
    )


def _build_about_document() -> DocumentIR:
    return DocumentIR(
        version=1,
        meta=DocumentMeta(
            title={"zh-CN": "关于 Celestial", "en-US": "About Celestial"},
            description={"zh-CN": "Sprint 3 demo：/about", "en-US": "Sprint 3 demo: /about"},
        ),
        blocks=[
            ContainerBlock(
                id="about",
                type="container",
                props=ContainerBlockProps(as_tag="section"),
                children=[
                    HeadingBlock(
                        id="about-h1",
                        type="heading",
                        props=HeadingBlockProps(level=1, text={"zh-CN": "关于（DB）", "en-US": "About (DB)"}),
                    ),
                    ParagraphBlock(
                        id="about-p1",
                        type="paragraph",
                        props=ParagraphBlockProps(
                            text={
                                "zh-CN": "该页面用于验证 DB-backed 静态路由解析。",
                                "en-US": "This page validates DB-backed static route resolution.",
                            }
                        ),
                    ),
                ],
            )
        ],
    )


def _build_blog_document(*, slug: str) -> DocumentIR:
    return DocumentIR(
        version=1,
        meta=DocumentMeta(
            title={"zh-CN": f"博客：{slug}", "en-US": f"Blog: {slug}"},
            description={"zh-CN": "Sprint 3 demo：/blog/:slug", "en-US": "Sprint 3 demo: /blog/:slug"},
        ),
        blocks=[
            ContainerBlock(
                id="blog",
                type="container",
                props=ContainerBlockProps(as_tag="article"),
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
                                "zh-CN": "该内容来自 DB（EntryRevision），模拟 RouteTemplate resolver 输出。",
                                "en-US": "This content is from DB (EntryRevision) to simulate RouteTemplate resolver output.",
                            }
                        ),
                    ),
                ],
            )
        ],
    )
