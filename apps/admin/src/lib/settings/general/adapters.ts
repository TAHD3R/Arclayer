import type { ProjectSettingsDetail } from "@arclayer/openapi/admin-types";
import type { SettingsDetail } from "@arclayer/openapi/admin-types";

import type { GeneralSettingsFormValues, StorageProvider } from "@/types/settings-general";
import type { TitlePolicy, TitlePolicyPart } from "@/types/site-seo";
import { pickBool, pickNumber, pickString, pickStringArray } from "./utils";

/**
 * buildGeneralSettingsInitialValues：把后端 core settings 的 value 适配为前端表单值。
 *
 * 注意点：
 * - 这里做的是“读模型”适配；写回后端的 patch 仍由各 Tab 自己构造，避免过度耦合。
 * - Secret 字段（如 s3_secret_access_key）由 API 掩码；UI 只允许“设置新值”，因此初始值固定为空串。
 */
export function buildGeneralSettingsInitialValues(params: {
  project?: ProjectSettingsDetail;
  system?: SettingsDetail;
}): GeneralSettingsFormValues {
  const projectValue = params.project?.value;
  const systemValue = params.system?.value;

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
  const siteAvatarPlaceholderUrl =
    pickString(projectValue, ["site", "avatar_placeholder_url"]) ?? "";
  const siteAvatarPlaceholderAssetId =
    pickString(projectValue, ["site", "avatar_placeholder_asset_id"]) ?? "";
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

  const storageProvider =
    (pickString(systemValue, ["storage", "provider"]) as StorageProvider | undefined) ?? "local";
  const storagePublicBaseUrl = pickString(systemValue, ["storage", "public_base_url"]) ?? "";

  const uploadChunkSizeMb = pickNumber(systemValue, ["storage", "upload_chunk_size_mb"]) ?? 8;
  const uploadMaxFileSizeMb =
    pickNumber(systemValue, ["storage", "upload_max_file_size_mb"]) ?? 2048;
  const uploadMaxAvatarSizeMb =
    pickNumber(systemValue, ["storage", "upload_max_avatar_size_mb"]) ?? 10;
  const uploadMaxSiteLogoSizeMb =
    pickNumber(systemValue, ["storage", "upload_max_site_logo_size_mb"]) ?? 20;
  const uploadMaxFaviconSizeMb =
    pickNumber(systemValue, ["storage", "upload_max_favicon_size_mb"]) ?? 2;

  const s3EndpointUrl = pickString(systemValue, ["storage", "s3_endpoint_url"]) ?? "";
  const s3Region = pickString(systemValue, ["storage", "s3_region"]) ?? "";
  const s3Bucket = pickString(systemValue, ["storage", "s3_bucket"]) ?? "";
  const s3AccessKeyId = pickString(systemValue, ["storage", "s3_access_key_id"]) ?? "";
  const s3ForcePathStyle = pickBool(systemValue, ["storage", "s3_force_path_style"]) ?? false;
  const s3PresignExpiresSeconds =
    pickNumber(systemValue, ["storage", "s3_presign_expires_seconds"]) ?? 900;

  const mailEnabled = pickBool(systemValue, ["mail", "enabled"]) ?? false;
  const mailServer = pickString(systemValue, ["mail", "server"]) ?? "localhost";
  const mailPort = pickNumber(systemValue, ["mail", "port"]) ?? 587;
  const mailUsername = pickString(systemValue, ["mail", "username"]) ?? "";
  const mailFrom = pickString(systemValue, ["mail", "mail_from"]) ?? "noreply@example.com";
  const mailFromName = pickString(systemValue, ["mail", "mail_from_name"]) ?? "Arclayer";
  const mailStarttls = pickBool(systemValue, ["mail", "starttls"]) ?? true;
  const mailSslTls = pickBool(systemValue, ["mail", "ssl_tls"]) ?? false;
  const mailEnabledTemplates = pickStringArray(systemValue, [
    "mail",
    "preferences",
    "enabled_templates",
  ]) ?? ["registration_prompt", "welcome_email"];

  const notificationGroups = parseNotificationGroups(
    pickUnknown(systemValue, ["notifications", "groups"]),
  );

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
    siteAvatarPlaceholderUrl,
    siteAvatarPlaceholderAssetId,
    siteContactEmail,
    supportedLocales,
    defaultLocale,
    fallbackLocale,
    timezone,
    useBrowserTimeZone,
    dateFormat,
    useRelativeDateTime,
    seoTitlePolicy,

    storageProvider,
    storagePublicBaseUrl,
    uploadChunkSizeMb,
    uploadMaxFileSizeMb,
    uploadMaxAvatarSizeMb,
    uploadMaxSiteLogoSizeMb,
    uploadMaxFaviconSizeMb,

    s3EndpointUrl,
    s3Region,
    s3Bucket,
    s3AccessKeyId,
    s3SecretAccessKey: "",
    s3ForcePathStyle,
    s3PresignExpiresSeconds,

    mailEnabled,
    mailServer,
    mailPort,
    mailUsername,
    mailPassword: "",
    mailFrom,
    mailFromName,
    mailStarttls,
    mailSslTls,

    mailEnabledTemplates,

    notificationGroups,
  };
}

function parseNotificationGroups(input: unknown): Record<string, { enabled: boolean }> {
  const fallback: Record<string, { enabled: boolean }> = {
    team: { enabled: true },
    security: { enabled: true },
    content: { enabled: true },
    automation: { enabled: true },
    system: { enabled: false },
  };
  if (!input || typeof input !== "object" || Array.isArray(input)) return fallback;

  const record = input as Record<string, unknown>;
  const next: Record<string, { enabled: boolean }> = { ...fallback };
  for (const [group, value] of Object.entries(record)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const enabled = pickBool(value, ["enabled"]);
    next[group] = { enabled: enabled ?? next[group]?.enabled ?? false };
  }
  return next;
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
