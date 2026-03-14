import { isPageBlueprint } from "@celestial/renderer";
import { ApiError } from "@celestial/runtime/http";
import type {
  PortalResolveMode,
  PortalRouteMatch,
  PortalSiteContext,
} from "@celestial/internal-types";
import type {
  ContentRefIncludeErrorCodeV1,
  ContentRefIncludesMap,
  PageBlueprint,
  JsonValue,
  ResolveWarningV1,
} from "@celestial/block-protocol";
import type { DesignRenderDataSourcesV1 } from "@celestial/renderer";

export function getPortalApiPrefix(): string {
  // Use a relative prefix so it works in both SSR and browser via the Portal server proxy.
  // Default matches backend settings: /api/v1
  // Keep env naming consistent with Admin:
  // - VITE_API_PREFIX is shared across apps
  // - VITE_PORTAL_API_PREFIX is kept as a backwards-compatible fallback
  const raw = import.meta.env.VITE_API_PREFIX || import.meta.env.VITE_PORTAL_API_PREFIX;
  return raw && raw.startsWith("/") ? raw : "/api/v1";
}

function getPortalApiBaseUrlForBrowser(): string | null {
  const raw = (import.meta.env.VITE_API_BASE_URL || "").trim();
  if (!raw) return null;
  // Keep it strict: only accept absolute http(s) origins to avoid accidental relative prefixes.
  if (!raw.startsWith("http://") && !raw.startsWith("https://")) return null;
  return raw;
}

export function buildPortalApiFetchInput(url: URL): string {
  const path = url.pathname + url.search;
  if (typeof window === "undefined") {
    return new URL(path, getPortalApiOriginForSsr()).toString();
  }
  const baseUrl = getPortalApiBaseUrlForBrowser();
  if (baseUrl) return new URL(path, baseUrl).toString();
  return path;
}

export async function resolveSiteFromApi(args: {
  host?: string | null;
  workspaceSlug?: string | null;
}): Promise<PortalSiteContext> {
  const apiPrefix = getPortalApiPrefix();
  const requestPath = `${apiPrefix}/sites/resolve`;
  const url = new URL(requestPath, "http://localhost");
  const host = (args.host || "").trim();
  const workspaceSlug = (args.workspaceSlug || "").trim();
  if (workspaceSlug) url.searchParams.set("workspaceSlug", workspaceSlug);
  if (host) url.searchParams.set("host", host);

  const res = await fetch(buildPortalApiFetchInput(url), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw await toApiError(res, `Failed to resolve site (${res.status})`);

  const payload: unknown = await res.json();
  const data = getResponseData(payload);

  const siteId = getStringField(data, ["siteId", "site_id"]);
  const defaultLocale = getStringField(data, ["defaultLocale", "default_locale"]);
  const fallbackLocale = getStringField(data, ["fallbackLocale", "fallback_locale"]);
  const supportedLocalesUnknown =
    getUnknownField(data, "supportedLocales") ?? getUnknownField(data, "supported_locales");
  const supportedLocales = toStringArray(supportedLocalesUnknown);

  if (!siteId) throw new Error("Invalid siteId returned by API");
  const defaultLocaleOut = (defaultLocale || "").trim();
  const fallbackLocaleOut = (fallbackLocale || "").trim();
  if (!defaultLocaleOut) throw new Error("Invalid defaultLocale returned by API");
  if (!fallbackLocaleOut) throw new Error("Invalid fallbackLocale returned by API");

  const supportedOut = supportedLocales.length
    ? supportedLocales
    : [defaultLocaleOut, fallbackLocaleOut];

  return {
    siteId,
    defaultLocale: defaultLocaleOut,
    fallbackLocale: fallbackLocaleOut,
    supportedLocales: supportedOut,
  };
}

export async function resolveSiteByIdFromApi(siteId: string): Promise<PortalSiteContext> {
  const apiPrefix = getPortalApiPrefix();
  const requestPath = `${apiPrefix}/sites/${encodeURIComponent(siteId)}/context`;
  const url = new URL(requestPath, "http://localhost");

  const res = await fetch(buildPortalApiFetchInput(url), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw await toApiError(res, `Failed to resolve site by ID (${res.status})`);

  const payload: unknown = await res.json();
  const data = getResponseData(payload);

  const resolvedSiteId = getStringField(data, ["siteId", "site_id"]);
  const defaultLocale = getStringField(data, ["defaultLocale", "default_locale"]);
  const fallbackLocale = getStringField(data, ["fallbackLocale", "fallback_locale"]);
  const supportedLocalesUnknown =
    getUnknownField(data, "supportedLocales") ?? getUnknownField(data, "supported_locales");
  const supportedLocales = toStringArray(supportedLocalesUnknown);

  if (!resolvedSiteId) throw new Error("Invalid siteId returned by API");
  const defaultLocaleOut = (defaultLocale || "").trim();
  const fallbackLocaleOut = (fallbackLocale || "").trim();
  if (!defaultLocaleOut) throw new Error("Invalid defaultLocale returned by API");
  if (!fallbackLocaleOut) throw new Error("Invalid fallbackLocale returned by API");

  const supportedOut = supportedLocales.length
    ? supportedLocales
    : [defaultLocaleOut, fallbackLocaleOut];

  return {
    siteId: resolvedSiteId,
    defaultLocale: defaultLocaleOut,
    fallbackLocale: fallbackLocaleOut,
    supportedLocales: supportedOut,
  };
}

export async function resolveRouteFromApi(
  pathname: string,
  siteId: string,
  opts: { mode: PortalResolveMode; token?: string },
): Promise<
  | {
      kind: "page";
      document: PageBlueprint;
      match: PortalRouteMatch;
      pageMeta?: { title?: string; description?: string };
      dataSources?: DesignRenderDataSourcesV1;
      includes?: ContentRefIncludesMap;
      warnings?: ResolveWarningV1[];
    }
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
  const res = await fetch(buildPortalApiFetchInput(url), {
    headers: { Accept: "application/json" },
  });
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

  // Backend standard output is `pageBlueprint` (SiteRouteResolveOut).
  // Keep backward-compat with older payloads that used `document`.
  const document = getRecordField(data, "pageBlueprint") ?? getRecordField(data, "document");
  if (!isPageBlueprint(document)) {
    throw new Error("Invalid PageBlueprint returned by API");
  }

  const pageMetaUnknown = getRecordField(data, "pageMeta") ?? getRecordField(data, "page_meta");
  const pageMetaTitle = (getStringField(pageMetaUnknown, ["title"]) ?? "").trim();
  const pageMetaDesc = (getStringField(pageMetaUnknown, ["description"]) ?? "").trim();
  const pageMeta =
    pageMetaTitle || pageMetaDesc
      ? Object.assign(
          {},
          pageMetaTitle ? { title: pageMetaTitle } : {},
          pageMetaDesc ? { description: pageMetaDesc } : {},
        )
      : undefined;

  // Both "page" and "route_template" are rendered as a "page" at runtime. We keep the
  // original match kind/pointers so editor host shells can initialize optimistic lock state.
  const dataSources = parseRouteDataSources(data);
  const includes = parseContentRefIncludesMap(data);
  const warnings = parseResolveWarnings(data);
  return {
    kind: "page",
    document,
    match: parsedMatch,
    ...(pageMeta ? { pageMeta } : {}),
    ...(dataSources ? { dataSources } : {}),
    ...(includes ? { includes } : {}),
    ...(warnings ? { warnings } : {}),
  };
}

export type LegacyContentEntryRevisionState = "draft" | "published";

export type LegacyContentEntryRevisionSnapshot = {
  /** Page blueprint for the entry revision (snapshot payload). */
  page_blueprint: PageBlueprint;
  /** Field values for the entry revision (snapshot payload). */
  field_values: Record<string, JsonValue>;
  /** Optional metadata payload for the entry revision (snapshot payload). */
  meta?: Record<string, JsonValue>;
};

export async function fetchLegacyContentEntryRevision(
  wsId: string,
  entryId: string,
  state: LegacyContentEntryRevisionState = "draft",
): Promise<LegacyContentEntryRevisionSnapshot> {
  const apiPrefix = getPortalApiPrefix();

  const requestPath = `${apiPrefix}/workspaces/${encodeURIComponent(wsId)}/legacy-content/entries/${encodeURIComponent(entryId)}/revisions/${encodeURIComponent(state)}`;
  const url = new URL(requestPath, "http://localhost");

  // Browser: fetch relative to Portal origin (requires Portal server proxy for /api/*).
  // SSR (Node): fetch absolute to backend origin directly (avoid relative URLs in Node fetch).
  const res = await fetch(buildPortalApiFetchInput(url), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw await toApiError(res, `Failed to fetch content entry revision (${res.status})`);
  }

  const payload: unknown = await res.json();
  const data = getResponseData(payload);

  const snapshotUnknown = getUnknownField(data, "snapshot");
  if (!snapshotUnknown || typeof snapshotUnknown !== "object" || Array.isArray(snapshotUnknown)) {
    throw new Error("Invalid snapshot returned by API");
  }
  const snapshot = snapshotUnknown as Record<string, unknown>;

  // snapshot keys are persisted snake_case, but be tolerant with camelCase for fixtures.
  const pageBlueprintUnknown =
    snapshot.page_blueprint ??
    snapshot.pageBlueprint ??
    snapshot.design_document ??
    snapshot.designDocument ??
    snapshot.document ??
    null;
  if (
    !pageBlueprintUnknown ||
    typeof pageBlueprintUnknown !== "object" ||
    Array.isArray(pageBlueprintUnknown) ||
    !isPageBlueprint(pageBlueprintUnknown)
  ) {
    throw new Error("Invalid page_blueprint returned by API");
  }

  const fieldValuesUnknown = snapshot.field_values ?? snapshot.fieldValues ?? null;
  const fieldValues =
    fieldValuesUnknown &&
    typeof fieldValuesUnknown === "object" &&
    !Array.isArray(fieldValuesUnknown)
      ? toJsonObject(fieldValuesUnknown as Record<string, unknown>)
      : undefined;

  const metaUnknown = snapshot.meta ?? snapshot.Meta ?? null;
  const meta =
    metaUnknown && typeof metaUnknown === "object" && !Array.isArray(metaUnknown)
      ? toJsonObject(metaUnknown as Record<string, unknown>)
      : undefined;

  const out: LegacyContentEntryRevisionSnapshot = {
    page_blueprint: pageBlueprintUnknown as PageBlueprint,
    field_values: fieldValues ?? {},
  };
  if (meta) out.meta = meta;
  return out;
}

function parseRouteDataSources(data: unknown): DesignRenderDataSourcesV1 | undefined {
  const dsRec = getRecord(data);
  const ds = dsRec?.dataSources ?? dsRec?.data_sources;
  if (!ds) return undefined;

  const primaryRec = getRecord(ds);
  const primary = primaryRec?.primaryEntry ?? primaryRec?.primary_entry;
  if (!primary) return undefined;

  const id = getStringField(primary, ["id"])?.trim() || undefined;
  const snapUnknown = getUnknownField(primary, "data");
  const snap =
    snapUnknown && typeof snapUnknown === "object" && !Array.isArray(snapUnknown)
      ? (snapUnknown as Record<string, unknown>)
      : undefined;

  if (!id && !snap) return undefined;

  return {
    primaryEntry: Object.assign({}, id ? { id } : {}, snap ? { data: snap } : {}),
  };
}

function parseContentRefIncludesMap(data: unknown): ContentRefIncludesMap | undefined {
  const root = getRecord(data);
  const raw = root?.includes;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;

  const out: ContentRefIncludesMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const rec = value as Record<string, unknown>;

    const entryId = getStringField(rec, ["entryId", "entry_id"])?.trim();
    const resolvedStateRaw = getStringField(rec, ["resolvedState", "resolved_state"])?.trim();
    const resolvedState =
      resolvedStateRaw === "draft" || resolvedStateRaw === "published" ? resolvedStateRaw : null;

    if (!entryId || !resolvedState) continue;

    const documentRaw = getUnknownField(rec, "document");
    const document =
      documentRaw &&
      typeof documentRaw === "object" &&
      !Array.isArray(documentRaw) &&
      isPageBlueprint(documentRaw)
        ? (documentRaw as PageBlueprint)
        : null;

    const dataRaw = getUnknownField(rec, "data");
    const metaRaw = getUnknownField(rec, "meta");
    const dataObj =
      dataRaw && typeof dataRaw === "object" && !Array.isArray(dataRaw)
        ? toJsonObject(dataRaw as Record<string, unknown>)
        : undefined;
    const metaObj =
      metaRaw && typeof metaRaw === "object" && !Array.isArray(metaRaw)
        ? toJsonObject(metaRaw as Record<string, unknown>)
        : undefined;

    const errorRaw = getUnknownField(rec, "error");
    const errorRec =
      errorRaw && typeof errorRaw === "object" && !Array.isArray(errorRaw)
        ? (errorRaw as Record<string, unknown>)
        : undefined;
    const errorCodeRaw = errorRec ? getStringField(errorRec, ["code"])?.trim() : undefined;
    const errorCode = isContentRefIncludeErrorCodeV1(errorCodeRaw) ? errorCodeRaw : undefined;
    const errorMessage = errorRec ? getStringField(errorRec, ["message"]) : undefined;

    const error = errorCode
      ? { code: errorCode, ...(errorMessage ? { message: errorMessage } : {}) }
      : undefined;

    out[key] = Object.assign(
      {},
      { entryId, resolvedState, document },
      dataObj ? { data: dataObj } : {},
      metaObj ? { meta: metaObj } : {},
      error ? { error } : {},
    );
  }

  return Object.keys(out).length ? out : undefined;
}

function isJsonScalar(value: unknown): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function isJsonValue(value: unknown, depth: number = 0): value is JsonValue {
  if (depth > 32) return false;
  if (isJsonScalar(value)) return true;
  if (Array.isArray(value)) return value.every((v) => isJsonValue(v, depth + 1));
  if (value && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      if (!isJsonValue(v, depth + 1)) return false;
    }
    return true;
  }
  return false;
}

function toJsonObject(raw: Record<string, unknown>): Record<string, JsonValue> | undefined {
  const out: Record<string, JsonValue> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!isJsonValue(v)) continue;
    out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

const CONTENT_REF_INCLUDE_ERROR_CODES: ReadonlySet<ContentRefIncludeErrorCodeV1> = new Set([
  "NOT_FOUND",
  "CYCLE_DETECTED",
  "DEPTH_LIMIT",
  "INVALID_SCHEMA",
  "STATE_FORBIDDEN",
]);

function isContentRefIncludeErrorCodeV1(value: unknown): value is ContentRefIncludeErrorCodeV1 {
  return (
    typeof value === "string" &&
    CONTENT_REF_INCLUDE_ERROR_CODES.has(value as ContentRefIncludeErrorCodeV1)
  );
}

function parseResolveWarnings(data: unknown): ResolveWarningV1[] | undefined {
  const root = getRecord(data);
  const raw = root?.warnings;
  if (!Array.isArray(raw)) return undefined;

  const out: ResolveWarningV1[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    const code = getStringField(rec, ["code"])?.trim();
    const message = getStringField(rec, ["message"]);
    if (!code || !message) continue;
    const refEntryId = getStringField(rec, ["refEntryId", "ref_entry_id"])?.trim();
    const refNodeId = getStringField(rec, ["refNodeId", "ref_node_id"])?.trim();
    out.push(
      Object.assign(
        {},
        { code, message },
        refEntryId ? { refEntryId } : {},
        refNodeId ? { refNodeId } : {},
      ),
    );
  }
  return out.length ? out : undefined;
}

export async function fetchRuntimeConfigFromApi(
  siteId: string,
  opts: { mode: PortalResolveMode; token?: string; locale?: string },
): Promise<{
  theme: {
    cssVars: Record<string, string>;
    themeId?: string;
    version?: string;
    tokensCssUrl?: string;
    baseCssUrl?: string;
    presetId?: string;
    config?: Record<string, unknown>;
  };
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
  site?: {
    name?: string;
    subtitle?: string;
    url?: string;
    logoUrl?: string;
    faviconUrl?: string;
    contactEmail?: string;
  };
  siteLocalization?: {
    locale?: "zh-CN" | "en-US" | (string & {});
    timezone?: string;
    dateFormat?: string;
  };
  seo?: {
    defaultTitle?: string;
    defaultDescription?: string;
    titlePolicyV1?: import("@celestial/internal-types").TitlePolicyV1;
  };
}> {
  const apiPrefix = getPortalApiPrefix();

  const requestPath = `${apiPrefix}/sites/${encodeURIComponent(siteId)}/runtime`;
  const url = new URL(requestPath, "http://localhost");
  url.searchParams.set("mode", opts.mode);
  if (opts.token) url.searchParams.set("token", opts.token);
  if (opts.locale) url.searchParams.set("locale", opts.locale);

  const input =
    typeof window === "undefined"
      ? new URL(url.pathname + url.search, getPortalApiOriginForSsr()).toString()
      : url.pathname + url.search;

  const res = await fetch(input, { headers: { Accept: "application/json" } });
  if (!res.ok) throw await toApiError(res, `Failed to fetch runtime (${res.status})`);

  const payload: unknown = await res.json();
  const data = getResponseData(payload);
  const site = getRecordField(data, "site");
  const seoDefaults = getRecordField(data, "seo");
  const siteLocalization =
    getRecordField(data, "siteLocalization") ?? getRecordField(data, "site_localization");

  const theme = getRecordField(data, "theme");
  const cssVarsUnknown = getRecordField(theme, "cssVars");
  const cssVars = toStringRecord(cssVarsUnknown);
  const themeId = getStringField(theme, ["themeId", "theme_id"])?.trim() || undefined;
  const version = getStringField(theme, ["version"])?.trim() || undefined;
  const tokensCssUrl =
    getStringField(theme, ["tokensCssUrl", "tokens_css_url"])?.trim() || undefined;
  const baseCssUrl = getStringField(theme, ["baseCssUrl", "base_css_url"])?.trim() || undefined;
  const presetId = getStringField(theme, ["presetId", "preset_id"])?.trim() || undefined;
  const configUnknown = getUnknownField(theme, "config");
  const config =
    configUnknown && typeof configUnknown === "object" && !Array.isArray(configUnknown)
      ? (configUnknown as Record<string, unknown>)
      : undefined;
  const fontsUnknown = getUnknownField(data, "fonts");
  const fonts = Array.isArray(fontsUnknown) ? fontsUnknown : [];

  const siteName = getStringField(site, ["name"])?.trim() || undefined;
  const siteSubtitle = getStringField(site, ["subtitle"])?.trim() || undefined;
  const siteDescription = getStringField(site, ["description"])?.trim() || undefined;
  const siteUrl = getStringField(site, ["url"])?.trim() || undefined;
  const logoUrl = getStringField(site, ["logoUrl", "logo_url"])?.trim() || undefined;
  const faviconUrl = getStringField(site, ["faviconUrl", "favicon_url"])?.trim() || undefined;
  const contactEmail = getStringField(site, ["contactEmail", "contact_email"])?.trim() || undefined;
  const siteOut =
    siteName || siteSubtitle || siteDescription || siteUrl || logoUrl || faviconUrl || contactEmail
      ? Object.assign(
          {},
          siteName ? { name: siteName } : {},
          siteSubtitle ? { subtitle: siteSubtitle } : {},
          siteDescription ? { description: siteDescription } : {},
          siteUrl ? { url: siteUrl } : {},
          logoUrl ? { logoUrl } : {},
          faviconUrl ? { faviconUrl } : {},
          contactEmail ? { contactEmail } : {},
        )
      : undefined;

  const defaultTitle =
    getStringField(seoDefaults, ["defaultTitle", "default_title"])?.trim() || undefined;
  const defaultDescription =
    getStringField(seoDefaults, ["defaultDescription", "default_description"])?.trim() || undefined;
  const titlePolicyV1 = parseTitlePolicyV1(
    getUnknownField(seoDefaults, "titlePolicyV1") ??
      getUnknownField(seoDefaults, "title_policy_v1"),
  );
  const seoOut =
    defaultTitle || defaultDescription || titlePolicyV1
      ? Object.assign(
          {},
          defaultTitle ? { defaultTitle } : {},
          defaultDescription ? { defaultDescription } : {},
          titlePolicyV1 ? { titlePolicyV1 } : {},
        )
      : undefined;

  const locale = getStringField(siteLocalization, ["locale"])?.trim() || undefined;
  const supportedLocales = toStringArray(
    getUnknownField(siteLocalization, "supportedLocales") ??
      getUnknownField(siteLocalization, "supported_locales"),
  );
  const defaultLocale =
    getStringField(siteLocalization, ["defaultLocale", "default_locale"])?.trim() || undefined;
  const fallbackLocale =
    getStringField(siteLocalization, ["fallbackLocale", "fallback_locale"])?.trim() || undefined;
  const timezone = getStringField(siteLocalization, ["timezone"])?.trim() || undefined;
  const dateFormat =
    getStringField(siteLocalization, ["dateFormat", "date_format"])?.trim() || undefined;
  const siteLocalizationOut =
    locale || supportedLocales.length || defaultLocale || fallbackLocale || timezone || dateFormat
      ? Object.assign(
          {},
          locale ? { locale } : {},
          supportedLocales.length ? { supportedLocales } : {},
          defaultLocale ? { defaultLocale } : {},
          fallbackLocale ? { fallbackLocale } : {},
          timezone ? { timezone } : {},
          dateFormat ? { dateFormat } : {},
        )
      : undefined;

  return {
    theme: Object.assign(
      { cssVars },
      themeId ? { themeId } : {},
      version ? { version } : {},
      tokensCssUrl ? { tokensCssUrl } : {},
      baseCssUrl ? { baseCssUrl } : {},
      presetId ? { presetId } : {},
      config ? { config } : {},
    ),
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
    ...(siteOut ? { site: siteOut } : {}),
    ...(seoOut ? { seo: seoOut } : {}),
    ...(siteLocalizationOut ? { siteLocalization: siteLocalizationOut } : {}),
  };
}

function parseTitlePolicyV1(
  input: unknown,
): import("@celestial/internal-types").TitlePolicyV1 | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const rec = input as Record<string, unknown>;

  const partsUnknown = rec.parts;
  if (!Array.isArray(partsUnknown)) return undefined;

  const parts: import("@celestial/internal-types").TitlePolicyV1Part[] = [];
  for (const p of partsUnknown) {
    if (!p || typeof p !== "object" || Array.isArray(p)) continue;
    const pr = p as Record<string, unknown>;
    const kind = String(pr.kind || "").trim();
    const value = typeof pr.value === "string" ? pr.value : String(pr.value ?? "");
    if (!kind) continue;

    if (kind === "literal") {
      parts.push({ kind: "literal", value });
      continue;
    }
    if (kind === "token") {
      const token = value.trim();
      if (token === "pageTitle" || token === "siteName" || token === "siteSubtitle") {
        parts.push({ kind: "token", value: token });
      }
      continue;
    }
  }
  if (!parts.length) return undefined;

  const homeModeRaw = (typeof rec.homeMode === "string" ? rec.homeMode : rec.home_mode) as unknown;
  const homeMode = typeof homeModeRaw === "string" ? homeModeRaw.trim() : "";
  const parsedHomeMode =
    homeMode === "siteOnly" || homeMode === "policy"
      ? (homeMode as "siteOnly" | "policy")
      : undefined;

  const dedupeRaw = rec.dedupe;
  const dedupe = typeof dedupeRaw === "boolean" ? dedupeRaw : undefined;

  return Object.assign(
    {},
    { parts },
    parsedHomeMode ? { homeMode: parsedHomeMode } : {},
    dedupe !== undefined ? { dedupe } : {},
  );
}

export type PortalExtension = {
  pluginId: string;
  id: string;
  kind: "head_link" | "head_script" | "style" | "unknown";
  title: string;
  titleI18n?: string | null;
  permissionCode?: string | null;
  meta?: Record<string, unknown> | null;
};

export async function fetchPortalExtensionsFromApi(
  siteId: string,
  opts: { mode: PortalResolveMode; token?: string },
): Promise<{ items: PortalExtension[] }> {
  const apiPrefix = getPortalApiPrefix();
  const requestPath = `${apiPrefix}/sites/${encodeURIComponent(siteId)}/extensions/portal`;
  const url = new URL(requestPath, "http://localhost");
  url.searchParams.set("mode", opts.mode);
  if (opts.token) url.searchParams.set("token", opts.token);

  const input =
    typeof window === "undefined"
      ? new URL(url.pathname + url.search, getPortalApiOriginForSsr()).toString()
      : url.pathname + url.search;

  const res = await fetch(input, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw await toApiError(res, `Failed to fetch portal extensions (${res.status})`);
  }

  const payload: unknown = await res.json();
  const data = getResponseData(payload);
  const itemsUnknown = getUnknownField(data, "items");
  const items = Array.isArray(itemsUnknown) ? itemsUnknown : [];

  const parsed = items
    .map((raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
      const pluginId = (getStringField(raw, ["pluginId", "plugin_id"]) ?? "").trim();
      const id = (getStringField(raw, ["id"]) ?? "").trim();
      const kindRaw = (getStringField(raw, ["kind"]) ?? "").trim();
      const title = (getStringField(raw, ["title"]) ?? "").trim();
      if (!pluginId || !id || !title) return null;

      const kind =
        kindRaw === "head_link" || kindRaw === "head_script" || kindRaw === "style"
          ? kindRaw
          : "unknown";

      const titleI18n = getStringField(raw, ["titleI18n", "title_i18n"]);
      const permissionCode = getStringField(raw, ["permissionCode", "permission_code"]);
      const metaUnknown = getUnknownField(raw, "meta");
      const meta =
        metaUnknown && typeof metaUnknown === "object" && !Array.isArray(metaUnknown)
          ? (metaUnknown as Record<string, unknown>)
          : null;

      return {
        pluginId,
        id,
        kind,
        title,
        titleI18n: titleI18n ?? null,
        permissionCode: permissionCode ?? null,
        meta,
      } satisfies PortalExtension;
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  return { items: parsed };
}

function getPortalApiOriginForSsr(): string {
  const raw = (
    process.env.VITE_API_BASE_URL ||
    process.env.VITE_API_PROXY_TARGET ||
    // Backwards-compatible fallback (older Portal-only naming).
    process.env.PORTAL_API_PROXY_TARGET ||
    ""
  ).trim();
  if (raw) return raw;

  // Dev-friendly fallback:
  // - Admin/Studio default to localhost:8000 when no base URL/proxy is provided.
  // - Portal SSR should behave the same to avoid hard failure on local pages.
  const isProd = process.env.NODE_ENV === "production";
  if (!isProd) return "http://127.0.0.1:8000";

  throw new Error(
    "Missing VITE_API_BASE_URL (preferred) or VITE_API_PROXY_TARGET for SSR API route source.",
  );
}

export async function toApiError(res: Response, fallbackMessage: string): Promise<ApiError> {
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

export function parsePortalRouteMatch(input: unknown): PortalRouteMatch {
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
  const variantId = getStringField(input, ["variantId", "variant_id"]);
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
    variantId: typeof variantId === "string" && variantId.trim() ? variantId.trim() : null,
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

export function getRecordField(obj: unknown, key: string): unknown {
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

export function getResponseData(payload: unknown): unknown {
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

function toStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const v of input) {
    if (typeof v !== "string") continue;
    const s = v.trim();
    if (!s) continue;
    out.push(s);
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
