import { isCoreDocumentIR } from "@celestial/site-renderer-core";
import type { CoreDocumentIR } from "@celestial/site-renderer-core";
import { ApiError } from "@celestial/web-core/http";

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
  if (!res.ok) throw await toApiError(res, `Failed to resolve site (${res.status})`);

  const payload: unknown = await res.json();
  const data = getResponseData(payload);

  const siteId = getStringField(data, ["siteId", "site_id"]);
  const defaultLocale = getStringField(data, ["defaultLocale", "default_locale"]);
  const fallbackLocale = getStringField(data, ["fallbackLocale", "fallback_locale"]);

  if (!siteId) throw new Error("Invalid siteId returned by API");
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
  | { kind: "page"; document: CoreDocumentIR; match: PortalRouteMatch }
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
    throw await toApiError(res, `Failed to resolve route (${res.status})`);
  }

  const payload: unknown = await res.json();
  const data = getResponseData(payload);
  const match = getRecordField(data, "match");
  const parsedMatch = parsePortalRouteMatch(match);
  const matchKind = parsedMatch.kind;
  if (matchKind === "not_found") {
    return { kind: "not_found" };
  }
  if (matchKind === "redirect") {
    // Backend outputs camelCase by default (BaseSchema alias_generator=to_camel).
    // Be tolerant with snake_case for local fixtures.
    const to = parsedMatch.redirectTo;
    const statusRaw = parsedMatch.redirectStatus;
    const status = statusRaw === 301 || statusRaw === 302 ? statusRaw : null;
    if (!to || !to.startsWith("/")) {
      throw new Error("Invalid redirect target returned by API");
    }
    if (!status) {
      throw new Error("Invalid redirect status returned by API");
    }
    return { kind: "redirect", to, status };
  }

  const document = getRecordField(data, "document");
  if (!isCoreDocumentIR(document)) {
    throw new Error("Invalid DocumentIR returned by API");
  }

  // Both "page" and "route_template" are rendered as a "page" at runtime. We keep the
  // original match kind/pointers so editor host shells can initialize optimistic lock state.
  return { kind: "page", document, match: parsedMatch };
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
  if (!res.ok) throw await toApiError(res, `Failed to fetch runtime (${res.status})`);

  const payload: unknown = await res.json();
  const data = getResponseData(payload);
  const theme = getRecordField(data, "theme");
  const cssVarsUnknown = getRecordField(theme, "cssVars");
  const cssVars = toStringRecord(cssVarsUnknown);
  const fontsUnknown = getUnknownField(data, "fonts");
  const fonts = Array.isArray(fontsUnknown) ? fontsUnknown : [];

  return {
    theme: { cssVars },
    fonts: fonts
      .map((f) => {
        const family = (getStringField(f, ["family"]) ?? "").trim();
        if (!family) return null;

        const display = parseFontDisplay(getUnknownField(f, "display"));
        const sourcesInput = getUnknownField(f, "sources");
        const sources = Array.isArray(sourcesInput)
          ? sourcesInput.map(parseFontSource).filter((x): x is NonNullable<typeof x> => Boolean(x))
          : [];

        return Object.assign({ family }, display ? { display } : {}, { sources });
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x)),
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

async function toApiError(res: Response, fallbackMessage: string): Promise<ApiError> {
  let message = fallbackMessage;
  let error: string | undefined;
  let meta: unknown;

  try {
    const payload: unknown = await res.json();
    if (
      typeof getStringField(payload, ["message"]) === "string" &&
      (getStringField(payload, ["message"]) ?? "").trim()
    ) {
      message = (getStringField(payload, ["message"]) ?? fallbackMessage).trim();
    }
    const errStr = getStringField(payload, ["error"]);
    if (typeof errStr === "string" && errStr.trim()) {
      error = errStr.trim();
    }
    const metaVal = getUnknownField(payload, "meta");
    if (metaVal !== undefined) {
      meta = metaVal;
    }
  } catch {
    // Ignore JSON parsing errors: keep fallbackMessage.
  }

  // With `exactOptionalPropertyTypes`, omit optional keys instead of passing `undefined`.
  const args: { status: number; message: string; error?: string; meta?: unknown } = {
    status: res.status,
    message,
  };
  if (error) args.error = error;
  if (meta !== undefined) args.meta = meta;
  return new ApiError(args);
}

export type PortalRouteMatch = {
  kind: "page" | "route_template" | "redirect" | "not_found";
  params: Record<string, string>;
  redirectTo: string | null;
  redirectStatus: 301 | 302 | null;
  pageId: string | null;
  entryId: string | null;
  revision: number | null;
  revisionState: "draft" | "published" | null;
  draftRevision: number | null;
  publishedRevision: number | null;
};

function parsePortalRouteMatch(input: unknown): PortalRouteMatch {
  const kindRaw = (getStringField(input, ["kind"]) ?? "").trim();
  const kind: PortalRouteMatch["kind"] =
    kindRaw === "page" ||
    kindRaw === "route_template" ||
    kindRaw === "redirect" ||
    kindRaw === "not_found"
      ? kindRaw
      : "not_found";

  const params = toStringRecord(getUnknownField(input, "params"));

  const redirectTo = getStringField(input, ["redirectTo", "redirect_to"]);
  const redirectStatus = getNumberField(input, ["redirectStatus", "redirect_status"]);
  const pageId = getStringField(input, ["pageId", "page_id"]);
  const entryId = getStringField(input, ["entryId", "entry_id"]);
  const revision = getNumberField(input, ["revision"]);
  const revisionState = getStringField(input, ["revisionState", "revision_state"]);
  const draftRevision = getNumberField(input, ["draftRevision", "draft_revision"]);
  const publishedRevision = getNumberField(input, ["publishedRevision", "published_revision"]);

  return {
    kind,
    params,
    redirectTo: typeof redirectTo === "string" && redirectTo.trim() ? redirectTo.trim() : null,
    redirectStatus: redirectStatus === 301 || redirectStatus === 302 ? redirectStatus : null,
    pageId: typeof pageId === "string" && pageId.trim() ? pageId.trim() : null,
    entryId: typeof entryId === "string" && entryId.trim() ? entryId.trim() : null,
    revision: typeof revision === "number" ? revision : null,
    revisionState:
      revisionState === "draft" || revisionState === "published" ? revisionState : null,
    draftRevision: typeof draftRevision === "number" ? draftRevision : null,
    publishedRevision: typeof publishedRevision === "number" ? publishedRevision : null,
  };
}

function getRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function getUnknownField(obj: unknown, key: string): unknown {
  const rec = getRecord(obj);
  if (!rec) return undefined;
  return rec[key];
}

function getRecordField(obj: unknown, key: string): unknown {
  const value = getUnknownField(obj, key);
  return value;
}

function getStringField(obj: unknown, keys: string[]): string | null {
  const rec = getRecord(obj);
  if (!rec) return null;
  for (const key of keys) {
    const v = rec[key];
    if (typeof v === "string") return v;
  }
  return null;
}

function getNumberField(obj: unknown, keys: string[]): number | null {
  const rec = getRecord(obj);
  if (!rec) return null;
  for (const key of keys) {
    const v = rec[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

function getResponseData(payload: unknown): unknown {
  const rec = getRecord(payload);
  if (!rec) return null;
  return rec.data;
}

function toStringRecord(input: unknown): Record<string, string> {
  const rec = getRecord(input);
  if (!rec) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(rec)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function parseFontDisplay(
  input: unknown,
): "auto" | "block" | "swap" | "fallback" | "optional" | null {
  if (input === "auto") return "auto";
  if (input === "block") return "block";
  if (input === "swap") return "swap";
  if (input === "fallback") return "fallback";
  if (input === "optional") return "optional";
  return null;
}

function parseFontSource(input: unknown): {
  url: string;
  format?: "woff2" | "woff" | "truetype" | "opentype";
  weight?: string;
  style?: "normal" | "italic" | "oblique";
} | null {
  const rec = getRecord(input);
  if (!rec) return null;
  const url = rec.url;
  if (typeof url !== "string" || !url.trim()) return null;

  const out: {
    url: string;
    format?: "woff2" | "woff" | "truetype" | "opentype";
    weight?: string;
    style?: "normal" | "italic" | "oblique";
  } = { url: url.trim() };

  const format = rec.format;
  if (format === "woff2" || format === "woff" || format === "truetype" || format === "opentype") {
    out.format = format;
  }

  const weight = rec.weight;
  if (typeof weight === "string" && weight.trim()) out.weight = weight.trim();

  const style = rec.style;
  if (style === "normal" || style === "italic" || style === "oblique") out.style = style;

  return out;
}
