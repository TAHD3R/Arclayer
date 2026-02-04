import type { FormInstance } from "antd";

import type { AppLocale } from "@/lib/i18n";

export type StorageProvider = "local" | "s3";

export type GeneralSettingsTabKey = "site" | "localization";

export type GeneralSettingsFormValues = {
  siteName: string;
  siteSubtitle: string;
  siteDescription: string;
  siteUrl: string;
  siteLogoUrl: string;
  siteLogoAssetId: string;
  siteFaviconUrl: string;
  siteFaviconAssetId: string;
  siteAvatarPlaceholderUrl: string;
  siteAvatarPlaceholderAssetId: string;
  siteContactEmail: string;
  locale: AppLocale;
  timezone: string;
  dateFormat: string;

  storageProvider: StorageProvider;
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

  mailEnabled: boolean;
  mailServer: string;
  mailPort: number;
  mailUsername: string;
  mailPassword: string;
  mailFrom: string;
  mailFromName: string;
  mailStarttls: boolean;
  mailSslTls: boolean;

  mailEnabledTemplates: string[];

  notificationInviteEnabled: boolean;
};

export type GeneralSettingsPatchFn = (patch: Record<string, unknown>) => Promise<void>;

export type WithSavingKeyFn = (key: string, fn: () => Promise<void>) => Promise<void>;

export type GeneralSettingsTabBaseProps = {
  form: FormInstance<GeneralSettingsFormValues>;
  initialValues: GeneralSettingsFormValues;
  disabled: boolean;
  savingKey: string | null;
  withSavingKey: WithSavingKeyFn;
  patch: GeneralSettingsPatchFn;
};
