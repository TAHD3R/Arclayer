import type { AppLocale } from "@/utils/i18n";

export type StorageProvider = "local" | "s3";

export type GeneralSettingsTabKey = "site" | "localization" | "storage";

export type GeneralSettingsFormValues = {
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
};
