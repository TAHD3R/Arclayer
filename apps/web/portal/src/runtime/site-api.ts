import { isCoreDocumentIR } from "@celestial/site-renderer-core";
import type { CoreDocumentIR } from "@celestial/site-renderer-core";

export function getPortalApiPrefix(): string {
  // Use a relative prefix so it works in both SSR and browser via the Portal server proxy.
  // Default matches backend settings: /api/v1
  // Keep env naming consistent with Admin:
  // - VITE_API_PREFIX is shared across apps
  // - VITE_PORTAL_API_PREFIX is kept as a backwards-compatible fallback
  const raw = import.meta.env.VITE_API_PREFIX || import.meta.env.VITE_PORTAL_API_PREFIX;
  return raw && raw.startsWith("/") ? raw : "/api/v1";
}

export function getPortalFallbackSiteId(): string {
  // Sprint 1: keep it deterministic for local dev. Multi-site resolution is done via /sites/resolve.
  return import.meta.env.VITE_PORTAL_SITE_ID || "00000000-0000-0000-0000-000000000001";
}

export type PortalSiteContext = {
  siteId: string;
  defaultLocale: "zh-CN" | "en-US";
  fallbackLocale: "zh-CN" | "en-US";
};

export async function resolveSiteFromApi(host: string): Promise<PortalSiteContext> {
  const apiPrefix = getPortalApiPrefix();
  const requestPath = `${apiPrefix}/sites/resolve`;
  const url = new URL(requestPath, "http://localhost");
  url.searchParams.set("host", host);

  const input =
    typeof window === "undefined"
      ? new URL(url.pathname + url.search, getPortalApiOriginForSsr()).toString()
      : url.pathname + url.search;

  const res = await fetch(input, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Failed to resolve site (${res.status})`);

  const payload = (await res.json()) as { data?: unknown };
  const data = (payload as any)?.data as any;

  const siteId = (data?.siteId ?? data?.site_id) as unknown;
  const defaultLocale = (data?.defaultLocale ?? data?.default_locale) as unknown;
  const fallbackLocale = (data?.fallbackLocale ?? data?.fallback_locale) as unknown;

  if (typeof siteId !== "string" || !siteId) throw new Error("Invalid siteId returned by API");
  if (defaultLocale !== "zh-CN" && defaultLocale !== "en-US") {
    throw new Error("Invalid defaultLocale returned by API");
  }
  if (fallbackLocale !== "zh-CN" && fallbackLocale !== "en-US") {
    throw new Error("Invalid fallbackLocale returned by API");
  }

  return { siteId, defaultLocale, fallbackLocale };
}

export async function resolveRouteFromApi(
  pathname: string,
  siteId: string,
  opts: { mode: "public" | "preview"; token?: string },
): Promise<
  | { kind: "page"; document: CoreDocumentIR }
  | { kind: "redirect"; to: string; status: 301 | 302 }
  | { kind: "not_found" }
> {
  const apiPrefix = getPortalApiPrefix();

  const requestPath = `${apiPrefix}/sites/${encodeURIComponent(siteId)}/routes/resolve`;
  const url = new URL(requestPath, "http://localhost");
  url.searchParams.set("path", pathname);
  url.searchParams.set("mode", opts.mode);
  if (opts.token) url.searchParams.set("token", opts.token);

  // Browser: fetch relative to Portal origin (requires Portal server proxy for /api/*).
  // SSR (Node): fetch absolute to backend origin directly (avoid relative URLs in Node fetch).
  const input =
    typeof window === "undefined"
      ? new URL(url.pathname + url.search, getPortalApiOriginForSsr()).toString()
      : url.pathname + url.search;

  const res = await fetch(input, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    // Keep error deterministic for SSR.
    throw new Error(`Failed to resolve route (${res.status})`);
  }

  const payload = (await res.json()) as { data?: unknown };
  const data = (payload as any)?.data as any;
  const match = data?.match as any;
  const matchKind = match?.kind as unknown;
  if (matchKind === "not_found") {
    return { kind: "not_found" };
  }
  if (matchKind === "redirect") {
    // Backend outputs camelCase by default (BaseSchema alias_generator=to_camel).
    // Be tolerant with snake_case for local fixtures.
    const to = (match?.redirectTo ?? match?.redirect_to) as unknown;
    const status = (match?.redirectStatus ?? match?.redirect_status) as unknown;
    if (typeof to !== "string" || !to.startsWith("/")) {
      throw new Error("Invalid redirect target returned by API");
    }
    if (status !== 301 && status !== 302) {
      throw new Error("Invalid redirect status returned by API");
    }
    return { kind: "redirect", to, status };
  }

  const document = data?.document as unknown;
  if (!isCoreDocumentIR(document)) {
    throw new Error("Invalid DocumentIR returned by API");
  }

  return { kind: "page", document };
}

export async function fetchRuntimeConfigFromApi(
  siteId: string,
  opts: { mode: "public" | "preview"; token?: string },
): Promise<{
  theme: { cssVars: Record<string, string> };
  fonts: Array<{
    family: string;
    display?: "auto" | "block" | "swap" | "fallback" | "optional";
    sources: Array<{
      url: string;
      format?: "woff2" | "woff" | "truetype" | "opentype";
      weight?: string;
      style?: "normal" | "italic" | "oblique";
    }>;
  }>;
}> {
  const apiPrefix = getPortalApiPrefix();

  const requestPath = `${apiPrefix}/sites/${encodeURIComponent(siteId)}/runtime`;
  const url = new URL(requestPath, "http://localhost");
  url.searchParams.set("mode", opts.mode);
  if (opts.token) url.searchParams.set("token", opts.token);

  const input =
    typeof window === "undefined"
      ? new URL(url.pathname + url.search, getPortalApiOriginForSsr()).toString()
      : url.pathname + url.search;

  const res = await fetch(input, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Failed to fetch runtime (${res.status})`);

  const payload = (await res.json()) as { data?: unknown };
  const data = (payload as any)?.data as any;
  const cssVars = (data?.theme?.cssVars ?? {}) as Record<string, string>;
  const fonts = (Array.isArray(data?.fonts) ? data.fonts : []) as any[];

  return {
    theme: { cssVars },
    fonts: fonts.map((f) => ({
      family: String(f.family ?? ""),
      display: f.display,
      sources: Array.isArray(f.sources) ? f.sources : [],
    })),
  };
}

function getPortalApiOriginForSsr(): string {
  const raw = (
    process.env.VITE_API_PROXY_TARGET ||
    // Backwards-compatible fallback (older Portal-only naming).
    process.env.PORTAL_API_PROXY_TARGET ||
    ""
  ).trim();
  if (!raw) {
    throw new Error("Missing VITE_API_PROXY_TARGET for SSR API route source.");
  }
  return raw;
}
