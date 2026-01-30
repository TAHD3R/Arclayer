import type { SettingsDetail } from "@/api/settings";

import type { AppLocale } from "@/utils/i18n";

import type { GeneralSettingsFormValues, StorageProvider } from "./types";
import { pickBool, pickNumber, pickString } from "./utils";

/**
 * buildGeneralSettingsInitialValues：把后端 core settings 的 value 适配为前端表单值。
 *
 * 注意点：
 * - 这里做的是“读模型”适配；写回后端的 patch 仍由各 Tab 自己构造，避免过度耦合。
 * - Secret 字段（如 s3_secret_access_key）由 API 掩码；UI 只允许“设置新值”，因此初始值固定为空串。
 */
export function buildGeneralSettingsInitialValues(
  detail: SettingsDetail | undefined,
): GeneralSettingsFormValues {
  const v = detail?.value;

  const siteName = pickString(v, ["site", "name"]) ?? "Celestial CMS";
  const siteSubtitle = pickString(v, ["site", "subtitle"]) ?? "";
  const siteDescription = pickString(v, ["seo", "default_description"]) ?? "";
  const siteUrl = pickString(v, ["site", "url"]) ?? "";
  const siteLogoUrl = pickString(v, ["site", "logo_url"]) ?? "";
  const siteLogoAssetId = pickString(v, ["site", "logo_asset_id"]) ?? "";
  const siteFaviconUrl = pickString(v, ["site", "favicon_url"]) ?? "";
  const siteFaviconAssetId = pickString(v, ["site", "favicon_asset_id"]) ?? "";
  const siteAvatarPlaceholderUrl = pickString(v, ["site", "avatar_placeholder_url"]) ?? "";
  const siteAvatarPlaceholderAssetId = pickString(v, ["site", "avatar_placeholder_asset_id"]) ?? "";
  const siteContactEmail = pickString(v, ["site", "contact_email"]) ?? "";

  const locale = (pickString(v, ["localization", "locale"]) as AppLocale | undefined) ?? "zh-CN";
  const timezone = pickString(v, ["localization", "timezone"]) ?? "Asia/Shanghai";
  const dateFormat = pickString(v, ["localization", "date_format"]) ?? "YYYY-MM-DD";

  const storageProvider =
    (pickString(v, ["storage", "provider"]) as StorageProvider | undefined) ?? "local";
  const storagePublicBaseUrl = pickString(v, ["storage", "public_base_url"]) ?? "";

  const uploadChunkSizeMb = pickNumber(v, ["storage", "upload_chunk_size_mb"]) ?? 8;
  const uploadMaxFileSizeMb = pickNumber(v, ["storage", "upload_max_file_size_mb"]) ?? 2048;
  const uploadMaxAvatarSizeMb = pickNumber(v, ["storage", "upload_max_avatar_size_mb"]) ?? 10;
  const uploadMaxSiteLogoSizeMb = pickNumber(v, ["storage", "upload_max_site_logo_size_mb"]) ?? 20;
  const uploadMaxFaviconSizeMb = pickNumber(v, ["storage", "upload_max_favicon_size_mb"]) ?? 2;

  const s3EndpointUrl = pickString(v, ["storage", "s3_endpoint_url"]) ?? "";
  const s3Region = pickString(v, ["storage", "s3_region"]) ?? "";
  const s3Bucket = pickString(v, ["storage", "s3_bucket"]) ?? "";
  const s3AccessKeyId = pickString(v, ["storage", "s3_access_key_id"]) ?? "";
  const s3ForcePathStyle = pickBool(v, ["storage", "s3_force_path_style"]) ?? false;
  const s3PresignExpiresSeconds = pickNumber(v, ["storage", "s3_presign_expires_seconds"]) ?? 900;

  return {
    siteName,
    siteSubtitle,
    siteDescription,
    siteUrl,
    siteLogoUrl,
    siteLogoAssetId,
    siteFaviconUrl,
    siteFaviconAssetId,
    siteAvatarPlaceholderUrl,
    siteAvatarPlaceholderAssetId,
    siteContactEmail,
    locale,
    timezone,
    dateFormat,

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
  };
}
