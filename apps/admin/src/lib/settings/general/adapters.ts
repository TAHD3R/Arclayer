import type { ProjectSettingsDetail } from "@arclayer/openapi";

import type { GeneralSettingsFormValues } from "@/types/settings-general";
import type { TitlePolicy, TitlePolicyPart } from "@/types/site-seo";
import { pickBool, pickString, pickStringArray } from "./utils";

/**
 * buildGeneralSettingsInitialValues：把 Project core settings 的 value 适配为网站设置表单值。
 *
 * 注意点：
 * - 这里做的是“读模型”适配；写回后端的 patch 仍由各 Tab 自己构造，避免过度耦合。
 */
export function buildGeneralSettingsInitialValues(params: {
  project?: ProjectSettingsDetail;
}): GeneralSettingsFormValues {
  const projectValue = params.project?.value;

  const siteName = pickString(projectValue, ["site", "name"]) ?? "Arclayer";
  const siteSubtitle = pickString(projectValue, ["site", "subtitle"]) ?? "";
  const siteDescription =
    pickString(projectValue, ["site", "description"]) ??
    pickString(projectValue, ["seo", "default_description"]) ??
    "";
  const siteUrl = pickString(projectValue, ["site", "url"]) ?? "";
  const siteLogoUrl = pickString(projectValue, ["site", "logo_url"]) ?? "";
  const siteLogoAssetId = pickString(projectValue, ["site", "logo_asset_id"]) ?? "";
  const siteFaviconUrl = pickString(projectValue, ["site", "favicon_url"]) ?? "";
  const siteFaviconAssetId = pickString(projectValue, ["site", "favicon_asset_id"]) ?? "";
  const seoOgImageUrl =
    pickString(projectValue, ["seo", "og_image_url"]) ??
    pickString(projectValue, ["seo", "open_graph_image_url"]) ??
    "";
  const seoOgImageAssetId =
    pickString(projectValue, ["seo", "og_image_asset_id"]) ??
    pickString(projectValue, ["seo", "open_graph_image_asset_id"]) ??
    "";
  const robotsDirective =
    pickString(projectValue, ["seo", "robots_directive"]) ??
    pickString(projectValue, ["seo", "default_robots_directive"]) ??
    "index,follow";
  const seoIndexingEnabled = !robotsDirective.toLowerCase().includes("noindex");
  const seoSitemapEnabled = pickBool(projectValue, ["seo", "sitemap_enabled"]) ?? true;
  const siteContactEmail = pickString(projectValue, ["site", "contact_email"]) ?? "";

  const defaultLocale =
    normalizeLocaleTag(pickString(projectValue, ["site_localization", "default_locale"])) ??
    normalizeLocaleTag(pickString(projectValue, ["site_localization", "locale"])) ??
    "zh-CN";
  const fallbackLocale =
    normalizeLocaleTag(pickString(projectValue, ["site_localization", "fallback_locale"])) ??
    "en-US";
  const supportedLocalesInput =
    pickStringArray(projectValue, ["site_localization", "supported_locales"]) ?? [];
  const supportedLocales = uniqLocales([...supportedLocalesInput, defaultLocale, fallbackLocale]);
  const timezone = pickString(projectValue, ["site_localization", "timezone"]) ?? "Asia/Shanghai";
  const useBrowserTimeZone =
    pickBool(projectValue, ["site_localization", "use_browser_timezone"]) ?? true;
  const dateFormat = pickString(projectValue, ["site_localization", "date_format"]) ?? "YYYY-MM-DD";
  const useRelativeDateTime =
    pickBool(projectValue, ["site_localization", "use_relative_datetime"]) ?? true;

  const seoTitlePolicy = parseTitlePolicy(
    pickUnknown(projectValue, ["seo", "title_policy_v1"]),
  ) ?? {
    parts: [
      { kind: "token", value: "pageTitle" },
      { kind: "literal", value: " - " },
      { kind: "token", value: "siteName" },
    ],
    homeMode: "siteOnly",
    dedupe: true,
  };

  const siteNameI18n =
    parseLocalizedStringMap(pickUnknown(projectValue, ["site", "name_i18n"])) ?? {};
  const siteNameI18nEnabled = Object.keys(siteNameI18n).length > 0;

  // Prefer new `site.description_i18n`, fall back to legacy `seo.default_description_i18n` to avoid
  // losing previously saved values.
  const siteDescriptionI18n =
    parseLocalizedStringMap(pickUnknown(projectValue, ["site", "description_i18n"])) ??
    parseLocalizedStringMap(pickUnknown(projectValue, ["seo", "default_description_i18n"])) ??
    {};
  const siteDescriptionI18nEnabled = Object.keys(siteDescriptionI18n).length > 0;

  return {
    siteName,
    siteNameI18nEnabled,
    siteNameI18n,
    siteSubtitle,
    siteDescription,
    siteDescriptionI18nEnabled,
    siteDescriptionI18n,
    siteUrl,
    siteLogoUrl,
    siteLogoAssetId,
    siteFaviconUrl,
    siteFaviconAssetId,
    seoOgImageUrl,
    seoOgImageAssetId,
    seoIndexingEnabled,
    seoSitemapEnabled,
    siteContactEmail,
    supportedLocales,
    defaultLocale,
    fallbackLocale,
    timezone,
    useBrowserTimeZone,
    dateFormat,
    useRelativeDateTime,
    seoTitlePolicy,
  };
}

function pickUnknown(obj: unknown, path: readonly string[]): unknown {
  let current: unknown = obj;
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function parseTitlePolicy(input: unknown): TitlePolicy | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const rec = input as Record<string, unknown>;
  const partsUnknown = rec.parts;
  if (!Array.isArray(partsUnknown)) return null;

  const parts: TitlePolicyPart[] = [];
  for (const p of partsUnknown) {
    if (!p || typeof p !== "object" || Array.isArray(p)) continue;
    const pr = p as Record<string, unknown>;
    const kind = typeof pr.kind === "string" ? pr.kind.trim() : "";
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
    }
  }
  if (!parts.length) return null;

  const homeModeRaw = (typeof rec.home_mode === "string" ? rec.home_mode : rec.homeMode) as unknown;
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

function parseLocalizedStringMap(input: unknown): Record<string, string> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (typeof k !== "string") continue;
    if (typeof v !== "string") continue;
    const key = k.trim();
    const val = v.trim();
    if (!key || !val) continue;
    out[key] = val;
  }
  return Object.keys(out).length ? out : {};
}

function normalizeLocaleTag(input: string | null | undefined): string | null {
  const raw = (input || "").trim();
  if (!raw) return null;
  const parts = raw.replaceAll("_", "-").split("-").filter(Boolean);
  if (!parts.length) return null;
  parts[0] = parts[0].toLowerCase();
  if (parts.length >= 2) {
    // Region subtag is typically 2 letters (e.g. en-US).
    if (parts[1].length === 2) parts[1] = parts[1].toUpperCase();
  }
  return parts.join("-");
}

function uniqLocales(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    const norm = normalizeLocaleTag(v);
    if (!norm) continue;
    const key = norm.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(norm);
  }
  return out;
}
