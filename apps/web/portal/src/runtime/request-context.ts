import type { ViewerContext } from "@celestial/site-block-protocol";
import type { PortalSiteContext } from "@celestial/web-types";
import {
  DEFAULT_FALLBACK_LOCALE,
  detectBrowserLocale,
  detectRequestLocaleFromHeaders,
} from "@celestial/web-core/i18n";

import { resolveSiteByIdFromApi, resolveSiteFromApi } from "./site-api";

type PortalPageContextLike = {
  urlOriginal: string;
  headers?: Record<string, string> | null;
  siteCtx?: PortalSiteContext;
  viewerCtx?: ViewerContext;
};

export async function ensurePortalRequestContext(
  pageContext: PortalPageContextLike,
  opts?: { siteId?: string; workspaceSlug?: string; basePath?: string },
): Promise<{ siteCtx: PortalSiteContext; viewerCtx: ViewerContext }> {
  let siteCtx = pageContext.siteCtx;
  if (!siteCtx) {
    if (opts?.siteId) {
      siteCtx = await resolveSiteByIdFromApi(opts.siteId);
    } else {
      const host =
        pageContext.headers?.host || getHostFromUrl(pageContext.urlOriginal) || getBrowserHost();
      const args: { host?: string | null; workspaceSlug?: string | null } = {
        host: host || "localhost",
      };
      if (opts?.workspaceSlug) args.workspaceSlug = opts.workspaceSlug;
      siteCtx = await resolveSiteFromApi(args);
    }
  }

  let viewerCtx = pageContext.viewerCtx;
  if (!viewerCtx) {
    const locale = pageContext.headers
      ? detectRequestLocaleFromHeaders(pageContext.headers)
      : detectBrowserLocale();
    viewerCtx = {
      locale,
      fallbackLocale: siteCtx.fallbackLocale ?? DEFAULT_FALLBACK_LOCALE,
      ...(opts?.basePath ? { basePath: opts.basePath } : {}),
    };
  }

  pageContext.siteCtx = siteCtx;
  pageContext.viewerCtx = viewerCtx;

  return { siteCtx, viewerCtx };
}

function getHostFromUrl(urlOriginal: string): string | null {
  try {
    return new URL(urlOriginal, "http://localhost").host;
  } catch {
    return null;
  }
}

function getBrowserHost(): string | null {
  if (typeof window === "undefined") return null;
  return window.location.host || null;
}
