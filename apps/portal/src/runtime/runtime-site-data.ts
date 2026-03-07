import type { PortalRuntimeConfig } from "@celestial/internal-types";

export function buildRuntimeSiteData(
  runtimeConfig: PortalRuntimeConfig | undefined,
): Record<string, unknown> | undefined {
  if (!runtimeConfig) return undefined;

  const site = runtimeConfig.site ?? null;
  const seo = runtimeConfig.seo ?? null;
  const localization = runtimeConfig.siteLocalization ?? null;
  const theme = runtimeConfig.theme ?? null;
  const data: Record<string, unknown> = {};

  if (site?.name) data.name = site.name;
  if (site?.subtitle) data.subtitle = site.subtitle;
  if (site?.url) data.url = site.url;
  if (site?.logoUrl) data.logoUrl = site.logoUrl;
  if (site?.faviconUrl) data.faviconUrl = site.faviconUrl;
  if (site?.contactEmail) data.contactEmail = site.contactEmail;

  if (seo?.defaultTitle) data.seoDefaultTitle = seo.defaultTitle;
  if (seo?.defaultDescription) data.seoDefaultDescription = seo.defaultDescription;
  if (seo?.defaultTitle || seo?.defaultDescription) {
    data.seo = Object.assign(
      {},
      seo?.defaultTitle ? { defaultTitle: seo.defaultTitle } : {},
      seo?.defaultDescription ? { defaultDescription: seo.defaultDescription } : {},
    );
  }

  if (localization?.locale) data.locale = localization.locale;
  if (localization?.defaultLocale) data.defaultLocale = localization.defaultLocale;
  if (localization?.fallbackLocale) data.fallbackLocale = localization.fallbackLocale;
  if (localization?.timezone) data.timezone = localization.timezone;
  if (localization?.dateFormat) data.dateFormat = localization.dateFormat;
  if (localization?.supportedLocales?.length) {
    data.supportedLocales = [...localization.supportedLocales];
  }
  if (
    localization?.locale ||
    localization?.defaultLocale ||
    localization?.fallbackLocale ||
    localization?.timezone ||
    localization?.dateFormat ||
    localization?.supportedLocales?.length
  ) {
    data.localization = Object.assign(
      {},
      localization?.locale ? { locale: localization.locale } : {},
      localization?.defaultLocale ? { defaultLocale: localization.defaultLocale } : {},
      localization?.fallbackLocale ? { fallbackLocale: localization.fallbackLocale } : {},
      localization?.timezone ? { timezone: localization.timezone } : {},
      localization?.dateFormat ? { dateFormat: localization.dateFormat } : {},
      localization?.supportedLocales?.length
        ? { supportedLocales: [...localization.supportedLocales] }
        : {},
    );
  }

  if (theme?.themeId) data.themeId = theme.themeId;
  if (theme?.version) data.themeVersion = theme.version;
  if (theme?.presetId) data.themePresetId = theme.presetId;
  if (theme?.themeId || theme?.version || theme?.presetId) {
    data.theme = Object.assign(
      {},
      theme?.themeId ? { themeId: theme.themeId } : {},
      theme?.version ? { version: theme.version } : {},
      theme?.presetId ? { presetId: theme.presetId } : {},
    );
  }

  return Object.keys(data).length ? data : undefined;
}
