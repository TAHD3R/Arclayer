import type { SettingsDetail } from "@/api/settings";

import type { AppLocale } from "@/utils/i18n";

import type { GeneralSettingsFormValues, StorageProvider } from "./types";
import { pickBool, pickNumber, pickString, pickStringArray } from "./utils";

/**
 * buildGeneralSettingsInitialValues：把后端 core settings 的 value 适配为前端表单值。
 *
 * 注意点：
 * - 这里做的是“读模型”适配；写回后端的 patch 仍由各 Tab 自己构造，避免过度耦合。
 * - Secret 字段（如 s3_secret_access_key）由 API 掩码；UI 只允许“设置新值”，因此初始值固定为空串。
 */
export function buildGeneralSettingsInitialValues(params: {
  workspace?: SettingsDetail;
  system?: SettingsDetail;
}): GeneralSettingsFormValues {
  const workspaceValue = params.workspace?.value;
  const systemValue = params.system?.value;

  const siteName = pickString(workspaceValue, ["site", "name"]) ?? "Celestial CMS";
  const siteSubtitle = pickString(workspaceValue, ["site", "subtitle"]) ?? "";
  const siteDescription = pickString(workspaceValue, ["seo", "default_description"]) ?? "";
  const siteUrl = pickString(workspaceValue, ["site", "url"]) ?? "";
  const siteLogoUrl = pickString(workspaceValue, ["site", "logo_url"]) ?? "";
  const siteLogoAssetId = pickString(workspaceValue, ["site", "logo_asset_id"]) ?? "";
  const siteFaviconUrl = pickString(workspaceValue, ["site", "favicon_url"]) ?? "";
  const siteFaviconAssetId = pickString(workspaceValue, ["site", "favicon_asset_id"]) ?? "";
  const siteAvatarPlaceholderUrl =
    pickString(workspaceValue, ["site", "avatar_placeholder_url"]) ?? "";
  const siteAvatarPlaceholderAssetId =
    pickString(workspaceValue, ["site", "avatar_placeholder_asset_id"]) ?? "";
  const siteContactEmail = pickString(workspaceValue, ["site", "contact_email"]) ?? "";

  const locale =
    (pickString(workspaceValue, ["localization", "locale"]) as AppLocale | undefined) ?? "zh-CN";
  const timezone = pickString(workspaceValue, ["localization", "timezone"]) ?? "Asia/Shanghai";
  const dateFormat = pickString(workspaceValue, ["localization", "date_format"]) ?? "YYYY-MM-DD";

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
  const mailFromName = pickString(systemValue, ["mail", "mail_from_name"]) ?? "Celestial CMS";
  const mailStarttls = pickBool(systemValue, ["mail", "starttls"]) ?? true;
  const mailSslTls = pickBool(systemValue, ["mail", "ssl_tls"]) ?? false;
  const mailEnabledTemplates = pickStringArray(systemValue, [
    "mail",
    "preferences",
    "enabled_templates",
  ]) ?? ["registration_prompt", "welcome_email"];

  const notificationInviteEnabled =
    pickBool(systemValue, ["notifications", "invite_enabled"]) ?? true;

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

    notificationInviteEnabled,
  };
}
