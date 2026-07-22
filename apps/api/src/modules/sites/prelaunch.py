from __future__ import annotations

from html import escape

from fastapi.responses import HTMLResponse

PRELAUNCH_TEMPLATE_VERSION = "arclayer-prelaunch-v1"
_ROBOTS_DIRECTIVE = "noindex, nofollow, noarchive"


def render_prelaunch_page(*, host: str, locale: str | None) -> HTMLResponse:
    language = locale or "en-US"
    html = f"""<!doctype html>
<html lang="{escape(language)}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="{_ROBOTS_DIRECTIVE}" />
  <meta name="arclayer-template" content="{PRELAUNCH_TEMPLATE_VERSION}" />
  <title>{escape(host)} · Site in progress</title>
  <style>
    :root {{ color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }}
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; background: #f7f8fa; color: #111827; }}
    main {{ min-height: 100dvh; display: grid; place-items: center; padding: 32px; }}
    article {{ width: min(100%, 680px); padding: clamp(32px, 7vw, 64px); border: 1px solid #e5e7eb; border-radius: 20px; background: #fff; box-shadow: 0 24px 72px rgba(17, 24, 39, .08); }}
    .mark {{ display: inline-grid; width: 36px; height: 36px; place-items: center; border-radius: 10px; background: #155eef; color: #fff; font-weight: 700; }}
    .host {{ margin: 28px 0 12px; color: #667085; font: 500 13px/1.4 ui-monospace, SFMono-Regular, monospace; }}
    h1 {{ max-width: 12ch; margin: 0; font-size: clamp(40px, 8vw, 72px); line-height: .98; letter-spacing: -.05em; text-wrap: balance; }}
    p {{ max-width: 54ch; margin: 24px 0 0; color: #667085; font-size: 16px; line-height: 1.65; }}
  </style>
</head>
<body data-template-version="{PRELAUNCH_TEMPLATE_VERSION}">
  <main>
    <article>
      <div class="mark" aria-hidden="true">A</div>
      <div class="host">{escape(host)}</div>
      <h1>This site is taking shape.</h1>
      <p>The domain is connected. The first verified release will appear here when it is ready.</p>
    </article>
  </main>
</body>
</html>"""
    return HTMLResponse(
        html,
        status_code=200,
        headers={
            "Cache-Control": "no-store",
            "X-Robots-Tag": _ROBOTS_DIRECTIVE,
            "X-Arclayer-Template": PRELAUNCH_TEMPLATE_VERSION,
        },
    )


__all__ = ["PRELAUNCH_TEMPLATE_VERSION", "render_prelaunch_page"]
