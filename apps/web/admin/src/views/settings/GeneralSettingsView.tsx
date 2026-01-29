import { Alert, Button, Form, Input, InputNumber, Select, Switch } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/components/app/defaultPage";
import { SettingActionItem } from "@/components/app/settingActionItem";
import { SettingDialog } from "@/components/app/settingDialog";
import { SettingSheet } from "@/components/app/settingSheet";
import {
  ChromeTabs,
  ChromeTabsContent,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@/components/ui/chrome-tabs";
import { Accordion } from "@/components/animate-ui/components/radix/accordion";
import { SettingAccordionItem } from "@/components/app/settingAccordionItem";
import { SettingPanel } from "@/components/app/settingPanel";
import { getCoreSettings, patchCoreSettings } from "@/api/settings";
import { notifyError, notifySuccessText } from "@/utils/notifications";
import { type AppLocale } from "@/utils/i18n";
import RefreshIcon from "@/components/ui/icons/refresh-icon";
import { LoaderOne } from "@/components/ui/loader";

type GeneralSettingsFormValues = {
  siteName: string;
  siteSubtitle: string;
  siteDescription: string;
  siteUrl: string;
  siteLogoUrl: string;
  siteFaviconUrl: string;
  siteContactEmail: string;
  locale: AppLocale;
  timezone: string;
  dateFormat: string;

  storageProvider: "local" | "s3";
  storagePublicBaseUrl: string;

  uploadChunkSizeMb: number;
  uploadMaxFileSizeMb: number;
  uploadMaxAvatarSizeMb: number;
  uploadMaxSiteLogoSizeMb: number;
  uploadMaxFaviconSizeMb: number;

  s3EndpointUrl: string;
  s3Region: string;
  s3Bucket: string;
  s3AccessKeyId: string;
  s3SecretAccessKey: string;
  s3ForcePathStyle: boolean;
  s3PresignExpiresSeconds: number;
};

const COMMON_TIMEZONES = [
  "Asia/Shanghai",
  "UTC",
  "America/Los_Angeles",
  "America/New_York",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Tokyo",
] as const;

const DATE_FORMAT_ITEMS = [
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD (2026-01-28)" },
  { value: "YYYY/MM/DD", label: "YYYY/MM/DD (2026/01/28)" },
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY (01/28/2026)" },
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY (28/01/2026)" },
] as const;

function normalizeOptionalString(value: string | undefined): string | null {
  const raw = (value || "").trim();
  return raw ? raw : null;
}

function isValidHttpUrlOrAbsolutePath(value: string): boolean {
  const raw = (value || "").trim();
  if (!raw) return true;
  if (raw.startsWith("/")) return true;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function formatSummaryText(value: string | undefined, maxLen = 48): string {
  const raw = (value || "").trim();
  if (!raw) return "-";
  if (raw.length <= maxLen) return raw;
  return `${raw.slice(0, maxLen)}...`;
}

function pickString(obj: unknown, path: readonly string[]): string | undefined {
  let cur: any = obj;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[key];
  }
  return typeof cur === "string" ? cur : undefined;
}

function pickNumber(obj: unknown, path: readonly string[]): number | undefined {
  let cur: any = obj;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[key];
  }
  if (typeof cur === "number" && Number.isFinite(cur)) return cur;
  if (typeof cur === "string" && cur.trim()) {
    const n = Number(cur);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function pickBool(obj: unknown, path: readonly string[]): boolean | undefined {
  let cur: any = obj;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[key];
  }
  return typeof cur === "boolean" ? cur : undefined;
}

function formatLocaleLabel(locale: AppLocale, t: (key: string) => string): string {
  return locale === "zh-CN" ? t("account:ACCOUNT_LANGUAGE_ZH") : t("account:ACCOUNT_LANGUAGE_EN");
}

export function GeneralSettingsView() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<GeneralSettingsFormValues>();
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [storageOverlayKey, setStorageOverlayKey] = useState<
    "provider" | "publicBaseUrl" | "uploadPolicy" | "localInfo" | "s3Config" | null
  >(null);

  const coreQuery = useQuery({
    queryKey: ["settings", "core"],
    queryFn: async () => getCoreSettings(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const initialValues = useMemo<GeneralSettingsFormValues>(() => {
    const v = coreQuery.data?.value;

    const siteName = pickString(v, ["site", "name"]) ?? "Celestial CMS";
    const siteSubtitle = pickString(v, ["site", "subtitle"]) ?? "";
    const siteDescription = pickString(v, ["seo", "default_description"]) ?? "";
    const siteUrl = pickString(v, ["site", "url"]) ?? "";
    const siteLogoUrl = pickString(v, ["site", "logo_url"]) ?? "";
    const siteFaviconUrl = pickString(v, ["site", "favicon_url"]) ?? "";
    const siteContactEmail = pickString(v, ["site", "contact_email"]) ?? "";

    const locale = (pickString(v, ["localization", "locale"]) as AppLocale | undefined) ?? "zh-CN";
    const timezone = pickString(v, ["localization", "timezone"]) ?? "Asia/Shanghai";
    const dateFormat = pickString(v, ["localization", "date_format"]) ?? "YYYY-MM-DD";

    const storageProvider =
      (pickString(v, ["storage", "provider"]) as "local" | "s3" | undefined) ?? "local";
    const storagePublicBaseUrl = pickString(v, ["storage", "public_base_url"]) ?? "";

    const uploadChunkSizeMb = pickNumber(v, ["storage", "upload_chunk_size_mb"]) ?? 8;
    const uploadMaxFileSizeMb = pickNumber(v, ["storage", "upload_max_file_size_mb"]) ?? 2048;
    const uploadMaxAvatarSizeMb = pickNumber(v, ["storage", "upload_max_avatar_size_mb"]) ?? 10;
    const uploadMaxSiteLogoSizeMb =
      pickNumber(v, ["storage", "upload_max_site_logo_size_mb"]) ?? 20;
    const uploadMaxFaviconSizeMb = pickNumber(v, ["storage", "upload_max_favicon_size_mb"]) ?? 2;

    const s3EndpointUrl = pickString(v, ["storage", "s3_endpoint_url"]) ?? "";
    const s3Region = pickString(v, ["storage", "s3_region"]) ?? "";
    const s3Bucket = pickString(v, ["storage", "s3_bucket"]) ?? "";
    const s3AccessKeyId = pickString(v, ["storage", "s3_access_key_id"]) ?? "";
    const s3ForcePathStyle = pickBool(v, ["storage", "s3_force_path_style"]) ?? false;
    const s3PresignExpiresSeconds = pickNumber(v, ["storage", "s3_presign_expires_seconds"]) ?? 900;

    // Secret fields are masked by the API; we only allow "set new value" in UI.
    const s3SecretAccessKey = "";

    return {
      siteName,
      siteSubtitle,
      siteDescription,
      siteUrl,
      siteLogoUrl,
      siteFaviconUrl,
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
      s3SecretAccessKey,
      s3ForcePathStyle,
      s3PresignExpiresSeconds,
    };
  }, [coreQuery.data?.value]);

  useEffect(() => {
    if (!coreQuery.data) return;
    form.setFieldsValue(initialValues);
  }, [coreQuery.data, form, initialValues]);

  const saveMutation = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => patchCoreSettings(patch),
    onSuccess: async () => {
      notifySuccessText(t("settings:SETTINGS_SAVED"));
      await queryClient.invalidateQueries({ queryKey: ["settings", "core"] });
    },
    onError: (err) => notifyError(err),
    onSettled: () => setSavingKey(null),
  });

  // useWatch may not emit until the field is mounted (e.g. accordion content is collapsed).
  // Fallback to the latest loaded core settings so summary can still render without expanding.
  const siteName =
    (Form.useWatch("siteName", form) as string | undefined) ?? initialValues.siteName;
  const siteSubtitle =
    (Form.useWatch("siteSubtitle", form) as string | undefined) ?? initialValues.siteSubtitle;
  const siteDescription =
    (Form.useWatch("siteDescription", form) as string | undefined) ?? initialValues.siteDescription;
  const siteUrl = (Form.useWatch("siteUrl", form) as string | undefined) ?? initialValues.siteUrl;
  const siteLogoUrl =
    (Form.useWatch("siteLogoUrl", form) as string | undefined) ?? initialValues.siteLogoUrl;
  const siteFaviconUrl =
    (Form.useWatch("siteFaviconUrl", form) as string | undefined) ?? initialValues.siteFaviconUrl;
  const siteContactEmail =
    (Form.useWatch("siteContactEmail", form) as string | undefined) ??
    initialValues.siteContactEmail;
  const locale = (Form.useWatch("locale", form) as AppLocale | undefined) ?? initialValues.locale;
  const timezone =
    (Form.useWatch("timezone", form) as string | undefined) ?? initialValues.timezone;
  const dateFormat =
    (Form.useWatch("dateFormat", form) as string | undefined) ?? initialValues.dateFormat;

  const storageProvider =
    (Form.useWatch("storageProvider", form) as "local" | "s3" | undefined) ??
    initialValues.storageProvider;
  const storagePublicBaseUrl =
    (Form.useWatch("storagePublicBaseUrl", form) as string | undefined) ??
    initialValues.storagePublicBaseUrl;

  const uploadChunkSizeMb =
    (Form.useWatch("uploadChunkSizeMb", form) as number | undefined) ??
    initialValues.uploadChunkSizeMb;
  const uploadMaxFileSizeMb =
    (Form.useWatch("uploadMaxFileSizeMb", form) as number | undefined) ??
    initialValues.uploadMaxFileSizeMb;
  const uploadMaxAvatarSizeMb =
    (Form.useWatch("uploadMaxAvatarSizeMb", form) as number | undefined) ??
    initialValues.uploadMaxAvatarSizeMb;
  const uploadMaxSiteLogoSizeMb =
    (Form.useWatch("uploadMaxSiteLogoSizeMb", form) as number | undefined) ??
    initialValues.uploadMaxSiteLogoSizeMb;
  const uploadMaxFaviconSizeMb =
    (Form.useWatch("uploadMaxFaviconSizeMb", form) as number | undefined) ??
    initialValues.uploadMaxFaviconSizeMb;

  const s3EndpointUrl =
    (Form.useWatch("s3EndpointUrl", form) as string | undefined) ?? initialValues.s3EndpointUrl;
  const s3Region =
    (Form.useWatch("s3Region", form) as string | undefined) ?? initialValues.s3Region;
  const s3Bucket =
    (Form.useWatch("s3Bucket", form) as string | undefined) ?? initialValues.s3Bucket;
  const s3AccessKeyId =
    (Form.useWatch("s3AccessKeyId", form) as string | undefined) ?? initialValues.s3AccessKeyId;
  const s3SecretAccessKey =
    (Form.useWatch("s3SecretAccessKey", form) as string | undefined) ??
    initialValues.s3SecretAccessKey;
  const s3ForcePathStyle =
    (Form.useWatch("s3ForcePathStyle", form) as boolean | undefined) ??
    initialValues.s3ForcePathStyle;
  const s3PresignExpiresSeconds =
    (Form.useWatch("s3PresignExpiresSeconds", form) as number | undefined) ??
    initialValues.s3PresignExpiresSeconds;

  const localeLabel = locale ? formatLocaleLabel(locale, t) : undefined;
  const dateFormatLabel =
    DATE_FORMAT_ITEMS.find((it) => it.value === dateFormat)?.label ?? dateFormat;

  const disabled = coreQuery.isFetching || saveMutation.isPending;

  const isSiteNameDirty = (siteName || "") !== (initialValues.siteName || "");
  const isSiteSubtitleDirty = (siteSubtitle || "") !== (initialValues.siteSubtitle || "");
  const isSiteDescriptionDirty = (siteDescription || "") !== (initialValues.siteDescription || "");
  const isSiteUrlDirty = (siteUrl || "") !== (initialValues.siteUrl || "");
  const isSiteLogoUrlDirty = (siteLogoUrl || "") !== (initialValues.siteLogoUrl || "");
  const isSiteFaviconUrlDirty = (siteFaviconUrl || "") !== (initialValues.siteFaviconUrl || "");
  const isSiteContactEmailDirty =
    (siteContactEmail || "") !== (initialValues.siteContactEmail || "");
  const isLocaleDirty = (locale || "") !== (initialValues.locale || "");
  const isTimezoneDirty = (timezone || "") !== (initialValues.timezone || "");
  const isDateFormatDirty = (dateFormat || "") !== (initialValues.dateFormat || "");

  const isStorageProviderDirty = (storageProvider || "") !== (initialValues.storageProvider || "");
  const isStoragePublicBaseUrlDirty =
    (storagePublicBaseUrl || "") !== (initialValues.storagePublicBaseUrl || "");
  const isUploadPolicyDirty =
    uploadChunkSizeMb !== initialValues.uploadChunkSizeMb ||
    uploadMaxFileSizeMb !== initialValues.uploadMaxFileSizeMb ||
    uploadMaxAvatarSizeMb !== initialValues.uploadMaxAvatarSizeMb ||
    uploadMaxSiteLogoSizeMb !== initialValues.uploadMaxSiteLogoSizeMb ||
    uploadMaxFaviconSizeMb !== initialValues.uploadMaxFaviconSizeMb;
  const isS3ConfigDirty =
    (s3EndpointUrl || "") !== (initialValues.s3EndpointUrl || "") ||
    (s3Region || "") !== (initialValues.s3Region || "") ||
    (s3Bucket || "") !== (initialValues.s3Bucket || "") ||
    (s3AccessKeyId || "") !== (initialValues.s3AccessKeyId || "") ||
    Boolean((s3SecretAccessKey || "").trim()) ||
    s3ForcePathStyle !== initialValues.s3ForcePathStyle ||
    s3PresignExpiresSeconds !== initialValues.s3PresignExpiresSeconds;

  const isResettingSiteName = savingKey === "reset:siteName";
  const isResettingSiteSubtitle = savingKey === "reset:siteSubtitle";
  const isResettingSiteDescription = savingKey === "reset:siteDescription";
  const isResettingSiteUrl = savingKey === "reset:siteUrl";
  const isResettingSiteLogoUrl = savingKey === "reset:siteLogoUrl";
  const isResettingSiteFaviconUrl = savingKey === "reset:siteFaviconUrl";
  const isResettingSiteContactEmail = savingKey === "reset:siteContactEmail";
  const isResettingLocale = savingKey === "reset:locale";
  const isResettingTimezone = savingKey === "reset:timezone";
  const isResettingDateFormat = savingKey === "reset:dateFormat";

  const isResettingStorageProvider = savingKey === "reset:storageProvider";
  const isResettingStoragePublicBaseUrl = savingKey === "reset:storagePublicBaseUrl";
  const isResettingUploadPolicy = savingKey === "reset:uploadPolicy";
  const isResettingS3Config = savingKey === "reset:s3Config";

  const resetSiteName = async () => {
    setSavingKey("reset:siteName");
    form.setFieldValue("siteName", initialValues.siteName);
    await saveMutation.mutateAsync({ site: { name: initialValues.siteName } });
  };

  const resetSiteSubtitle = async () => {
    setSavingKey("reset:siteSubtitle");
    form.setFieldValue("siteSubtitle", initialValues.siteSubtitle);
    await saveMutation.mutateAsync({
      site: { subtitle: normalizeOptionalString(initialValues.siteSubtitle) },
    });
  };

  const resetSiteDescription = async () => {
    setSavingKey("reset:siteDescription");
    form.setFieldValue("siteDescription", initialValues.siteDescription);
    await saveMutation.mutateAsync({
      seo: { default_description: normalizeOptionalString(initialValues.siteDescription) },
    });
  };

  const resetSiteUrl = async () => {
    setSavingKey("reset:siteUrl");
    form.setFieldValue("siteUrl", initialValues.siteUrl);
    await saveMutation.mutateAsync({ site: { url: initialValues.siteUrl } });
  };

  const resetSiteLogoUrl = async () => {
    setSavingKey("reset:siteLogoUrl");
    form.setFieldValue("siteLogoUrl", initialValues.siteLogoUrl);
    await saveMutation.mutateAsync({
      site: { logo_url: normalizeOptionalString(initialValues.siteLogoUrl) },
    });
  };

  const resetSiteFaviconUrl = async () => {
    setSavingKey("reset:siteFaviconUrl");
    form.setFieldValue("siteFaviconUrl", initialValues.siteFaviconUrl);
    await saveMutation.mutateAsync({
      site: { favicon_url: normalizeOptionalString(initialValues.siteFaviconUrl) },
    });
  };

  const resetSiteContactEmail = async () => {
    setSavingKey("reset:siteContactEmail");
    form.setFieldValue("siteContactEmail", initialValues.siteContactEmail);
    await saveMutation.mutateAsync({
      site: { contact_email: normalizeOptionalString(initialValues.siteContactEmail) },
    });
  };

  const resetLocale = async () => {
    setSavingKey("reset:locale");
    form.setFieldValue("locale", initialValues.locale);
    await saveMutation.mutateAsync({ localization: { locale: initialValues.locale } });
  };

  const resetTimezone = async () => {
    setSavingKey("reset:timezone");
    form.setFieldValue("timezone", initialValues.timezone);
    await saveMutation.mutateAsync({ localization: { timezone: initialValues.timezone } });
  };

  const resetDateFormat = async () => {
    setSavingKey("reset:dateFormat");
    form.setFieldValue("dateFormat", initialValues.dateFormat);
    await saveMutation.mutateAsync({ localization: { date_format: initialValues.dateFormat } });
  };

  const resetStorageProvider = async () => {
    setSavingKey("reset:storageProvider");
    form.setFieldValue("storageProvider", initialValues.storageProvider);
    await saveMutation.mutateAsync({ storage: { provider: initialValues.storageProvider } });
  };

  const resetStoragePublicBaseUrl = async () => {
    setSavingKey("reset:storagePublicBaseUrl");
    form.setFieldValue("storagePublicBaseUrl", initialValues.storagePublicBaseUrl);
    await saveMutation.mutateAsync({
      storage: { public_base_url: normalizeOptionalString(initialValues.storagePublicBaseUrl) },
    });
  };

  const resetUploadPolicy = async () => {
    setSavingKey("reset:uploadPolicy");
    form.setFieldsValue({
      uploadChunkSizeMb: initialValues.uploadChunkSizeMb,
      uploadMaxFileSizeMb: initialValues.uploadMaxFileSizeMb,
      uploadMaxAvatarSizeMb: initialValues.uploadMaxAvatarSizeMb,
      uploadMaxSiteLogoSizeMb: initialValues.uploadMaxSiteLogoSizeMb,
      uploadMaxFaviconSizeMb: initialValues.uploadMaxFaviconSizeMb,
    });
    await saveMutation.mutateAsync({
      storage: {
        upload_chunk_size_mb: initialValues.uploadChunkSizeMb,
        upload_max_file_size_mb: initialValues.uploadMaxFileSizeMb,
        upload_max_avatar_size_mb: initialValues.uploadMaxAvatarSizeMb,
        upload_max_site_logo_size_mb: initialValues.uploadMaxSiteLogoSizeMb,
        upload_max_favicon_size_mb: initialValues.uploadMaxFaviconSizeMb,
      },
    });
  };

  const resetS3Config = async () => {
    setSavingKey("reset:s3Config");
    form.setFieldsValue({
      s3EndpointUrl: initialValues.s3EndpointUrl,
      s3Region: initialValues.s3Region,
      s3Bucket: initialValues.s3Bucket,
      s3AccessKeyId: initialValues.s3AccessKeyId,
      s3SecretAccessKey: "",
      s3ForcePathStyle: initialValues.s3ForcePathStyle,
      s3PresignExpiresSeconds: initialValues.s3PresignExpiresSeconds,
    });
    await saveMutation.mutateAsync({
      storage: {
        s3_endpoint_url: normalizeOptionalString(initialValues.s3EndpointUrl),
        s3_region: normalizeOptionalString(initialValues.s3Region),
        s3_bucket: normalizeOptionalString(initialValues.s3Bucket),
        s3_access_key_id: normalizeOptionalString(initialValues.s3AccessKeyId),
        s3_force_path_style: Boolean(initialValues.s3ForcePathStyle),
        s3_presign_expires_seconds: Number(initialValues.s3PresignExpiresSeconds),
      },
    });
  };

  const saveSiteName = async () => {
    setSavingKey("siteName");
    const values = await form.validateFields(["siteName"]);
    await saveMutation.mutateAsync({ site: { name: String(values.siteName).trim() } });
  };

  const saveSiteSubtitle = async () => {
    setSavingKey("siteSubtitle");
    const values = await form.validateFields(["siteSubtitle"]);
    await saveMutation.mutateAsync({
      site: { subtitle: normalizeOptionalString(values.siteSubtitle) },
    });
  };

  const saveSiteDescription = async () => {
    setSavingKey("siteDescription");
    const values = await form.validateFields(["siteDescription"]);
    await saveMutation.mutateAsync({
      seo: { default_description: normalizeOptionalString(values.siteDescription) },
    });
  };

  const saveSiteUrl = async () => {
    setSavingKey("siteUrl");
    const values = await form.validateFields(["siteUrl"]);
    await saveMutation.mutateAsync({ site: { url: String(values.siteUrl).trim() } });
  };

  const saveSiteLogoUrl = async () => {
    setSavingKey("siteLogoUrl");
    const values = await form.validateFields(["siteLogoUrl"]);
    await saveMutation.mutateAsync({
      site: { logo_url: normalizeOptionalString(values.siteLogoUrl) },
    });
  };

  const saveSiteFaviconUrl = async () => {
    setSavingKey("siteFaviconUrl");
    const values = await form.validateFields(["siteFaviconUrl"]);
    await saveMutation.mutateAsync({
      site: { favicon_url: normalizeOptionalString(values.siteFaviconUrl) },
    });
  };

  const saveSiteContactEmail = async () => {
    setSavingKey("siteContactEmail");
    const values = await form.validateFields(["siteContactEmail"]);
    await saveMutation.mutateAsync({
      site: { contact_email: normalizeOptionalString(values.siteContactEmail) },
    });
  };

  const saveLocale = async () => {
    setSavingKey("locale");
    const values = await form.validateFields(["locale"]);
    await saveMutation.mutateAsync({ localization: { locale: values.locale } });
  };

  const saveTimezone = async () => {
    setSavingKey("timezone");
    const values = await form.validateFields(["timezone"]);
    await saveMutation.mutateAsync({ localization: { timezone: String(values.timezone) } });
  };

  const saveDateFormat = async () => {
    setSavingKey("dateFormat");
    const values = await form.validateFields(["dateFormat"]);
    await saveMutation.mutateAsync({ localization: { date_format: String(values.dateFormat) } });
  };

  const saveStorageProvider = async () => {
    setSavingKey("storageProvider");
    const values = await form.validateFields(["storageProvider"]);
    await saveMutation.mutateAsync({ storage: { provider: values.storageProvider } });
  };

  const saveStoragePublicBaseUrl = async () => {
    setSavingKey("storagePublicBaseUrl");
    const values = await form.validateFields(["storagePublicBaseUrl"]);
    await saveMutation.mutateAsync({
      storage: { public_base_url: normalizeOptionalString(values.storagePublicBaseUrl) },
    });
  };

  const saveUploadPolicy = async () => {
    setSavingKey("uploadPolicy");
    const values = await form.validateFields([
      "uploadChunkSizeMb",
      "uploadMaxFileSizeMb",
      "uploadMaxAvatarSizeMb",
      "uploadMaxSiteLogoSizeMb",
      "uploadMaxFaviconSizeMb",
    ]);
    await saveMutation.mutateAsync({
      storage: {
        upload_chunk_size_mb: Number(values.uploadChunkSizeMb),
        upload_max_file_size_mb: Number(values.uploadMaxFileSizeMb),
        upload_max_avatar_size_mb: Number(values.uploadMaxAvatarSizeMb),
        upload_max_site_logo_size_mb: Number(values.uploadMaxSiteLogoSizeMb),
        upload_max_favicon_size_mb: Number(values.uploadMaxFaviconSizeMb),
      },
    });
  };

  const saveS3Config = async () => {
    setSavingKey("s3Config");
    const values = await form.validateFields([
      "s3EndpointUrl",
      "s3Region",
      "s3Bucket",
      "s3AccessKeyId",
      "s3SecretAccessKey",
      "s3ForcePathStyle",
      "s3PresignExpiresSeconds",
    ]);

    const patch: Record<string, unknown> = {
      s3_endpoint_url: normalizeOptionalString(values.s3EndpointUrl),
      s3_region: normalizeOptionalString(values.s3Region),
      s3_bucket: normalizeOptionalString(values.s3Bucket),
      s3_access_key_id: normalizeOptionalString(values.s3AccessKeyId),
      s3_force_path_style: Boolean(values.s3ForcePathStyle),
      s3_presign_expires_seconds: Number(values.s3PresignExpiresSeconds),
    };

    // Secret fields are masked by the API; do not overwrite unless user provides a new value.
    const secret = String(values.s3SecretAccessKey || "").trim();
    if (secret) {
      patch.s3_secret_access_key = secret;
      form.setFieldValue("s3SecretAccessKey", "");
    }

    await saveMutation.mutateAsync({ storage: patch });
  };

  const storageProviderLabel =
    storageProvider === "s3"
      ? t("settings:SETTINGS_STORAGE_PROVIDER_S3")
      : t("settings:SETTINGS_STORAGE_PROVIDER_LOCAL");

  const hasS3Secret = Boolean(coreQuery.data?.secrets?.["storage.s3_secret_access_key"]);

  const s3Summary = (() => {
    const endpoint = (s3EndpointUrl || "").trim();
    const bucket = (s3Bucket || "").trim();
    const region = (s3Region || "").trim();
    if (!endpoint && !bucket) return null;
    let host = endpoint;
    try {
      host = new URL(endpoint).host;
    } catch {
      // ignore
    }
    const parts = [bucket || null, host || null, region || null].filter(Boolean);
    return parts.join(" / ");
  })();

  const openStorageOverlay = (key: NonNullable<typeof storageOverlayKey>) =>
    setStorageOverlayKey(key);
  const closeStorageOverlay = () => setStorageOverlayKey(null);

  return (
    <DefaultPage
      title={t("settings:SETTINGS_GENERAL_TITLE")}
      description={t("settings:SETTINGS_GENERAL_DESC")}
      width="fixed"
    >
      {coreQuery.isLoading ? (
        <div className="py-10 flex justify-center">
          <LoaderOne />
        </div>
      ) : coreQuery.isError || !coreQuery.data ? (
        <Alert
          type="error"
          showIcon
          title={t("common:REQUEST_FAILED")}
          description={t("settings:SETTINGS_LOAD_FAILED_DESC")}
          action={
            <Button onClick={() => void coreQuery.refetch()}>
              <RefreshIcon size={16} />
              {t("common:REFRESH")}
            </Button>
          }
        />
      ) : (
        <Form<GeneralSettingsFormValues>
          form={form}
          layout="vertical"
          requiredMark={false}
          autoComplete="off"
          disabled={disabled}
          initialValues={initialValues}
        >
          <ChromeTabs defaultValue="site">
            <ChromeTabsList>
              <ChromeTabsTrigger value="site">
                {t("settings:SETTINGS_GENERAL_TAB_SITE")}
              </ChromeTabsTrigger>
              <ChromeTabsTrigger value="localization">
                {t("settings:SETTINGS_GENERAL_TAB_LOCALIZATION")}
              </ChromeTabsTrigger>
              <ChromeTabsTrigger value="storage">
                {t("settings:SETTINGS_GENERAL_TAB_STORAGE")}
              </ChromeTabsTrigger>
            </ChromeTabsList>

            <ChromeTabsContent value="site">
              <Accordion type="single" collapsible className="px-0">
                <SettingAccordionItem
                  value="siteName"
                  title={t("setup:SETUP_FIELD_SITE_NAME_LABEL")}
                  description={t("settings:SETTINGS_SITE_NAME_DESC")}
                  showSummary
                  summary={formatSummaryText(siteName)}
                  confirmText={t("settings:SETTINGS_SAVE")}
                  onConfirm={saveSiteName}
                  confirmLoading={savingKey === "siteName"}
                  onReset={isSiteNameDirty || isResettingSiteName ? resetSiteName : undefined}
                  resetLoading={isResettingSiteName}
                  disabled={disabled}
                >
                  <Form.Item<GeneralSettingsFormValues>
                    name="siteName"
                    rules={[
                      { required: true, message: t("setup:SETUP_VALIDATION_SITE_NAME_REQUIRED") },
                    ]}
                    style={{ marginBottom: 0 }}
                  >
                    <Input
                      size="large"
                      placeholder={t("setup:SETUP_FIELD_SITE_NAME_PLACEHOLDER")}
                    />
                  </Form.Item>
                </SettingAccordionItem>

                <SettingAccordionItem
                  value="siteSubtitle"
                  title={t("settings:SETTINGS_SITE_SUBTITLE_LABEL")}
                  description={t("settings:SETTINGS_SITE_SUBTITLE_DESC")}
                  showSummary
                  summary={formatSummaryText(siteSubtitle)}
                  confirmText={t("settings:SETTINGS_SAVE")}
                  onConfirm={saveSiteSubtitle}
                  confirmLoading={savingKey === "siteSubtitle"}
                  onReset={
                    isSiteSubtitleDirty || isResettingSiteSubtitle ? resetSiteSubtitle : undefined
                  }
                  resetLoading={isResettingSiteSubtitle}
                  disabled={disabled}
                >
                  <Form.Item<GeneralSettingsFormValues>
                    name="siteSubtitle"
                    rules={[{ max: 200, message: t("setup:SETUP_VALIDATION_SITE_DESC_MAX") }]}
                    style={{ marginBottom: 0 }}
                  >
                    <Input
                      size="large"
                      placeholder={t("settings:SETTINGS_SITE_SUBTITLE_PLACEHOLDER")}
                      allowClear
                    />
                  </Form.Item>
                </SettingAccordionItem>

                <SettingAccordionItem
                  value="siteDescription"
                  title={t("settings:SETTINGS_SITE_DESCRIPTION_LABEL")}
                  description={t("settings:SETTINGS_SITE_DESCRIPTION_DESC")}
                  showSummary
                  summary={formatSummaryText(siteDescription)}
                  confirmText={t("settings:SETTINGS_SAVE")}
                  onConfirm={saveSiteDescription}
                  confirmLoading={savingKey === "siteDescription"}
                  onReset={
                    isSiteDescriptionDirty || isResettingSiteDescription
                      ? resetSiteDescription
                      : undefined
                  }
                  resetLoading={isResettingSiteDescription}
                  disabled={disabled}
                >
                  <Form.Item<GeneralSettingsFormValues>
                    name="siteDescription"
                    rules={[{ max: 200, message: t("setup:SETUP_VALIDATION_SITE_DESC_MAX") }]}
                    style={{ marginBottom: 0 }}
                  >
                    <Input.TextArea
                      autoSize={{ minRows: 3, maxRows: 6 }}
                      placeholder={t("settings:SETTINGS_SITE_DESCRIPTION_PLACEHOLDER")}
                      allowClear
                      maxLength={160}
                      showCount={{
                        formatter: ({ count }) => `${count}/200`,
                      }}
                    />
                  </Form.Item>
                </SettingAccordionItem>

                <SettingAccordionItem
                  value="siteUrl"
                  title={t("setup:SETUP_FIELD_SITE_URL_LABEL")}
                  description={t("settings:SETTINGS_SITE_URL_DESC")}
                  showSummary
                  summary={formatSummaryText(siteUrl)}
                  confirmText={t("settings:SETTINGS_SAVE")}
                  onConfirm={saveSiteUrl}
                  confirmLoading={savingKey === "siteUrl"}
                  onReset={isSiteUrlDirty || isResettingSiteUrl ? resetSiteUrl : undefined}
                  resetLoading={isResettingSiteUrl}
                  disabled={disabled}
                >
                  <Form.Item<GeneralSettingsFormValues>
                    name="siteUrl"
                    rules={[
                      { required: true, message: t("setup:SETUP_VALIDATION_SITE_URL_REQUIRED") },
                      {
                        validator: async (_rule, value: string | undefined) => {
                          const raw = (value || "").trim();
                          if (!raw) return;
                          try {
                            const url = new URL(raw);
                            if (url.protocol !== "http:" && url.protocol !== "https:") {
                              throw new Error("invalid protocol");
                            }
                          } catch {
                            throw new Error(t("setup:SETUP_VALIDATION_SITE_URL_INVALID"));
                          }
                        },
                      },
                    ]}
                    style={{ marginBottom: 0 }}
                  >
                    <Input size="large" placeholder={t("setup:SETUP_FIELD_SITE_URL_PLACEHOLDER")} />
                  </Form.Item>
                </SettingAccordionItem>

                <SettingAccordionItem
                  value="siteLogoUrl"
                  title={t("settings:SETTINGS_SITE_LOGO_LABEL")}
                  description={t("settings:SETTINGS_SITE_LOGO_DESC")}
                  showSummary
                  summary={formatSummaryText(siteLogoUrl)}
                  confirmText={t("settings:SETTINGS_SAVE")}
                  onConfirm={saveSiteLogoUrl}
                  confirmLoading={savingKey === "siteLogoUrl"}
                  onReset={
                    isSiteLogoUrlDirty || isResettingSiteLogoUrl ? resetSiteLogoUrl : undefined
                  }
                  resetLoading={isResettingSiteLogoUrl}
                  disabled={disabled}
                >
                  <Form.Item<GeneralSettingsFormValues>
                    name="siteLogoUrl"
                    rules={[
                      {
                        validator: async (_rule, value: string | undefined) => {
                          const raw = (value || "").trim();
                          if (!raw) return;
                          if (isValidHttpUrlOrAbsolutePath(raw)) return;
                          throw new Error(t("settings:SETTINGS_VALIDATION_URL_OR_PATH_INVALID"));
                        },
                      },
                    ]}
                    style={{ marginBottom: 0 }}
                  >
                    <Input
                      size="large"
                      placeholder={t("settings:SETTINGS_SITE_LOGO_PLACEHOLDER")}
                      allowClear
                    />
                  </Form.Item>
                </SettingAccordionItem>

                <SettingAccordionItem
                  value="siteFaviconUrl"
                  title={t("settings:SETTINGS_SITE_FAVICON_LABEL")}
                  description={t("settings:SETTINGS_SITE_FAVICON_DESC")}
                  showSummary
                  summary={formatSummaryText(siteFaviconUrl)}
                  confirmText={t("settings:SETTINGS_SAVE")}
                  onConfirm={saveSiteFaviconUrl}
                  confirmLoading={savingKey === "siteFaviconUrl"}
                  onReset={
                    isSiteFaviconUrlDirty || isResettingSiteFaviconUrl
                      ? resetSiteFaviconUrl
                      : undefined
                  }
                  resetLoading={isResettingSiteFaviconUrl}
                  disabled={disabled}
                >
                  <Form.Item<GeneralSettingsFormValues>
                    name="siteFaviconUrl"
                    rules={[
                      {
                        validator: async (_rule, value: string | undefined) => {
                          const raw = (value || "").trim();
                          if (!raw) return;
                          if (isValidHttpUrlOrAbsolutePath(raw)) return;
                          throw new Error(t("settings:SETTINGS_VALIDATION_URL_OR_PATH_INVALID"));
                        },
                      },
                    ]}
                    style={{ marginBottom: 0 }}
                  >
                    <Input
                      size="large"
                      placeholder={t("settings:SETTINGS_SITE_FAVICON_PLACEHOLDER")}
                      allowClear
                    />
                  </Form.Item>
                </SettingAccordionItem>

                <SettingAccordionItem
                  value="siteContactEmail"
                  title={t("settings:SETTINGS_SITE_CONTACT_EMAIL_LABEL")}
                  description={t("settings:SETTINGS_SITE_CONTACT_EMAIL_DESC")}
                  showSummary
                  summary={formatSummaryText(siteContactEmail)}
                  confirmText={t("settings:SETTINGS_SAVE")}
                  onConfirm={saveSiteContactEmail}
                  confirmLoading={savingKey === "siteContactEmail"}
                  onReset={
                    isSiteContactEmailDirty || isResettingSiteContactEmail
                      ? resetSiteContactEmail
                      : undefined
                  }
                  resetLoading={isResettingSiteContactEmail}
                  disabled={disabled}
                >
                  <Form.Item<GeneralSettingsFormValues>
                    name="siteContactEmail"
                    rules={[
                      {
                        validator: async (_rule, value: string | undefined) => {
                          const raw = (value || "").trim();
                          if (!raw) return;
                          // Minimal email validation for optional field.
                          const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
                          if (ok) return;
                          throw new Error(t("settings:SETTINGS_VALIDATION_EMAIL_INVALID"));
                        },
                      },
                    ]}
                    style={{ marginBottom: 0 }}
                  >
                    <Input
                      size="large"
                      placeholder={t("settings:SETTINGS_SITE_CONTACT_EMAIL_PLACEHOLDER")}
                      allowClear
                    />
                  </Form.Item>
                </SettingAccordionItem>
              </Accordion>
            </ChromeTabsContent>

            <ChromeTabsContent value="localization">
              <Accordion type="single" collapsible className="px-0">
                <SettingAccordionItem
                  value="locale"
                  title={t("setup:SETUP_FIELD_LANGUAGE_TITLE")}
                  description={t("settings:SETTINGS_LANGUAGE_DESC")}
                  showSummary
                  summary={localeLabel || "-"}
                  confirmText={t("settings:SETTINGS_SAVE")}
                  onConfirm={saveLocale}
                  confirmLoading={savingKey === "locale"}
                  onReset={isLocaleDirty || isResettingLocale ? resetLocale : undefined}
                  resetLoading={isResettingLocale}
                  disabled={disabled}
                >
                  <Form.Item<GeneralSettingsFormValues>
                    name="locale"
                    rules={[
                      { required: true, message: t("setup:SETUP_VALIDATION_LOCALE_REQUIRED") },
                    ]}
                    style={{ marginBottom: 0 }}
                  >
                    <Select
                      size="large"
                      options={[
                        { value: "zh-CN", label: t("account:ACCOUNT_LANGUAGE_ZH") },
                        { value: "en-US", label: t("account:ACCOUNT_LANGUAGE_EN") },
                      ]}
                    />
                  </Form.Item>
                </SettingAccordionItem>

                <SettingAccordionItem
                  value="timezone"
                  title={t("setup:SETUP_FIELD_TIMEZONE_TITLE")}
                  description={t("settings:SETTINGS_TIMEZONE_DESC")}
                  showSummary
                  summary={timezone || "-"}
                  confirmText={t("settings:SETTINGS_SAVE")}
                  onConfirm={saveTimezone}
                  confirmLoading={savingKey === "timezone"}
                  onReset={isTimezoneDirty || isResettingTimezone ? resetTimezone : undefined}
                  resetLoading={isResettingTimezone}
                  disabled={disabled}
                >
                  <Form.Item<GeneralSettingsFormValues>
                    name="timezone"
                    rules={[
                      { required: true, message: t("setup:SETUP_VALIDATION_TIMEZONE_REQUIRED") },
                    ]}
                    style={{ marginBottom: 0 }}
                  >
                    <Select
                      size="large"
                      options={COMMON_TIMEZONES.map((tz) => ({ value: tz, label: tz }))}
                      showSearch
                      optionFilterProp="label"
                    />
                  </Form.Item>
                </SettingAccordionItem>

                <SettingAccordionItem
                  value="dateFormat"
                  title={t("setup:SETUP_FIELD_DATE_FORMAT_TITLE")}
                  description={t("settings:SETTINGS_DATE_FORMAT_DESC")}
                  showSummary
                  summary={dateFormatLabel || "-"}
                  confirmText={t("settings:SETTINGS_SAVE")}
                  onConfirm={saveDateFormat}
                  confirmLoading={savingKey === "dateFormat"}
                  onReset={isDateFormatDirty || isResettingDateFormat ? resetDateFormat : undefined}
                  resetLoading={isResettingDateFormat}
                  disabled={disabled}
                >
                  <Form.Item<GeneralSettingsFormValues>
                    name="dateFormat"
                    rules={[
                      {
                        required: true,
                        message: t("setup:SETUP_VALIDATION_DATE_FORMAT_REQUIRED"),
                      },
                    ]}
                    style={{ marginBottom: 0 }}
                  >
                    <Select
                      size="large"
                      options={DATE_FORMAT_ITEMS.map((it) => ({
                        value: it.value,
                        label: it.label,
                      }))}
                    />
                  </Form.Item>
                </SettingAccordionItem>
              </Accordion>
            </ChromeTabsContent>

            <ChromeTabsContent value="storage">
              <div className="flex flex-col gap-6">
                <SettingPanel
                  title={t("settings:SETTINGS_STORAGE_PANEL_GLOBAL_TITLE")}
                  description={t("settings:SETTINGS_STORAGE_PANEL_GLOBAL_DESC")}
                >
                  <div className="divide-y">
                    <SettingActionItem
                      className="first:rounded-t-xl last:rounded-b-xl"
                      title={t("settings:SETTINGS_STORAGE_PROVIDER_LABEL")}
                      summary={storageProviderLabel}
                      description={t("settings:SETTINGS_STORAGE_PROVIDER_DESC")}
                      disabled={disabled}
                      onTrigger={() => openStorageOverlay("provider")}
                    />
                    <SettingActionItem
                      className="first:rounded-t-xl last:rounded-b-xl"
                      title={t("settings:SETTINGS_STORAGE_PUBLIC_BASE_URL_LABEL")}
                      summary={
                        storagePublicBaseUrl ? formatSummaryText(storagePublicBaseUrl) : null
                      }
                      placeholder={t("settings:SETTINGS_NOT_SET")}
                      description={t("settings:SETTINGS_STORAGE_PUBLIC_BASE_URL_DESC")}
                      disabled={disabled}
                      onTrigger={() => openStorageOverlay("publicBaseUrl")}
                    />
                    <SettingActionItem
                      className="first:rounded-t-xl last:rounded-b-xl"
                      title={t("settings:SETTINGS_STORAGE_UPLOAD_POLICY_LABEL")}
                      summary={`${uploadChunkSizeMb} MiB / ${uploadMaxFileSizeMb} MiB`}
                      description={[t("settings:SETTINGS_STORAGE_UPLOAD_POLICY_DESC")]}
                      disabled={disabled}
                      onTrigger={() => openStorageOverlay("uploadPolicy")}
                    />
                  </div>
                </SettingPanel>

                {storageProvider === "local" ? (
                  <SettingPanel
                    title={t("settings:SETTINGS_STORAGE_PANEL_LOCAL_TITLE")}
                    description={t("settings:SETTINGS_STORAGE_PANEL_LOCAL_DESC")}
                  >
                    <div className="divide-y">
                      <SettingActionItem
                        className="first:rounded-t-xl last:rounded-b-xl"
                        title={t("settings:SETTINGS_STORAGE_LOCAL_INFO_LABEL")}
                        summary={t("settings:SETTINGS_STORAGE_LOCAL_INFO_SUMMARY")}
                        description={t("settings:SETTINGS_STORAGE_LOCAL_INFO_DESC")}
                        disabled={disabled}
                        onTrigger={() => openStorageOverlay("localInfo")}
                      />
                    </div>
                  </SettingPanel>
                ) : null}

                {storageProvider === "s3" ? (
                  <SettingPanel
                    title={t("settings:SETTINGS_STORAGE_PANEL_S3_TITLE")}
                    description={t("settings:SETTINGS_STORAGE_PANEL_S3_DESC")}
                  >
                    <div className="divide-y">
                      <SettingActionItem
                        className="first:rounded-t-xl last:rounded-b-xl"
                        title={t("settings:SETTINGS_STORAGE_S3_CONFIG_LABEL")}
                        summary={s3Summary ? formatSummaryText(s3Summary, 64) : null}
                        placeholder={t("settings:SETTINGS_NOT_SET")}
                        description={[
                          t("settings:SETTINGS_STORAGE_S3_CONFIG_DESC"),
                          hasS3Secret
                            ? t("settings:SETTINGS_STORAGE_S3_SECRET_SET")
                            : t("settings:SETTINGS_STORAGE_S3_SECRET_NOT_SET"),
                        ]}
                        disabled={disabled}
                        onTrigger={() => openStorageOverlay("s3Config")}
                      />
                    </div>
                  </SettingPanel>
                ) : null}

                <SettingDialog
                  open={storageOverlayKey === "provider"}
                  onOpenChange={(open) => {
                    if (!open) closeStorageOverlay();
                  }}
                  title={t("settings:SETTINGS_STORAGE_DRAWER_PROVIDER_TITLE")}
                  description={t("settings:SETTINGS_STORAGE_PROVIDER_DIALOG_DESC")}
                  footer={
                    <div className="flex w-full items-center justify-end gap-2">
                      <Button onClick={closeStorageOverlay}>{t("common:BACK")}</Button>
                      {isStorageProviderDirty ? (
                        <Button
                          loading={isResettingStorageProvider}
                          disabled={disabled}
                          onClick={async () => {
                            try {
                              await resetStorageProvider();
                              closeStorageOverlay();
                            } catch {
                              // keep open
                            }
                          }}
                        >
                          {t("settings:SETTINGS_RESET")}
                        </Button>
                      ) : null}
                      <Button
                        type="primary"
                        loading={savingKey === "storageProvider"}
                        disabled={disabled}
                        onClick={async () => {
                          try {
                            await saveStorageProvider();
                            closeStorageOverlay();
                          } catch {
                            // keep open
                          }
                        }}
                      >
                        {t("settings:SETTINGS_SAVE")}
                      </Button>
                    </div>
                  }
                >
                  <div className="mb-4  text-muted-foreground leading-relaxed">
                    {t("settings:SETTINGS_STORAGE_PROVIDER_DIALOG_HELP")}
                  </div>

                  <Form.Item<GeneralSettingsFormValues>
                    name="storageProvider"
                    label={t("settings:SETTINGS_STORAGE_PROVIDER_LABEL")}
                    rules={[
                      { required: true, message: t("settings:SETTINGS_VALIDATION_REQUIRED") },
                    ]}
                    style={{ marginBottom: 0 }}
                  >
                    <Select
                      size="large"
                      options={[
                        { value: "local", label: t("settings:SETTINGS_STORAGE_PROVIDER_LOCAL") },
                        { value: "s3", label: t("settings:SETTINGS_STORAGE_PROVIDER_S3") },
                      ]}
                    />
                  </Form.Item>
                </SettingDialog>

                <SettingDialog
                  open={storageOverlayKey === "publicBaseUrl"}
                  onOpenChange={(open) => {
                    if (!open) closeStorageOverlay();
                  }}
                  title={t("settings:SETTINGS_STORAGE_DRAWER_PUBLIC_BASE_URL_TITLE")}
                  description={t("settings:SETTINGS_STORAGE_PUBLIC_BASE_URL_DIALOG_DESC")}
                  footer={
                    <div className="flex w-full items-center justify-end gap-2">
                      <Button onClick={closeStorageOverlay}>{t("common:BACK")}</Button>
                      {isStoragePublicBaseUrlDirty ? (
                        <Button
                          loading={isResettingStoragePublicBaseUrl}
                          disabled={disabled}
                          onClick={async () => {
                            try {
                              await resetStoragePublicBaseUrl();
                              closeStorageOverlay();
                            } catch {
                              // keep open
                            }
                          }}
                        >
                          {t("settings:SETTINGS_RESET")}
                        </Button>
                      ) : null}
                      <Button
                        type="primary"
                        loading={savingKey === "storagePublicBaseUrl"}
                        disabled={disabled}
                        onClick={async () => {
                          try {
                            await saveStoragePublicBaseUrl();
                            closeStorageOverlay();
                          } catch {
                            // keep open
                          }
                        }}
                      >
                        {t("settings:SETTINGS_SAVE")}
                      </Button>
                    </div>
                  }
                >
                  <div className="mb-4  text-muted-foreground leading-relaxed">
                    {t("settings:SETTINGS_STORAGE_PUBLIC_BASE_URL_DIALOG_HELP")}
                  </div>

                  <Form.Item<GeneralSettingsFormValues>
                    name="storagePublicBaseUrl"
                    label={t("settings:SETTINGS_STORAGE_PUBLIC_BASE_URL_LABEL")}
                    rules={[
                      {
                        validator: async (_rule, value: string | undefined) => {
                          const raw = (value || "").trim();
                          if (!raw) return;
                          if (isValidHttpUrlOrAbsolutePath(raw)) return;
                          throw new Error(t("settings:SETTINGS_VALIDATION_URL_OR_PATH_INVALID"));
                        },
                      },
                    ]}
                    style={{ marginBottom: 0 }}
                  >
                    <Input
                      size="large"
                      placeholder={t("settings:SETTINGS_STORAGE_PUBLIC_BASE_URL_PLACEHOLDER")}
                      allowClear
                    />
                  </Form.Item>
                </SettingDialog>

                <SettingSheet
                  open={storageOverlayKey === "uploadPolicy"}
                  onOpenChange={(open) => {
                    if (!open) closeStorageOverlay();
                  }}
                  title={t("settings:SETTINGS_STORAGE_DRAWER_UPLOAD_POLICY_TITLE")}
                  description={t("settings:SETTINGS_STORAGE_UPLOAD_POLICY_SHEET_DESC")}
                  footer={
                    <div className="flex w-full items-center justify-end gap-2">
                      <Button onClick={closeStorageOverlay}>{t("common:BACK")}</Button>
                      {isUploadPolicyDirty ? (
                        <Button
                          loading={isResettingUploadPolicy}
                          disabled={disabled}
                          onClick={async () => {
                            try {
                              await resetUploadPolicy();
                              closeStorageOverlay();
                            } catch {
                              // keep open
                            }
                          }}
                        >
                          {t("settings:SETTINGS_RESET")}
                        </Button>
                      ) : null}
                      <Button
                        type="primary"
                        loading={savingKey === "uploadPolicy"}
                        disabled={disabled}
                        onClick={async () => {
                          try {
                            await saveUploadPolicy();
                            closeStorageOverlay();
                          } catch {
                            // keep open
                          }
                        }}
                      >
                        {t("settings:SETTINGS_SAVE")}
                      </Button>
                    </div>
                  }
                >
                  <div className="mb-4  text-muted-foreground leading-relaxed">
                    {t("settings:SETTINGS_STORAGE_UPLOAD_POLICY_SHEET_HELP")}
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <Form.Item<GeneralSettingsFormValues>
                      name="uploadChunkSizeMb"
                      label={t("settings:SETTINGS_STORAGE_UPLOAD_CHUNK_SIZE_MB_LABEL")}
                      rules={[{ required: true, type: "number", min: 1, max: 128 }]}
                      style={{ marginBottom: 0 }}
                    >
                      <InputNumber size="large" min={1} max={128} style={{ width: "100%" }} />
                    </Form.Item>

                    <Form.Item<GeneralSettingsFormValues>
                      name="uploadMaxFileSizeMb"
                      label={t("settings:SETTINGS_STORAGE_UPLOAD_MAX_FILE_SIZE_MB_LABEL")}
                      rules={[{ required: true, type: "number", min: 1 }]}
                      style={{ marginBottom: 0 }}
                    >
                      <InputNumber size="large" min={1} style={{ width: "100%" }} />
                    </Form.Item>

                    <Form.Item<GeneralSettingsFormValues>
                      name="uploadMaxAvatarSizeMb"
                      label={t("settings:SETTINGS_STORAGE_UPLOAD_MAX_AVATAR_SIZE_MB_LABEL")}
                      rules={[{ required: true, type: "number", min: 1 }]}
                      style={{ marginBottom: 0 }}
                    >
                      <InputNumber size="large" min={1} style={{ width: "100%" }} />
                    </Form.Item>

                    <Form.Item<GeneralSettingsFormValues>
                      name="uploadMaxSiteLogoSizeMb"
                      label={t("settings:SETTINGS_STORAGE_UPLOAD_MAX_SITE_LOGO_SIZE_MB_LABEL")}
                      rules={[{ required: true, type: "number", min: 1 }]}
                      style={{ marginBottom: 0 }}
                    >
                      <InputNumber size="large" min={1} style={{ width: "100%" }} />
                    </Form.Item>

                    <Form.Item<GeneralSettingsFormValues>
                      name="uploadMaxFaviconSizeMb"
                      label={t("settings:SETTINGS_STORAGE_UPLOAD_MAX_FAVICON_SIZE_MB_LABEL")}
                      rules={[{ required: true, type: "number", min: 1 }]}
                      style={{ marginBottom: 0 }}
                    >
                      <InputNumber size="large" min={1} style={{ width: "100%" }} />
                    </Form.Item>
                  </div>
                </SettingSheet>

                <SettingDialog
                  open={storageOverlayKey === "localInfo"}
                  onOpenChange={(open) => {
                    if (!open) closeStorageOverlay();
                  }}
                  title={t("settings:SETTINGS_STORAGE_DRAWER_LOCAL_INFO_TITLE")}
                  description={t("settings:SETTINGS_STORAGE_LOCAL_INFO_DIALOG_DESC")}
                  footer={
                    <div className="flex w-full items-center justify-end gap-2">
                      <Button type="primary" onClick={closeStorageOverlay}>
                        {t("common:BACK")}
                      </Button>
                    </div>
                  }
                >
                  <div className=" text-muted-foreground leading-relaxed">
                    {t("settings:SETTINGS_STORAGE_LOCAL_INFO_DRAWER_DESC")}
                  </div>
                </SettingDialog>

                <SettingSheet
                  open={storageOverlayKey === "s3Config"}
                  onOpenChange={(open) => {
                    if (!open) closeStorageOverlay();
                  }}
                  title={t("settings:SETTINGS_STORAGE_DRAWER_S3_CONFIG_TITLE")}
                  description={t("settings:SETTINGS_STORAGE_S3_CONFIG_SHEET_DESC")}
                  footer={
                    <div className="flex w-full items-center justify-end gap-2">
                      <Button onClick={closeStorageOverlay}>{t("common:BACK")}</Button>
                      {isS3ConfigDirty ? (
                        <Button
                          loading={isResettingS3Config}
                          disabled={disabled}
                          onClick={async () => {
                            try {
                              await resetS3Config();
                              closeStorageOverlay();
                            } catch {
                              // keep open
                            }
                          }}
                        >
                          {t("settings:SETTINGS_RESET")}
                        </Button>
                      ) : null}
                      <Button
                        type="primary"
                        loading={savingKey === "s3Config"}
                        disabled={disabled}
                        onClick={async () => {
                          try {
                            await saveS3Config();
                            closeStorageOverlay();
                          } catch {
                            // keep open
                          }
                        }}
                      >
                        {t("settings:SETTINGS_SAVE")}
                      </Button>
                    </div>
                  }
                >
                  <div className="mb-4  text-muted-foreground leading-relaxed">
                    {t("settings:SETTINGS_STORAGE_S3_CONFIG_SHEET_HELP")}
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <Form.Item<GeneralSettingsFormValues>
                      name="s3EndpointUrl"
                      label={t("settings:SETTINGS_STORAGE_S3_ENDPOINT_URL_LABEL")}
                      rules={[
                        {
                          validator: async (_rule, value: string | undefined) => {
                            const raw = (value || "").trim();
                            if (!raw) throw new Error(t("settings:SETTINGS_VALIDATION_REQUIRED"));
                            try {
                              const url = new URL(raw);
                              if (url.protocol !== "http:" && url.protocol !== "https:") {
                                throw new Error("invalid protocol");
                              }
                            } catch {
                              throw new Error(
                                t("settings:SETTINGS_STORAGE_VALIDATION_URL_INVALID"),
                              );
                            }
                          },
                        },
                      ]}
                      style={{ marginBottom: 0 }}
                    >
                      <Input
                        size="large"
                        placeholder={t("settings:SETTINGS_STORAGE_S3_ENDPOINT_URL_PLACEHOLDER")}
                        allowClear
                      />
                    </Form.Item>

                    <Form.Item<GeneralSettingsFormValues>
                      name="s3Region"
                      label={t("settings:SETTINGS_STORAGE_S3_REGION_LABEL")}
                      style={{ marginBottom: 0 }}
                    >
                      <Input size="large" allowClear />
                    </Form.Item>

                    <Form.Item<GeneralSettingsFormValues>
                      name="s3Bucket"
                      label={t("settings:SETTINGS_STORAGE_S3_BUCKET_LABEL")}
                      rules={[
                        { required: true, message: t("settings:SETTINGS_VALIDATION_REQUIRED") },
                      ]}
                      style={{ marginBottom: 0 }}
                    >
                      <Input size="large" allowClear />
                    </Form.Item>

                    <Form.Item<GeneralSettingsFormValues>
                      name="s3AccessKeyId"
                      label={t("settings:SETTINGS_STORAGE_S3_ACCESS_KEY_ID_LABEL")}
                      rules={[
                        { required: true, message: t("settings:SETTINGS_VALIDATION_REQUIRED") },
                      ]}
                      style={{ marginBottom: 0 }}
                    >
                      <Input size="large" allowClear />
                    </Form.Item>

                    <Form.Item<GeneralSettingsFormValues>
                      name="s3SecretAccessKey"
                      label={t("settings:SETTINGS_STORAGE_S3_SECRET_ACCESS_KEY_LABEL")}
                      style={{ marginBottom: 0 }}
                    >
                      <Input.Password size="large" placeholder="••••••••" />
                    </Form.Item>

                    <Form.Item<GeneralSettingsFormValues>
                      name="s3ForcePathStyle"
                      label={t("settings:SETTINGS_STORAGE_S3_FORCE_PATH_STYLE_LABEL")}
                      valuePropName="checked"
                      style={{ marginBottom: 0 }}
                    >
                      <Switch />
                    </Form.Item>

                    <Form.Item<GeneralSettingsFormValues>
                      name="s3PresignExpiresSeconds"
                      label={t("settings:SETTINGS_STORAGE_S3_PRESIGN_EXPIRES_SECONDS_LABEL")}
                      rules={[{ required: true, type: "number", min: 60, max: 86400 }]}
                      style={{ marginBottom: 0 }}
                    >
                      <InputNumber size="large" min={60} max={86400} style={{ width: "100%" }} />
                    </Form.Item>
                  </div>
                </SettingSheet>
              </div>
            </ChromeTabsContent>
          </ChromeTabs>
        </Form>
      )}
    </DefaultPage>
  );
}
