import type { ViewerContext } from "@celestial/site-block-protocol";
import type { PortalSiteContext } from "@celestial/web-types";
import {
  DEFAULT_FALLBACK_LOCALE,
  detectBrowserLocale,
  detectRequestLocaleFromHeaders,
} from "@celestial/web-core/i18n";

import { getPortalSiteIdFromEnv, resolveSiteByIdFromApi, resolveSiteFromApi } from "./site-api";

type PortalPageContextLike = {
  urlOriginal: string;
  headers?: Record<string, string> | null;
  siteCtx?: PortalSiteContext;
  viewerCtx?: ViewerContext;
};

export async function ensurePortalRequestContext(
  pageContext: PortalPageContextLike,
  opts?: { siteId?: string },
): Promise<{ siteCtx: PortalSiteContext; viewerCtx: ViewerContext }> {
  let siteCtx = pageContext.siteCtx;
  if (!siteCtx) {
    if (opts?.siteId) {
      siteCtx = await resolveSiteByIdFromApi(opts.siteId);
    } else {
      const host =
        pageContext.headers?.host || getHostFromUrl(pageContext.urlOriginal) || getBrowserHost();
      try {
        siteCtx = await resolveSiteFromApi(host || "localhost");
      } catch (hostError) {
        // Host-based resolution failed — fall back to VITE_PORTAL_SITE_ID (dev/self-hosted)
        const fallbackSiteId = getPortalSiteIdFromEnv();
        if (fallbackSiteId) {
          siteCtx = await resolveSiteByIdFromApi(fallbackSiteId);
        } else {
          throw hostError;
        }
      }
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
