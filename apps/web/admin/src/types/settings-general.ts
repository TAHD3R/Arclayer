import type { FormInstance } from "antd";
import type { TitlePolicyV1 } from "@celestial/portal-types";

export type StorageProvider = "local" | "s3";

export type GeneralSettingsTabKey = "site" | "localization";

export type GeneralSettingsFormValues = {
  siteName: string;
  siteNameI18nEnabled: boolean;
  siteNameI18n: Record<string, string>;
  siteSubtitle: string;
  siteDescription: string;
  siteDescriptionI18nEnabled: boolean;
  siteDescriptionI18n: Record<string, string>;
  siteUrl: string;
  siteLogoUrl: string;
  siteLogoAssetId: string;
  siteFaviconUrl: string;
  siteFaviconAssetId: string;
  siteAvatarPlaceholderUrl: string;
  siteAvatarPlaceholderAssetId: string;
  siteContactEmail: string;
  supportedLocales: string[];
  defaultLocale: string;
  fallbackLocale: string;
  timezone: string;
  dateFormat: string;
  seoTitlePolicyV1: TitlePolicyV1;

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
