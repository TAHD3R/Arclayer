import type { ViewerContext } from "@celestial/site-block-protocol";
import type { PortalSiteContext } from "@celestial/portal-types";
import {
  DEFAULT_FALLBACK_LOCALE,
  detectBrowserLocale,
  detectRequestLocaleFromHeaders,
} from "@celestial/web-runtime/i18n";

import { resolveSiteByIdFromApi, resolveSiteFromApi } from "./site-api";

type PortalPageContextLike = {
  urlOriginal: string;
  headersOriginal?: unknown;
  headers?: Record<string, string> | null;
  siteCtx?: PortalSiteContext;
  viewerCtx?: ViewerContext;
};

export async function ensurePortalRequestContext(
  pageContext: PortalPageContextLike,
  opts?: { siteId?: string; workspaceSlug?: string; basePath?: string },
): Promise<{ siteCtx: PortalSiteContext; viewerCtx: ViewerContext }> {
  const headers = resolveHeaders(pageContext);

  let siteCtx = pageContext.siteCtx;
  if (!siteCtx) {
    if (opts?.siteId) {
      siteCtx = await resolveSiteByIdFromApi(opts.siteId);
    } else {
      const host =
        getForwardedHost(headers) ||
        headers?.host ||
        getHostFromUrl(pageContext.urlOriginal) ||
        getBrowserHost();
      const args: { host?: string | null; workspaceSlug?: string | null } = {
        host: host || "localhost",
      };
      if (opts?.workspaceSlug) args.workspaceSlug = opts.workspaceSlug;
      siteCtx = await resolveSiteFromApi(args);
    }
  }

  let viewerCtx = pageContext.viewerCtx;
  if (!viewerCtx) {
    const locale = headers ? detectRequestLocaleFromHeaders(headers) : detectBrowserLocale();
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

function resolveHeaders(pageContext: PortalPageContextLike): Record<string, string> | null {
  if (pageContext.headers && typeof pageContext.headers === "object") return pageContext.headers;

  // Vike expects `headersOriginal` to be provided by the server. We normalize it here to a
  // stable `{ [lowercaseHeaderName]: string }` shape used across Portal runtime.
  const raw = pageContext.headersOriginal;
  if (!raw || typeof raw !== "object") return null;

  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const key = String(k || "").toLowerCase();
    if (!key) continue;

    if (typeof v === "string") {
      out[key] = v;
      continue;
    }
    if (Array.isArray(v)) {
      out[key] = v.map((x) => String(x)).join(", ");
      continue;
    }
  }

  return Object.keys(out).length > 0 ? out : null;
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

function getForwardedHost(headers: Record<string, string> | null): string | null {
  if (!headers) return null;
  const raw = (headers["x-forwarded-host"] || "").trim();
  if (!raw) return null;
  // RFC 7239 style forwarding may include a comma-separated list.
  // We want the original client-facing host (first value).
  const first = raw.split(",")[0]?.trim() || "";
  return first || null;
}
