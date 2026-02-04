import React from "react";
import ReactDOMServer from "react-dom/server";
import { escapeInject, dangerouslySkipEscape } from "vike/server";

import { PageShell } from "./PageShell";
import { ensurePortalRequestContext } from "@/runtime/request-context";
import { getPortalRuntimeConfigForSite } from "@/runtime/runtime-config";
import { fetchPortalExtensionsFromApi, type PortalExtension } from "@/runtime/site-api";
import { resolveLocalizedValue, serializeCssVarsToStyleText } from "@celestial/site-renderer-core";
import type { LocalizedString, ViewerContext } from "@celestial/site-renderer-core";

export { onRenderHtml };

type VikePageContextLike = {
  urlOriginal: string;
  headers?: Record<string, string> | null;
  viewerCtx?: { locale: "zh-CN" | "en-US"; fallbackLocale?: "zh-CN" | "en-US" };
  siteCtx?: { siteId: string; defaultLocale: "zh-CN" | "en-US"; fallbackLocale: "zh-CN" | "en-US" };
  pageProps?: { mode?: string; token?: string; document?: unknown };
  Page: React.ComponentType<any>;
};

async function onRenderHtml(pageContext: VikePageContextLike) {
  const { siteCtx, viewerCtx } = await ensurePortalRequestContext(pageContext);
  const mode = pageContext.pageProps?.mode ?? "public";
  const token = pageContext.pageProps?.token;
  const resolveMode =
    mode === "public" || mode === "editor-host" || mode === "debug" ? "public" : "preview";

  const runtimeConfig = await getPortalRuntimeConfigForSite(
    siteCtx.siteId,
    token ? { mode: resolveMode, token } : { mode: resolveMode },
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

  const seo = getSeoFromPageContext(pageContext, viewerCtx);
  const lang = seo.viewerCtx?.locale ?? "en";
  const title = seo.title ?? "Celestial Portal";
  const description = seo.description;
  const isNoIndex = mode !== "public";

  const documentHtml = escapeInject`<!DOCTYPE html>
    <html lang="${lang}">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${title}</title>
        ${description ? escapeInject`<meta name="description" content="${description}" />` : ""}
        ${isNoIndex ? escapeInject`<meta name="robots" content="noindex, nofollow, noarchive" />` : ""}
        <meta property="og:title" content="${title}" />
        ${description ? escapeInject`<meta property="og:description" content="${description}" />` : ""}
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="${lang}" />
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
  const doc = pageContext.pageProps?.document as { meta?: unknown } | undefined;
  const meta = doc?.meta as { title?: unknown; description?: unknown } | undefined;
  if (!viewerCtx || !meta) return viewerCtx ? { viewerCtx } : {};

  const title = resolveLocalizedValue(meta.title as LocalizedString | undefined, viewerCtx);
  const description = resolveLocalizedValue(
    meta.description as LocalizedString | undefined,
    viewerCtx,
  );

  const seo: { viewerCtx?: ViewerContext; title?: string; description?: string } = {};
  if (viewerCtx) seo.viewerCtx = viewerCtx;
  if (title !== undefined) seo.title = title;
  if (description !== undefined) seo.description = description;
  return seo;
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
