from __future__ import annotations

import html

from fastapi import Request
from starlette.responses import HTMLResponse

from apps.api.config import Settings
from apps.api.core.exceptions import NotFound
from apps.api.http.pagination import PageParams, paginate_queryset
from apps.api.routers.library.repository import PublicLibraryRepository
from apps.api.routers.library.schema import (
    PublicLibraryAssetOut,
    PublicLibraryListQuery,
    PublicLibraryOrgOut,
    PublicLibraryPageOut,
)


def _wants_html(request: Request) -> bool:
    accept = (request.headers.get("accept") or "").lower()
    # If client explicitly requests html, return a minimal HTML page for SEO.
    return "text/html" in accept and "application/json" not in accept


class PublicLibraryService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.repo = PublicLibraryRepository()

    async def list_library(
        self,
        *,
        request: Request,
        org_slug: str,
        filters: PublicLibraryListQuery,
    ):
        org = await self.repo.get_org_by_slug(slug=org_slug)
        if org is None:
            raise NotFound(message="Not Found", error="NOT_FOUND")

        # Convert query into internal PageParams.
        params = PageParams(page=int(filters.page), size=int(filters.size))
        qs = self.repo.query_public_library_assets(org_id=org.id, filters=filters)
        page = await paginate_queryset(qs, params=params, out_schema=PublicLibraryAssetOut)

        payload = PublicLibraryPageOut(
            org=PublicLibraryOrgOut(id=org.id, slug=org.slug, name=org.name),
            items=list(page.items),
            total=page.total,
            page=page.page,
            size=page.size,
            pages=page.pages,
            next=page.next,
            prev=page.prev,
        )

        if _wants_html(request):
            return self._render_html(payload)
        return payload

    def _render_html(self, payload: PublicLibraryPageOut) -> HTMLResponse:
        # Keep HTML minimal and framework-agnostic; public frontend can replace later.
        title = f"{payload.org.name} - Public Library"
        items_html = []
        for a in payload.items:
            name = html.escape(a.title or a.original_filename or a.slug or str(a.id))
            url = html.escape(a.public_url_path)
            thumb = html.escape(a.public_thumb_url_path)
            items_html.append(
                f'<a class="card" href="{url}">'
                f'<img src="{thumb}" alt="{name}" loading="lazy" decoding="async" />'
                f'<div class="name">{name}</div>'
                f"</a>"
            )

        body = "\n".join(items_html) or "<p>No assets.</p>"
        page_hint = f"Page {payload.page}/{max(1, payload.pages)}"
        html_doc = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{html.escape(title)}</title>
    <style>
      body {{ font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; padding: 24px; }}
      header {{ margin-bottom: 16px; }}
      .grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }}
      .card {{ display: block; text-decoration: none; color: inherit; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; background: #fff; }}
      .card img {{ width: 100%; height: 140px; object-fit: cover; display: block; background: #f3f4f6; }}
      .card .name {{ padding: 10px; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }}
      .muted {{ color: #6b7280; font-size: 13px; }}
    </style>
  </head>
  <body>
    <header>
      <h1>{html.escape(payload.org.name)} - Public Library</h1>
      <div class="muted">{html.escape(page_hint)}</div>
    </header>
    <div class="grid">
      {body}
    </div>
  </body>
</html>"""
        return HTMLResponse(content=html_doc, status_code=200)
