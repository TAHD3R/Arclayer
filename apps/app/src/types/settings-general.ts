import type { UseFormReturn } from "react-hook-form";
import type { JsonValueInput } from "@arclayer/openapi";
import type { TitlePolicy } from "@/types/site-seo";

export type GeneralSettingsTabKey = "basics" | "localization";

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
  seoOgImageUrl: string;
  seoOgImageAssetId: string;
  seoIndexingEnabled: boolean;
  seoSitemapEnabled: boolean;
  siteContactEmail: string;
  supportedLocales: string[];
  defaultLocale: string;
  fallbackLocale: string;
  timezone: string;
  useBrowserTimeZone: boolean;
  dateFormat: string;
  useRelativeDateTime: boolean;
  seoTitlePolicy: TitlePolicy;
};

export type GeneralSettingsFormController = UseFormReturn<GeneralSettingsFormValues>;

export type GeneralSettingsPatchFn = (patch: Record<string, JsonValueInput>) => Promise<void>;

export type WithSavingKeyFn = (key: string, fn: () => Promise<void>) => Promise<void>;

export type GeneralSettingsTabBaseProps = {
  form: GeneralSettingsFormController;
  initialValues: GeneralSettingsFormValues;
  disabled: boolean;
  savingKey: string | null;
  withSavingKey: WithSavingKeyFn;
  patch: GeneralSettingsPatchFn;
};
