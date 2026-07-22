from __future__ import annotations

from html import escape

from fastapi.responses import HTMLResponse
from pydantic import BaseModel, ConfigDict

PRELAUNCH_TEMPLATE_VERSION = "arclayer-prelaunch-v2"
_ROBOTS_DIRECTIVE = "noindex, nofollow, noarchive"


class PrelaunchPageContext(BaseModel):
    model_config = ConfigDict(frozen=True)

    host: str
    locale: str | None
    site_name: str | None = None
    subtitle: str | None = None
    description: str | None = None
    logo_url: str | None = None
    favicon_url: str | None = None


class _PrelaunchCopy(BaseModel):
    model_config = ConfigDict(frozen=True)

    status: str
    default_name: str
    default_lead: str
    domain_connected: str
    release_pending: str
    title_suffix: str
    logo_alt_suffix: str
    blueprint_label: str


_EN_COPY = _PrelaunchCopy(
    status="Site in progress",
    default_name="A new site is taking shape",
    default_lead="The complete site will appear here when its first release is ready.",
    domain_connected="Domain connected",
    release_pending="First release pending",
    title_suffix="Coming soon",
    logo_alt_suffix="logo",
    blueprint_label="Site draft",
)
_ZH_COPY = _PrelaunchCopy(
    status="站点准备中",
    default_name="这里正在准备一个新站点",
    default_lead="首个正式版本准备完成后，这里会自动显示完整站点。",
    domain_connected="域名已连接",
    release_pending="等待首次发布",
    title_suffix="即将上线",
    logo_alt_suffix="标志",
    blueprint_label="站点草图",
)


def _clean(value: str | None) -> str | None:
    cleaned = str(value or "").strip()
    return cleaned or None


def _copy_for_locale(locale: str | None) -> _PrelaunchCopy:
    normalized = str(locale or "").strip().lower()
    return _ZH_COPY if normalized == "zh" or normalized.startswith("zh-") else _EN_COPY


def _site_mark(*, logo_url: str | None, site_name: str, copy: _PrelaunchCopy) -> str:
    if logo_url:
        alt = escape(f"{site_name} {copy.logo_alt_suffix}", quote=True)
        return (
            '<div class="site-mark site-mark--logo">'
            f'<img src="{escape(logo_url, quote=True)}" alt="{alt}" width="160" height="48" />'
            "</div>"
        )
    return """<div class="site-mark" aria-hidden="true">
      <svg viewBox="0 0 48 48" role="presentation">
        <rect x="9" y="7" width="30" height="34" rx="3" />
        <path d="M15 16h18M15 23h12M15 30h16" />
      </svg>
    </div>"""


def _blueprint_figure(label: str) -> str:
    return f"""<figure class="blueprint" aria-hidden="true">
      <svg viewBox="0 0 520 600" role="presentation">
        <path class="blueprint-grid" d="M34 84H486M34 166H486M34 248H486M34 330H486M34 412H486M34 494H486M116 30V570M198 30V570M280 30V570M362 30V570M444 30V570" />
        <rect class="blueprint-page" x="76" y="54" width="368" height="492" rx="12" />
        <path class="blueprint-line blueprint-line--strong" d="M110 100h164" />
        <path class="blueprint-line" d="M110 126h252M110 145h204" />
        <rect class="blueprint-block" x="110" y="198" width="300" height="132" rx="6" />
        <path class="blueprint-line blueprint-line--strong" d="M110 382h126" />
        <path class="blueprint-line" d="M110 408h286M110 427h238M110 446h270" />
        <path class="blueprint-corner" d="M64 90V42h48M432 42h48v48M480 510v48h-48M112 558H64v-48" />
        <circle class="blueprint-point" cx="410" cy="198" r="5" />
      </svg>
      <figcaption>{escape(label)}</figcaption>
    </figure>"""


def _render_prelaunch_html(context: PrelaunchPageContext) -> str:
    language = _clean(context.locale) or "en-US"
    copy = _copy_for_locale(language)
    site_name = _clean(context.site_name)
    display_name = site_name or copy.default_name
    subtitle = _clean(context.subtitle)
    description = _clean(context.description)
    lead = subtitle or description or copy.default_lead
    detail = description if subtitle and description and subtitle != description else None
    logo_url = _clean(context.logo_url)
    favicon_url = _clean(context.favicon_url)
    page_title = f"{site_name or context.host} · {copy.title_suffix}"
    meta_description = description or lead
    favicon = f'<link rel="icon" href="{escape(favicon_url, quote=True)}" />' if favicon_url else ""
    detail_html = f'<p class="description">{escape(detail)}</p>' if detail else ""

    return f"""<!doctype html>
<html lang="{escape(language, quote=True)}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="{_ROBOTS_DIRECTIVE}" />
  <meta name="description" content="{escape(meta_description, quote=True)}" />
  <meta name="theme-color" content="#f3f4f6" media="(prefers-color-scheme: light)" />
  <meta name="theme-color" content="#101216" media="(prefers-color-scheme: dark)" />
  <meta name="arclayer-template" content="{PRELAUNCH_TEMPLATE_VERSION}" />
  {favicon}
  <title>{escape(page_title)}</title>
  <style>
    :root {{ color-scheme: light dark; --canvas: #f3f4f6; --surface: #fbfbfc; --ink: #191b20; --muted: #686c76; --quiet: #8f939d; --line: rgba(25, 27, 32, .11); --grid: rgba(25, 27, 32, .055); --accent: #155eef; --accent-soft: rgba(21, 94, 239, .1); --shadow: 0 28px 80px rgba(22, 27, 38, .08), 0 2px 8px rgba(22, 27, 38, .04); font-family: Figtree, "Avenir Next", "Segoe UI", ui-sans-serif, system-ui, sans-serif; }}
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; background: var(--canvas); color: var(--ink); -webkit-font-smoothing: antialiased; }}
    main {{ min-height: 100svh; width: min(1180px, calc(100% - 48px)); margin: 0 auto; display: grid; grid-template-columns: minmax(0, 1fr) minmax(300px, .78fr); align-items: center; gap: clamp(48px, 8vw, 120px); padding: clamp(48px, 8vw, 96px) 0; }}
    .content {{ min-width: 0; }}
    .site-mark {{ display: grid; width: 48px; height: 48px; place-items: center; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); box-shadow: 0 8px 24px rgba(22, 27, 38, .06), 0 1px 3px rgba(22, 27, 38, .04); }}
    .site-mark svg {{ width: 30px; height: 30px; fill: none; stroke: var(--accent); stroke-width: 1.5; stroke-linecap: round; }}
    .site-mark--logo {{ width: min(220px, 100%); height: 56px; justify-content: start; padding: 4px; border: 0; background: transparent; box-shadow: none; }}
    .site-mark--logo img {{ display: block; max-width: 100%; width: auto; height: 48px; object-fit: contain; object-position: left center; outline: 1px solid rgba(0, 0, 0, .1); outline-offset: -1px; }}
    .status {{ display: flex; align-items: center; gap: 10px; margin: 34px 0 0; color: var(--muted); font-size: 13px; font-weight: 600; letter-spacing: .01em; }}
    .status::before {{ content: ""; width: 8px; height: 8px; border-radius: 999px; background: var(--accent); box-shadow: 0 0 0 5px var(--accent-soft); }}
    h1 {{ max-width: 13ch; margin: 18px 0 0; font-family: Poppins, Figtree, "Avenir Next", ui-sans-serif, system-ui, sans-serif; font-size: clamp(42px, 7vw, 74px); font-weight: 600; line-height: .99; letter-spacing: -.045em; text-wrap: balance; }}
    .lead {{ max-width: 52ch; margin: 26px 0 0; color: var(--muted); font-size: clamp(17px, 2vw, 20px); line-height: 1.55; }}
    .description {{ max-width: 58ch; margin: 14px 0 0; color: var(--quiet); font-size: 15px; line-height: 1.65; }}
    .release-state {{ display: flex; flex-wrap: wrap; gap: 12px 24px; margin: 36px 0 0; padding: 22px 0 0; border-top: 1px solid var(--line); list-style: none; }}
    .release-state li {{ display: flex; align-items: center; gap: 9px; color: var(--muted); font-size: 13px; }}
    .release-state svg {{ width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }}
    .release-state li:first-child {{ color: var(--ink); }}
    .host {{ margin: 28px 0 0; color: var(--quiet); font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }}
    .blueprint {{ position: relative; min-width: 0; margin: 0; border: 1px solid var(--line); border-radius: 18px; background-color: var(--surface); background-image: linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px); background-size: 28px 28px; box-shadow: var(--shadow); overflow: hidden; }}
    .blueprint svg {{ display: block; width: 100%; height: auto; }}
    .blueprint-grid {{ fill: none; stroke: var(--grid); stroke-width: 1; }}
    .blueprint-page {{ fill: color-mix(in srgb, var(--surface) 90%, var(--accent) 10%); stroke: var(--line); stroke-width: 1.5; }}
    .blueprint-line {{ fill: none; stroke: var(--muted); stroke-width: 4; stroke-linecap: round; opacity: .28; }}
    .blueprint-line--strong {{ stroke: var(--ink); opacity: .62; }}
    .blueprint-block {{ fill: var(--accent-soft); stroke: rgba(21, 94, 239, .32); stroke-width: 1.5; }}
    .blueprint-corner {{ fill: none; stroke: var(--accent); stroke-width: 2; stroke-linecap: round; }}
    .blueprint-point {{ fill: var(--accent); }}
    figcaption {{ position: absolute; right: 18px; bottom: 16px; color: var(--quiet); font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 10px; letter-spacing: .09em; }}
    @media (max-width: 760px) {{ main {{ width: min(100% - 32px, 620px); grid-template-columns: 1fr; gap: 44px; padding: 40px 0; }} h1 {{ max-width: 15ch; }} .blueprint {{ max-height: 360px; }} .blueprint svg {{ transform: translateY(-12%); }} }}
    @media (prefers-color-scheme: dark) {{ :root {{ --canvas: #101216; --surface: #171a20; --ink: #f2f3f5; --muted: #a6aab3; --quiet: #7e838e; --line: rgba(255, 255, 255, .11); --grid: rgba(255, 255, 255, .045); --accent: #6b9cff; --accent-soft: rgba(107, 156, 255, .12); --shadow: 0 0 0 1px rgba(255, 255, 255, .03), inset 0 1px 0 rgba(255, 255, 255, .04); }} .site-mark--logo img {{ outline-color: rgba(255, 255, 255, .1); }} }}
  </style>
</head>
<body data-template-version="{PRELAUNCH_TEMPLATE_VERSION}">
  <main>
    <section class="content" aria-labelledby="prelaunch-title">
      {_site_mark(logo_url=logo_url, site_name=display_name, copy=copy)}
      <div class="status">{escape(copy.status)}</div>
      <h1 id="prelaunch-title">{escape(display_name)}</h1>
      <p class="lead">{escape(lead)}</p>
      {detail_html}
      <ul class="release-state">
        <li><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 10 3 3 7-7" /></svg>{escape(copy.domain_connected)}</li>
        <li><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="6" /><path d="M10 7v3l2 1" /></svg>{escape(copy.release_pending)}</li>
      </ul>
      <div class="host">{escape(context.host)}</div>
    </section>
    {_blueprint_figure(copy.blueprint_label)}
  </main>
</body>
</html>"""


def render_prelaunch_page(context: PrelaunchPageContext) -> HTMLResponse:
    return HTMLResponse(
        _render_prelaunch_html(context),
        status_code=200,
        headers={
            "Cache-Control": "no-store",
            "X-Robots-Tag": _ROBOTS_DIRECTIVE,
            "X-Arclayer-Template": PRELAUNCH_TEMPLATE_VERSION,
        },
    )


__all__ = ["PRELAUNCH_TEMPLATE_VERSION", "PrelaunchPageContext", "render_prelaunch_page"]
