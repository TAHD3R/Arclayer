import { redirect, render } from "vike/abort";

import { ApiError } from "@celestial/runtime/http";
import { resolveLocaleFromAcceptLanguage } from "@celestial/runtime/i18n";

import { ensurePortalRequestContext } from "@/runtime/request-context";
import { HttpError, toAbortStatus } from "@/runtime/http-error";
import { joinLocalePath, resolveCookieLocale, splitLocalePrefix } from "@/runtime/locale-routing";
import { normalizePathname, resolvePublicDocument } from "@/runtime/route-entry";

type PortalPublicPageContextLike = {
  urlOriginal: string;
  headers?: Record<string, string> | null;
};

export async function onBeforeRender(pageContext: PortalPublicPageContextLike) {
  const url = new URL(pageContext.urlOriginal, "http://localhost");
  const fullPathname = normalizePathname(url.pathname || "/");

  const parsed = parseWorkspacePublicPath(fullPathname);
  const workspaceSlug = parsed?.workspaceSlug;
  const pathnameWithPotentialLocale = parsed?.pathname ?? fullPathname;
  const basePath = parsed?.basePath;

  try {
    const { siteCtx, viewerCtx } = await ensurePortalRequestContext(pageContext, {
      ...(workspaceSlug ? { workspaceSlug } : {}),
      ...(basePath ? { basePath } : {}),
    });

    const supportedLocales =
      Array.isArray(siteCtx.supportedLocales) && siteCtx.supportedLocales.length
        ? siteCtx.supportedLocales
        : [siteCtx.defaultLocale, siteCtx.fallbackLocale].filter(Boolean);

    const { prefixCandidate, canonicalLocaleFromUrl, pathnameNoLocale } = splitLocalePrefix(
      pathnameWithPotentialLocale,
      supportedLocales,
    );

    const cookieLocale = resolveCookieLocale(pageContext.headers, supportedLocales);
    const acceptLanguage =
      pageContext.headers?.["accept-language"] ?? pageContext.headers?.["Accept-Language"];
    const negotiatedLocale = resolveLocaleFromAcceptLanguage(
      typeof acceptLanguage === "string" ? acceptLanguage : undefined,
      supportedLocales,
      siteCtx.defaultLocale,
    );

    const resolvedLocale =
      canonicalLocaleFromUrl ?? cookieLocale ?? negotiatedLocale ?? siteCtx.defaultLocale;
    const localeBasePath = applyBasePath(basePath, `/${resolvedLocale}`);

    const shouldRedirect =
      // Missing locale prefix.
      prefixCandidate === null ||
      // Unsupported locale prefix: strip it and redirect.
      (prefixCandidate !== null && canonicalLocaleFromUrl === null) ||
      // Non-canonical casing (e.g. /en-us -> /en-US).
      (canonicalLocaleFromUrl !== null && prefixCandidate !== canonicalLocaleFromUrl);

    if (shouldRedirect) {
      const canonicalPath = applyBasePath(
        basePath,
        joinLocalePath(resolvedLocale, pathnameNoLocale),
      );
      const target = canonicalPath + (url.search || "");
      throw redirect(target, 302);
    }

    const resolved = await resolvePublicDocument({
      pathname: pathnameNoLocale,
      siteId: siteCtx.siteId,
    });
    const renderViewerCtx = {
      ...viewerCtx,
      mode: "public" as const,
      locale: resolvedLocale,
      fallbackLocale: siteCtx.fallbackLocale,
      basePath: localeBasePath,
    };

    if (resolved.kind === "redirect") {
      throw redirect(applyBasePath(basePath, resolved.to), resolved.status);
    }
    if (resolved.kind === "not_found") {
      throw render(404, "Page not found: " + pathnameNoLocale);
    }

    return {
      pageContext: {
        pageProps: {
          mode: "public",
          document: resolved.document,
          match: resolved.match,
          dataSources: resolved.dataSources,
          ...(resolved.includes ? { includes: resolved.includes } : {}),
          ...(resolved.pageMeta ? { pageMeta: resolved.pageMeta } : {}),
          viewerCtx: renderViewerCtx,
          pathname: pathnameNoLocale,
          pathnameNoLocale,
          resolvedLocale,
          publicBasePath: basePath ?? "",
          showHydration: pathnameNoLocale === "/",
        },
        siteCtx,
        viewerCtx: renderViewerCtx,
      },
    };
  } catch (err) {
    if (err instanceof HttpError) {
      throw render(toAbortStatus(err.status), err.message);
    }
    if (err instanceof ApiError) {
      throw render(toAbortStatus(err.status), err.message);
    }
    throw err;
  }
}

function parseWorkspacePublicPath(pathnameRaw: string): {
  workspaceSlug: string;
  pathname: string;
  basePath: string;
} | null {
  const pathname = normalizePathname(pathnameRaw);
  const base = "/w/";
  if (!pathname.startsWith(base)) return null;

  const rest = pathname.slice(base.length);
  if (!rest) return null;

  const [slugRaw, ...segments] = rest.split("/");
  if (!slugRaw) return null;
  const workspaceSlug = safeDecodeURIComponent(slugRaw).trim();
  if (!workspaceSlug) return null;

  const sitePathname = segments.length ? "/" + segments.join("/") : "/";
  return {
    workspaceSlug,
    pathname: normalizePathname(sitePathname),
    basePath: "/w/" + workspaceSlug,
  };
}

function applyBasePath(basePath: string | undefined, pathname: string): string {
  const target = normalizePathname(pathname);
  if (!basePath) return target;
  return normalizePathname(basePath + target);
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
