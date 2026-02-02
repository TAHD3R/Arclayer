import React from "react";
import ReactDOMServer from "react-dom/server";
import { escapeInject, dangerouslySkipEscape } from "vike/server";
import { redirect as vikeRedirect } from "vike/abort";

import { PageShell } from "./PageShell";
import { createPortalRouter } from "@/router";
import { parsePortalRequest } from "@/router/namespaces";
import { rewritePortalInputPathname } from "@/router/rewrite";
import { getPortalRuntimeConfigForSite } from "@/runtime/runtime-config";
import { resolveLocalizedValue, serializeCssVarsToStyleText } from "@celestial/site-renderer-core";
import type { LocalizedString, ViewerContext } from "@celestial/site-renderer-core";
import { HttpError } from "@/router/routerFallbacks";
import { DEFAULT_FALLBACK_LOCALE, detectRequestLocaleFromHeaders } from "@celestial/web-core/i18n";
import { getPortalFallbackSiteId, resolveSiteFromApi } from "@/runtime/site-api";

export { onRenderHtml };

type VikePageContextLike = {
  urlOriginal: string;
  // Vike built-in: null for nominal pages, boolean for error pages.
  is404?: boolean | null;
  // Vike built-in: used by vike to set the HTTP status code.
  abortStatusCode?: number;
  // Vike built-in: normalized incoming request headers.
  headers?: Record<string, string> | null;
  // Passed to the client via passToClient.
  viewerCtx?: { locale: "zh-CN" | "en-US"; fallbackLocale?: "zh-CN" | "en-US" };
  siteCtx?: { siteId: string; defaultLocale: "zh-CN" | "en-US"; fallbackLocale: "zh-CN" | "en-US" };
};

async function onRenderHtml(pageContext: VikePageContextLike) {
  const host = pageContext.headers?.host || "localhost";
  const req = parsePortalRequest(pageContext.urlOriginal);

  // Resolve site context (host -> siteId + locale defaults).
  // If backend is temporarily unavailable, we keep a deterministic fallback but the loaders will still surface 503.
  let siteCtx = pageContext.siteCtx;
  if (!siteCtx) {
    try {
      siteCtx = await resolveSiteFromApi(host);
    } catch {
      siteCtx = {
        siteId: getPortalFallbackSiteId(),
        defaultLocale: "zh-CN",
        fallbackLocale: DEFAULT_FALLBACK_LOCALE,
      };
    }
  }
  pageContext.siteCtx = siteCtx;

  const viewerCtx = pageContext.viewerCtx ?? {
    locale: detectRequestLocaleFromHeaders(pageContext.headers),
    fallbackLocale: siteCtx.fallbackLocale ?? DEFAULT_FALLBACK_LOCALE,
  };
  // Keep SSR/CSR consistent by serializing viewer context to the client.
  pageContext.viewerCtx = viewerCtx;

  const router = createPortalRouter({
    kind: "server",
    url: pageContext.urlOriginal,
    viewerCtx,
    siteCtx,
  });

  await router.load();

  // If TanStack Router triggers a redirect during SSR (via loader throws),
  // we must translate it to a real HTTP redirect response.
  const redirectInfo = getRedirectFromRouter(router);
  if (redirectInfo) {
    throw vikeRedirect(redirectInfo.url, redirectInfo.statusCode);
  }

  // Sync TanStack Router status to HTTP status code (SSR).
  // We mutate the pageContext because Vike computes `httpResponse.statusCode` from `pageContext.abortStatusCode`.
  const abortStatusCode = getAbortStatusCodeFromRouter(router, pageContext.urlOriginal);
  if (abortStatusCode && pageContext.abortStatusCode === undefined) {
    pageContext.abortStatusCode = abortStatusCode;
  }

  const runtimeConfig = await getPortalRuntimeConfigForSite(
    siteCtx.siteId,
    req.token ? { mode: req.mode, token: req.token } : { mode: req.mode },
  );
  const cssVarStyleText = serializeCssVarsToStyleText(runtimeConfig.theme.cssVars);
  const fontFaceStyleText = serializeFontFacesToStyleText(runtimeConfig);

  const appHtml = ReactDOMServer.renderToString(<PageShell router={router} />);

  const seo = getSeoFromRouter(router);

  const lang = seo.viewerCtx?.locale ?? "en";
  const title = seo.title ?? "Celestial Portal";
  const description = seo.description;
  const isPreviewMode = req.mode === "preview";

  const documentHtml = escapeInject`<!DOCTYPE html>
    <html lang="${lang}">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${title}</title>
        ${description ? escapeInject`<meta name="description" content="${description}" />` : ""}
        ${isPreviewMode ? escapeInject`<meta name="robots" content="noindex, nofollow, noarchive" />` : ""}
        <meta property="og:title" content="${title}" />
        ${description ? escapeInject`<meta property="og:description" content="${description}" />` : ""}
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="${lang}" />
        ${
          fontFaceStyleText
            ? escapeInject`<style id="portal-font-faces">${fontFaceStyleText}</style>`
            : ""
        }
        <style id="portal-css-vars">${cssVarStyleText}</style>
      </head>
      <body>
        <div id="page-view">${dangerouslySkipEscape(appHtml)}</div>
      </body>
    </html>`;

  return { documentHtml };
}

function getRedirectFromRouter(router: unknown): { url: string; statusCode: 301 | 302 } | null {
  const r = router as { state?: unknown };
  const state = r.state as { redirect?: unknown } | undefined;
  const redirect = state?.redirect as any;
  if (!redirect) return null;

  // TanStack Router redirect is a Response with a Location header.
  const headers = redirect.headers as unknown;
  const getHeader =
    headers && typeof headers === "object" && typeof (headers as any).get === "function"
      ? (name: string) => String((headers as any).get(name) ?? "")
      : null;

  const locationFromHeader = getHeader ? getHeader("Location") : "";
  const locationFromOptions =
    typeof redirect.options?.href === "string" ? redirect.options.href : "";
  const locationFromTo = typeof redirect.options?.to === "string" ? redirect.options.to : "";
  const location = locationFromHeader || locationFromOptions || locationFromTo;
  if (!location) return null;

  const statusRaw = redirect.status as unknown;
  const status = statusRaw === 301 ? 301 : 302;
  return { url: location, statusCode: status };
}

function getSeoFromRouter(router: unknown): {
  viewerCtx?: ViewerContext;
  title?: string;
  description?: string;
} {
  const r = router as { state?: unknown; options?: unknown };
  const state = r.state as { matches?: unknown } | undefined;
  const matches = Array.isArray(state?.matches) ? (state?.matches as unknown[]) : [];
  const leaf = matches.length ? (matches[matches.length - 1] as any) : undefined;
  const data = leaf?.loaderData as any;

  const ctxFromRouter = (r.options as any)?.context?.viewerCtx;
  const viewerCtx = isViewerContext(ctxFromRouter) ? (ctxFromRouter as ViewerContext) : undefined;
  const docMeta = data?.document?.meta as any;

  const title = viewerCtx
    ? resolveLocalizedValue(docMeta?.title as LocalizedString | undefined, viewerCtx)
    : undefined;
  const description = viewerCtx
    ? resolveLocalizedValue(docMeta?.description as LocalizedString | undefined, viewerCtx)
    : undefined;

  // With exactOptionalPropertyTypes enabled, we omit keys instead of setting them to `undefined`.
  const seo: { viewerCtx?: ViewerContext; title?: string; description?: string } = {};
  if (viewerCtx) seo.viewerCtx = viewerCtx;
  if (title !== undefined) seo.title = title;
  if (description !== undefined) seo.description = description;
  return seo;
}

function isViewerContext(value: unknown): value is ViewerContext {
  if (!value || typeof value !== "object") return false;
  const v = value as { locale?: unknown; fallbackLocale?: unknown };
  if (typeof v.locale !== "string") return false;
  if (v.fallbackLocale !== undefined && typeof v.fallbackLocale !== "string") return false;
  return true;
}

function getAbortStatusCodeFromRouter(router: unknown, urlOriginal: string): number | null {
  const pathnameRaw = safeGetPathname(urlOriginal);
  const r = router as {
    state?: unknown;
    getMatchedRoutes?: (pathname: string) => { foundRoute?: unknown };
  };

  // 404: no matching route for the requested pathname.
  if (pathnameRaw && typeof r.getMatchedRoutes === "function") {
    const pathname = rewritePortalInputPathname(pathnameRaw);
    const candidates = normalizePathnameCandidates(pathname);
    const found = candidates.some((p) => Boolean(r.getMatchedRoutes?.(p)?.foundRoute));
    if (!found) return 404;
  }

  // 403/500: route loader errors (we use loader throws in debug routes).
  const state = r.state as { matches?: unknown } | undefined;
  const matches = Array.isArray(state?.matches) ? (state?.matches as unknown[]) : [];
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i] as { status?: unknown; error?: unknown } | undefined;
    if (!m || typeof m !== "object") continue;
    if (m.status !== "error") continue;

    const err = m.error;
    if (err instanceof HttpError) return err.status;
    if (err && typeof err === "object" && typeof (err as any).status === "number") {
      return (err as any).status as number;
    }
    return 500;
  }

  return null;
}

function safeGetPathname(urlOriginal: string): string | null {
  try {
    return new URL(urlOriginal, "http://localhost").pathname;
  } catch {
    return null;
  }
}

function normalizePathnameCandidates(pathname: string): string[] {
  // Be tolerant with trailing slashes, because file-based routes may generate `/editor/` fullPaths.
  if (pathname === "/") return ["/"];
  const a = pathname;
  const b = pathname.endsWith("/") ? pathname.slice(0, -1) : `${pathname}/`;
  return a === b ? [a] : [a, b];
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
  const chunks: string[] = [];

  for (const font of fonts) {
    if (!font || typeof font !== "object") continue;
    if (typeof font.family !== "string" || !font.family.trim()) continue;
    const family = font.family.trim();
    const display = typeof font.display === "string" ? font.display : "swap";
    const sources = Array.isArray(font.sources) ? font.sources : [];

    for (const src of sources) {
      if (!src || typeof src !== "object") continue;
      if (typeof src.url !== "string" || !src.url.trim()) continue;
      const url = src.url.trim();
      const weight = typeof src.weight === "string" ? src.weight : undefined;
      const style = typeof src.style === "string" ? src.style : "normal";
      const format = typeof src.format === "string" ? src.format : undefined;

      const srcDecl = format
        ? `url("${escapeCssString(url)}") format("${escapeCssString(format)}")`
        : `url("${escapeCssString(url)}")`;

      const body = [
        `font-family: "${escapeCssString(family)}";`,
        `font-display: ${escapeCssString(display)};`,
        `src: ${srcDecl};`,
        style ? `font-style: ${escapeCssString(style)};` : "",
        weight ? `font-weight: ${escapeCssString(weight)};` : "",
      ]
        .filter(Boolean)
        .join("");

      chunks.push(`@font-face{${body}}`);
    }
  }

  return chunks.join("");
}

function escapeCssString(value: string): string {
  // Minimal hardening: avoid breaking out of the style tag / quotes.
  return value.replaceAll("</style", "<\\/style").replaceAll('"', '\\"');
}
