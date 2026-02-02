from __future__ import annotations

from uuid import UUID

from tortoise.transactions import in_transaction

from apps.api.core.logging import get_logger
from apps.api.models.setting import SettingRecord
from apps.api.models.site import SiteRecord
from apps.api.models.site_entry import EntryRecord, EntryRevisionRecord, EntryTypeRecord
from apps.api.models.site_page import SitePageRecord, SitePageRevisionRecord, SitePageVisibility
from apps.api.models.site_route_template import RouteTemplateRecord
from apps.api.models.workspace import Workspace
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
)
from apps.api.settings.scopes import SCOPE_TYPE_SITE

logger = get_logger(__name__)

DEMO_SITE_ID = UUID("00000000-0000-0000-0000-000000000001")
RUNTIME_SETTING_NAMESPACE = "site.runtime"


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

    async with in_transaction() as conn:
        site = await SiteRecord.filter(id=DEMO_SITE_ID).using_db(conn).first()
        if site is None:
            site = await SiteRecord.create(
                id=DEMO_SITE_ID,
                workspace_id=ws.id,
                slug="demo",
                name="Celestial Demo",
                default_locale="zh-CN",
                fallback_locale="en-US",
                primary_host="localhost",
                is_active=True,
                created_by_user_id=None,
            )
            logger.info("Created demo site", site_id=str(site.id), workspace_id=str(ws.id))

        # Upsert minimal pages (/) and (/about) with an initial published revision.
        await _ensure_page(conn=conn, site_id=site.id, path="/", document=_build_home_document())
        await _ensure_page(conn=conn, site_id=site.id, path="/about", document=_build_about_document())

        # Upsert runtime settings (theme tokens) for Portal SSR head injection.
        # This keeps runtime config DB-backed even before Admin UI exists.
        await SettingRecord.get_or_create(
            scope_type=SCOPE_TYPE_SITE,
            scope_id=site.id,
            namespace=RUNTIME_SETTING_NAMESPACE,
            defaults={
                "value": {
                    "theme": {
                        "cssVars": {
                            "--color-primary": "#1677ff",
                            "--color-background": "#ffffff",
                            "--color-foreground": "#111827",
                            "--color-border": "rgba(17, 24, 39, 0.12)",
                            "--font-sans": "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
                        }
                    },
                    "fonts": [],
                },
                "updated_by": None,
            },
            using_db=conn,
        )

        # Upsert a minimal entry type + one entry for /blog/:slug.
        et, _ = await EntryTypeRecord.get_or_create(
            site_id=site.id,
            code="blog_post",
            defaults={"name": "Blog Post", "fields_schema": None},
            using_db=conn,
        )

        entry, created_entry = await EntryRecord.get_or_create(
            site_id=site.id,
            entry_type_id=et.id,
            slug="hello",
            defaults={"draft_rev": 0, "published_rev": None, "created_by_user_id": None},
            using_db=conn,
        )
        if created_entry or not entry.published_rev:
            rev = 1
            await EntryRevisionRecord.create(
                entry_id=entry.id,
                rev=rev,
                data=None,
                document=_build_blog_document(slug=entry.slug).model_dump(by_alias=True),
                created_by_user_id=None,
                using_db=conn,
            )
            entry.draft_rev = rev
            entry.published_rev = rev
            await entry.save(update_fields=["draft_rev", "published_rev"], using_db=conn)

        # RouteTemplate: /blog/:slug -> blog_post
        await RouteTemplateRecord.get_or_create(
            site_id=site.id,
            path_pattern="/blog/:slug",
            defaults={
                "entry_type_id": et.id,
                "template_page_revision_id": None,
                "is_active": True,
            },
            using_db=conn,
        )


async def _ensure_page(*, conn, site_id: UUID, path: str, document: DocumentIR) -> None:
    page = await SitePageRecord.filter(site_id=site_id, path=path).using_db(conn).first()
    if page is None:
        page = await SitePageRecord.create(
            site_id=site_id,
            path=path,
            parent_id=None,
            sort_order=0,
            visibility=SitePageVisibility.PUBLIC,
            draft_rev=0,
            published_rev=None,
            created_by_user_id=None,
            using_db=conn,
        )

    if page.published_rev:
        return

    rev = 1
    await SitePageRevisionRecord.create(
        page_id=page.id,
        rev=rev,
        document=document.model_dump(by_alias=True),
        created_by_user_id=None,
        using_db=conn,
    )
    page.draft_rev = rev
    page.published_rev = rev
    await page.save(update_fields=["draft_rev", "published_rev"], using_db=conn)


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
