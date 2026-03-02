import React from "react";
import ReactDOMServer from "react-dom/server";
import { escapeInject, dangerouslySkipEscape } from "vike/server";

import { PageShell } from "./PageShell";
import { ensurePortalRequestContext } from "@/runtime/request-context";
import { parseModeFromUrl } from "@/runtime/route-entry";
import { getPortalRuntimeConfigForSite } from "@/runtime/runtime-config";
import { fetchPortalExtensionsFromApi, type PortalExtension } from "@/runtime/site-api";
import { resolvePortalTitle } from "@/runtime/seo-title";
import {
  isPageBlueprint,
  resolveLocalizedValue,
  serializeCssVarsToStyleText,
} from "@celestial/site-renderer-core";
import type { LocalizedString } from "@celestial/site-renderer-core";
import type { PortalSiteContext } from "@celestial/portal-types";
import type {
  DesignBindingExprV1,
  PageBlueprint,
  ViewerContext,
} from "@celestial/site-block-protocol";

export { onRenderHtml };

type VikePageContextLike = {
  urlOriginal: string;
  headers?: Record<string, string> | null;
  viewerCtx?: { locale: string; fallbackLocale?: string; basePath?: string };
  siteCtx?: PortalSiteContext;
  pageProps?: {
    mode?: string;
    token?: string;
    document?: unknown;
    pageMeta?: { title?: string; description?: string };
    pathnameNoLocale?: string;
    resolvedLocale?: string;
    publicBasePath?: string;
  };
  Page: React.ComponentType<Record<string, unknown>>;
};

async function onRenderHtml(pageContext: VikePageContextLike) {
  // Extract siteId from URL for editor/preview routes to avoid host-based resolution failure
  const parsed = parseModeFromUrl(pageContext.urlOriginal);
  const siteIdFromUrl =
    parsed?.mode === "editor" || parsed?.mode === "preview" ? parsed.siteId : undefined;
  const basePathFromUrl =
    parsed?.mode === "editor"
      ? `/editor/site/${parsed.siteId}`
      : parsed?.mode === "preview"
        ? `/preview/site/${parsed.siteId}`
        : undefined;

  const { siteCtx, viewerCtx } = await ensurePortalRequestContext(
    pageContext,
    siteIdFromUrl
      ? { siteId: siteIdFromUrl, ...(basePathFromUrl ? { basePath: basePathFromUrl } : {}) }
      : undefined,
  );
  const mode = pageContext.pageProps?.mode ?? "public";
  const token = pageContext.pageProps?.token;
  const resolveMode = mode === "public" || mode === "debug" ? "public" : "preview";

  const resolvedLocaleForRuntime =
    (pageContext.pageProps?.resolvedLocale ?? "").trim() ||
    (pageContext.viewerCtx?.locale ?? "").trim() ||
    siteCtx.defaultLocale;

  const runtimeConfig = await getPortalRuntimeConfigForSite(
    siteCtx.siteId,
    token
      ? { mode: resolveMode, token, locale: resolvedLocaleForRuntime }
      : { mode: resolveMode, locale: resolvedLocaleForRuntime },
  );

  const portalExtensions = await fetchPortalExtensionsFromApi(
    siteCtx.siteId,
    token ? { mode: resolveMode, token } : { mode: resolveMode },
  );
  const portalHeadExtensionsHtml = serializePortalExtensionsToHeadHtml(portalExtensions.items);

  const cssVarStyleText = serializeCssVarsToStyleText(runtimeConfig.theme.cssVars);
  const fontFaceStyleText = serializeFontFacesToStyleText(runtimeConfig);
  const themeTokensCssUrl = runtimeConfig.theme.tokensCssUrl;
  const themeBaseCssUrl = runtimeConfig.theme.baseCssUrl;

  const appHtml = ReactDOMServer.renderToString(<PageShell pageContext={pageContext} />);

  const pageSeo = getSeoFromPageContext(pageContext, viewerCtx);
  const pageMetaTitle = (pageContext.pageProps?.pageMeta?.title ?? "").trim() || undefined;
  const pageMetaDescription =
    (pageContext.pageProps?.pageMeta?.description ?? "").trim() || undefined;

  const lang =
    runtimeConfig.siteLocalization?.locale ??
    pageSeo.viewerCtx?.locale ??
    siteCtx.defaultLocale ??
    "en-US";

  const siteName = runtimeConfig.site?.name;
  const siteSubtitle = runtimeConfig.site?.subtitle;
  const siteTitle =
    siteName && siteSubtitle ? `${siteName} - ${siteSubtitle}` : siteName || undefined;

  const titlePolicyV1 = runtimeConfig.seo?.titlePolicyV1;
  const title =
    resolvePortalTitle({
      policy: titlePolicyV1,
      pathnameNoLocale: pageContext.pageProps?.pathnameNoLocale ?? "/",
      pageSeoTitle: pageSeo.title,
      pageMetaTitle,
      defaultTitle: runtimeConfig.seo?.defaultTitle,
      siteName,
      siteSubtitle,
      siteTitleFallback: siteTitle,
    }) ?? "Celestial Portal";
  const description =
    pageSeo.description ??
    pageMetaDescription ??
    runtimeConfig.site?.description ??
    runtimeConfig.seo?.defaultDescription;
  const faviconUrl = runtimeConfig.site?.faviconUrl;
  const isNoIndex = mode !== "public";

  const resolvedLocale = (pageContext.pageProps?.resolvedLocale ?? lang).trim() || "en-US";
  const pathnameNoLocale = (pageContext.pageProps?.pathnameNoLocale ?? "/").trim() || "/";
  const publicBasePath = (pageContext.pageProps?.publicBasePath ?? "").trim();
  const supportedLocales =
    runtimeConfig.siteLocalization?.supportedLocales ?? pageContext.siteCtx?.supportedLocales ?? [];
  const defaultLocale =
    runtimeConfig.siteLocalization?.defaultLocale ??
    pageContext.siteCtx?.defaultLocale ??
    resolvedLocale;

  const origin = resolveRequestOrigin(pageContext.headers);
  const canonicalUrl =
    !isNoIndex && origin
      ? origin +
        buildLocalePublicPath({
          basePath: publicBasePath,
          locale: resolvedLocale,
          pathnameNoLocale,
        })
      : null;
  const hreflangLinksHtml =
    !isNoIndex && origin && supportedLocales.length
      ? serializeHreflangLinks({
          origin,
          basePath: publicBasePath,
          pathnameNoLocale,
          supportedLocales,
          defaultLocale,
        })
      : "";

  const ogLocale = String(lang).replaceAll("-", "_");

  const documentHtml = escapeInject`<!DOCTYPE html>
    <html lang="${lang}">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${title}</title>
        ${description ? escapeInject`<meta name="description" content="${description}" />` : ""}
        ${isNoIndex ? escapeInject`<meta name="robots" content="noindex, nofollow, noarchive" />` : ""}
        ${canonicalUrl ? escapeInject`<link rel="canonical" href="${canonicalUrl}" />` : ""}
        ${hreflangLinksHtml ? dangerouslySkipEscape(hreflangLinksHtml) : ""}
        ${
          faviconUrl && isSafeUrl(faviconUrl)
            ? escapeInject`<link rel="icon" href="${faviconUrl}" />`
            : ""
        }
        <meta property="og:title" content="${title}" />
        ${description ? escapeInject`<meta property="og:description" content="${description}" />` : ""}
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="${ogLocale}" />
        ${siteName ? escapeInject`<meta property="og:site_name" content="${siteName}" />` : ""}
        ${themeTokensCssUrl ? escapeInject`<link rel="stylesheet" href="${themeTokensCssUrl}" />` : ""}
        ${themeBaseCssUrl ? escapeInject`<link rel="stylesheet" href="${themeBaseCssUrl}" />` : ""}
        ${fontFaceStyleText ? escapeInject`<style id="portal-font-faces">${fontFaceStyleText}</style>` : ""}
        <style id="portal-css-vars">${cssVarStyleText}</style>
        ${portalHeadExtensionsHtml ? dangerouslySkipEscape(portalHeadExtensionsHtml) : ""}
      </head>
      <body>
        <div id="page-view">${dangerouslySkipEscape(appHtml)}</div>
      </body>
    </html>`;

  return { documentHtml };
}

function getSeoFromPageContext(
  pageContext: { pageProps?: { document?: unknown } },
  viewerCtx: ViewerContext | undefined,
): { viewerCtx?: ViewerContext; title?: string; description?: string } {
  const docUnknown = pageContext.pageProps?.document;
  if (!viewerCtx) return {};
  if (!isPageBlueprint(docUnknown)) return { viewerCtx };

  const doc = docUnknown as PageBlueprint;
  const root = doc.nodesById[doc.rootId];
  if (!root || root.type !== "page_root") return { viewerCtx };

  const title = resolveSeoValue(root.seo?.title, viewerCtx);
  const description = resolveSeoValue(root.seo?.description, viewerCtx);

  const seo: { viewerCtx?: ViewerContext; title?: string; description?: string } = {};
  if (viewerCtx) seo.viewerCtx = viewerCtx;
  if (title !== undefined) seo.title = title;
  if (description !== undefined) seo.description = description;
  return seo;
}

function resolveSeoValue(
  value: LocalizedString | DesignBindingExprV1 | undefined,
  viewerCtx: ViewerContext,
): string | undefined {
  if (!value) return undefined;
  if (typeof value === "object" && (value as DesignBindingExprV1).kind === "binding") {
    // SSR SEO：不在 HTML 层执行 binding（避免引入数据源与安全边界问题）。
    // 有需要时可以在 resolve_route 端提前把 SEO 绑定解析成 literal/localized。
    return undefined;
  }
  return resolveLocalizedValue(value as LocalizedString, viewerCtx);
}

function serializeFontFacesToStyleText(runtimeConfig: unknown): string {
  const cfg = runtimeConfig as {
    fonts?: Array<{
      family: unknown;
      display?: unknown;
      sources?: Array<{
        url?: unknown;
        format?: unknown;
        weight?: unknown;
        style?: unknown;
      }>;
    }>;
  };

  const fonts = Array.isArray(cfg.fonts) ? cfg.fonts : [];
  if (!fonts.length) return "";

  const lines: string[] = [];
  for (const font of fonts) {
    const family = typeof font.family === "string" ? font.family.trim() : "";
    if (!family) continue;

    const display = typeof font.display === "string" ? font.display.trim() : "";
    const sources = Array.isArray(font.sources) ? font.sources : [];
    const src = sources
      .map((source) => {
        if (!source || typeof source !== "object") return null;
        const url = typeof source.url === "string" ? source.url.trim() : "";
        if (!url) return null;
        const format = typeof source.format === "string" ? source.format.trim() : "";
        return format ? `url("${url}") format("${format}")` : `url("${url}")`;
      })
      .filter((x): x is string => Boolean(x));

    if (!src.length) continue;

    const weight = typeof font.sources?.[0]?.weight === "string" ? font.sources[0].weight : "";
    const style = typeof font.sources?.[0]?.style === "string" ? font.sources[0].style : "";

    lines.push("@font-face {");
    lines.push(`  font-family: "${family}";`);
    lines.push(`  src: ${src.join(", ")};`);
    if (weight) lines.push(`  font-weight: ${weight};`);
    if (style) lines.push(`  font-style: ${style};`);
    if (display) lines.push(`  font-display: ${display};`);
    lines.push("}");
  }

  return lines.join("\n");
}

function escapeHtmlAttr(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function isSafeUrl(url: string): boolean {
  const u = url.trim();
  if (!u) return false;
  // Allow relative asset paths served by backend (e.g. /assets/..).
  if (u.startsWith("/")) return true;
  // Allow explicit http(s) URLs.
  return u.startsWith("https://") || u.startsWith("http://");
}

function resolveRequestOrigin(headers: Record<string, string> | null | undefined): string | null {
  const h = headers || null;
  const host = (h?.["x-forwarded-host"] || h?.host || "").toString().trim();
  if (!host) return null;
  const proto = (h?.["x-forwarded-proto"] || "").toString().trim().toLowerCase();
  const scheme = proto === "https" ? "https" : "http";
  return `${scheme}://${host}`;
}

function buildLocalePublicPath(args: {
  basePath: string;
  locale: string;
  pathnameNoLocale: string;
}): string {
  const base = (args.basePath || "").trim();
  const locale = (args.locale || "").trim();
  const pathname = normalizePathname(args.pathnameNoLocale || "/");
  const baseNorm = base ? normalizePathname(base) : "";
  const prefix = normalizePathname(`${baseNorm}/${locale}`);
  if (pathname === "/") return prefix;
  return normalizePathname(prefix + pathname);
}

function normalizePathname(pathnameRaw: string): string {
  const pathname = pathnameRaw.startsWith("/") ? pathnameRaw : `/${pathnameRaw}`;
  if (pathname === "/") return "/";
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function serializeHreflangLinks(args: {
  origin: string;
  basePath: string;
  pathnameNoLocale: string;
  supportedLocales: string[];
  defaultLocale: string;
}): string {
  const supported = Array.isArray(args.supportedLocales) ? args.supportedLocales : [];
  const origin = args.origin;
  const links = supported
    .map((locale) => {
      const loc = (locale || "").trim();
      if (!loc) return null;
      const href =
        origin +
        buildLocalePublicPath({
          basePath: args.basePath,
          locale: loc,
          pathnameNoLocale: args.pathnameNoLocale,
        });
      return `<link rel="alternate" hreflang="${escapeHtmlAttr(loc)}" href="${escapeHtmlAttr(href)}" />`;
    })
    .filter(Boolean);

  const def = (args.defaultLocale || "").trim();
  if (def) {
    const href =
      origin +
      buildLocalePublicPath({
        basePath: args.basePath,
        locale: def,
        pathnameNoLocale: args.pathnameNoLocale,
      });
    links.push(`<link rel="alternate" hreflang="x-default" href="${escapeHtmlAttr(href)}" />`);
  }

  return links.join("\n");
}

function serializePortalExtensionsToHeadHtml(items: PortalExtension[]): string {
  if (!items.length) return "";

  const lines: string[] = [];
  for (const item of items) {
    const kind = item.kind;
    const meta = item.meta ?? {};

    if (kind === "head_link") {
      const href = typeof meta.href === "string" ? meta.href.trim() : "";
      if (!isSafeUrl(href)) continue;
      const rel = typeof meta.rel === "string" ? meta.rel.trim() : "stylesheet";
      const asAttr = typeof meta.as === "string" ? meta.as.trim() : "";
      const typeAttr = typeof meta.type === "string" ? meta.type.trim() : "";

      const attrs = [`rel="${escapeHtmlAttr(rel)}"`, `href="${escapeHtmlAttr(href)}"`];
      if (asAttr) attrs.push(`as="${escapeHtmlAttr(asAttr)}"`);
      if (typeAttr) attrs.push(`type="${escapeHtmlAttr(typeAttr)}"`);
      lines.push(`<link ${attrs.join(" ")} />`);
      continue;
    }

    if (kind === "head_script") {
      const src = typeof meta.src === "string" ? meta.src.trim() : "";
      if (!isSafeUrl(src)) continue;
      const typeAttr = typeof meta.type === "string" ? meta.type.trim() : "";
      const defer = meta.defer === false ? false : true;
      const asyncAttr = meta.async === true;

      const attrs = [`src="${escapeHtmlAttr(src)}"`];
      if (typeAttr) attrs.push(`type="${escapeHtmlAttr(typeAttr)}"`);
      if (defer) attrs.push("defer");
      if (asyncAttr) attrs.push("async");
      lines.push(`<script ${attrs.join(" ")}></script>`);
      continue;
    }

    if (kind === "style") {
      const text = typeof meta.text === "string" ? meta.text : "";
      if (!text.trim()) continue;
      // Prevent accidental HTML injection through a closing </style> sequence.
      const safeText = text.replaceAll("</style", "<\\/style");
      lines.push(`<style data-plugin-id="${escapeHtmlAttr(item.pluginId)}">${safeText}</style>`);
      continue;
    }
  }

  return lines.join("\n");
}
