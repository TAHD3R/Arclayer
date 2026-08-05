import { useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";

import type { JsonValueInput } from "@arclayer/openapi";

import { isValidEmail } from "@/lib/settings/general/utils";
import type {
  GeneralSettingsFormValues,
  GeneralSettingsTabBaseProps,
} from "@/types/settings-general";
import type { TitlePolicy, TitlePolicyToken } from "@/types/site-seo";
import { getFieldErrorMessage } from "../form-helpers";
import { SiteDiscoverySettingsSection } from "./site-discovery-settings-section";
import { SiteIdentitySettingsSection } from "./site-identity-settings-section";
import {
  normalizeLocalizedStringMapForSave,
  normalizeOptionalString,
  normalizeTitlePolicyForSave,
  resolveDefaultLocaleValue,
  toApiTitlePolicy,
} from "./site-settings-tab-helpers";

const DESCRIPTION_MAX_LENGTH = 200;
const TAGLINE_MAX_LENGTH = 200;

type SiteSettingsTabProps = GeneralSettingsTabBaseProps & {
  assetProjectId: string | null;
  resolvedPublicUrl: string;
  section: "identity" | "discovery";
};

function buildDefaultLocalePatch(
  nextLocale: string,
  initialLocale: string,
): Record<string, JsonValueInput> {
  if (!nextLocale || nextLocale === initialLocale) return {};
  return { site_localization: { default_locale: nextLocale, locale: nextLocale } };
}

function renderTitlePolicy(input: {
  policy: TitlePolicy;
  pageTitle: string;
  siteName: string;
  siteSubtitle: string;
}): string {
  const tokenValues: Record<TitlePolicyToken, string> = {
    pageTitle: input.pageTitle,
    siteName: input.siteName,
    siteSubtitle: input.siteSubtitle,
  };
  const title = input.policy.parts
    .map((part) => (part.kind === "token" ? tokenValues[part.value] : part.value))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  return title || input.siteName || input.pageTitle;
}

export function SiteSettingsTab(props: SiteSettingsTabProps) {
  const { disabled, form, initialValues, patch, savingKey, withSavingKey } = props;
  const { t } = useTranslation(["settings", "setup"]);
  const watchedValues = useWatch({ control: form.control }) as Partial<GeneralSettingsFormValues>;
  const values = { ...initialValues, ...watchedValues };

  const supportedLocales = values.supportedLocales?.length
    ? values.supportedLocales
    : [values.defaultLocale];
  const effectiveSiteName = values.siteNameI18nEnabled
    ? resolveDefaultLocaleValue(values.siteNameI18n, values.defaultLocale) || values.siteName
    : values.siteName;
  const effectiveSiteDescription = values.siteDescriptionI18nEnabled
    ? resolveDefaultLocaleValue(values.siteDescriptionI18n, values.defaultLocale) ||
      values.siteDescription
    : values.siteDescription;
  const searchPreviewTitle = renderTitlePolicy({
    policy: values.seoTitlePolicy,
    pageTitle: t("settings:SETTINGS_SEO_TITLE_FORMAT_SAMPLE_PAGE_TITLE"),
    siteName: effectiveSiteName,
    siteSubtitle: values.siteSubtitle,
  });

  const errors = {
    siteName: getFieldErrorMessage(form, values.siteNameI18nEnabled ? "siteNameI18n" : "siteName"),
    siteDescription: getFieldErrorMessage(
      form,
      values.siteDescriptionI18nEnabled ? "siteDescriptionI18n" : "siteDescription",
    ),
    siteSubtitle: getFieldErrorMessage(form, "siteSubtitle"),
    siteContactEmail: getFieldErrorMessage(form, "siteContactEmail"),
    titlePolicy: getFieldErrorMessage(form, "seoTitlePolicy"),
  };

  const siteIdentityDirty =
    values.siteName !== initialValues.siteName ||
    values.siteNameI18nEnabled !== initialValues.siteNameI18nEnabled ||
    JSON.stringify(values.siteNameI18n) !== JSON.stringify(initialValues.siteNameI18n) ||
    values.siteSubtitle !== initialValues.siteSubtitle ||
    values.siteDescription !== initialValues.siteDescription ||
    values.siteDescriptionI18nEnabled !== initialValues.siteDescriptionI18nEnabled ||
    JSON.stringify(values.siteDescriptionI18n) !==
      JSON.stringify(initialValues.siteDescriptionI18n) ||
    values.siteContactEmail !== initialValues.siteContactEmail;
  const browserDiscoveryDirty =
    JSON.stringify(values.seoTitlePolicy) !== JSON.stringify(initialValues.seoTitlePolicy) ||
    values.seoIndexingEnabled !== initialValues.seoIndexingEnabled ||
    values.seoSitemapEnabled !== initialValues.seoSitemapEnabled;

  const handleLocalizedToggle = (
    enabledName: "siteNameI18nEnabled" | "siteDescriptionI18nEnabled",
    dictName: "siteNameI18n" | "siteDescriptionI18n",
    rawName: "siteName" | "siteDescription",
    checked: boolean,
  ) => {
    form.setValue(enabledName, checked, { shouldDirty: true });
    if (!checked) {
      form.setValue(dictName, {}, { shouldDirty: true });
      form.clearErrors([rawName, dictName]);
      return;
    }

    const nextLocale = String(form.getValues("defaultLocale") || values.defaultLocale).trim();
    const nextMap = normalizeLocalizedStringMapForSave(form.getValues(dictName) || {});
    if (!Object.keys(nextMap).length && form.getValues(rawName)) {
      nextMap[nextLocale] = String(form.getValues(rawName) || "").trim();
    }
    form.setValue(dictName, nextMap, { shouldDirty: true });
    form.clearErrors([rawName, dictName]);
  };

  const resetSiteIdentity = () => {
    form.setValue("siteName", initialValues.siteName, { shouldDirty: false });
    form.setValue("siteNameI18nEnabled", initialValues.siteNameI18nEnabled, {
      shouldDirty: false,
    });
    form.setValue("siteNameI18n", initialValues.siteNameI18n, { shouldDirty: false });
    form.setValue("siteSubtitle", initialValues.siteSubtitle, { shouldDirty: false });
    form.setValue("siteDescription", initialValues.siteDescription, { shouldDirty: false });
    form.setValue("siteDescriptionI18nEnabled", initialValues.siteDescriptionI18nEnabled, {
      shouldDirty: false,
    });
    form.setValue("siteDescriptionI18n", initialValues.siteDescriptionI18n, {
      shouldDirty: false,
    });
    form.setValue("siteContactEmail", initialValues.siteContactEmail, { shouldDirty: false });
    form.clearErrors([
      "siteName",
      "siteNameI18n",
      "siteSubtitle",
      "siteDescription",
      "siteDescriptionI18n",
      "siteContactEmail",
    ]);
  };

  const resetBrowserDiscovery = () => {
    form.setValue("seoTitlePolicy", initialValues.seoTitlePolicy, { shouldDirty: false });
    form.setValue("seoIndexingEnabled", initialValues.seoIndexingEnabled, { shouldDirty: false });
    form.setValue("seoSitemapEnabled", initialValues.seoSitemapEnabled, { shouldDirty: false });
    form.clearErrors("seoTitlePolicy");
  };

  const saveSiteIdentity = () =>
    withSavingKey("siteIdentity", async () => {
      const nextLocale = String(form.getValues("defaultLocale") || values.defaultLocale).trim();
      const siteNameI18nEnabled = Boolean(form.getValues("siteNameI18nEnabled"));
      const siteDescriptionI18nEnabled = Boolean(form.getValues("siteDescriptionI18nEnabled"));
      const subtitle = String(form.getValues("siteSubtitle") || "");
      const contactEmail = String(form.getValues("siteContactEmail") || "").trim();

      let name = String(form.getValues("siteName") || "").trim();
      let nameI18n: Record<string, string> | null = null;
      if (siteNameI18nEnabled) {
        const nextMap = normalizeLocalizedStringMapForSave(form.getValues("siteNameI18n") || {});
        const resolvedName = resolveDefaultLocaleValue(nextMap, nextLocale);
        if (!resolvedName) {
          form.setError("siteNameI18n", {
            type: "validate",
            message: t("settings:SETTINGS_I18N_VALIDATION_DEFAULT_REQUIRED"),
          });
          throw new Error("FORM_VALIDATION_FAILED");
        }
        name = resolvedName;
        nameI18n = nextMap;
        form.setValue("siteNameI18n", nextMap, { shouldDirty: true });
        form.setValue("siteName", resolvedName, { shouldDirty: true });
      } else if (!name) {
        form.setError("siteName", {
          type: "validate",
          message: t("setup:SETUP_VALIDATION_SITE_NAME_REQUIRED"),
        });
        throw new Error("FORM_VALIDATION_FAILED");
      }

      let description = String(form.getValues("siteDescription") || "");
      let descriptionI18n: Record<string, string> | null = null;
      if (siteDescriptionI18nEnabled) {
        const nextMap = normalizeLocalizedStringMapForSave(
          form.getValues("siteDescriptionI18n") || {},
        );
        description = resolveDefaultLocaleValue(nextMap, nextLocale) || description;
        descriptionI18n = Object.keys(nextMap).length ? nextMap : null;
        form.setValue("siteDescriptionI18n", nextMap, { shouldDirty: true });
      } else if (description.length > DESCRIPTION_MAX_LENGTH) {
        form.setError("siteDescription", {
          type: "validate",
          message: t("setup:SETUP_VALIDATION_SITE_DESC_MAX"),
        });
        throw new Error("FORM_VALIDATION_FAILED");
      }

      if (subtitle.length > TAGLINE_MAX_LENGTH) {
        form.setError("siteSubtitle", {
          type: "validate",
          message: t("setup:SETUP_VALIDATION_SITE_DESC_MAX"),
        });
        throw new Error("FORM_VALIDATION_FAILED");
      }
      if (contactEmail && !isValidEmail(contactEmail)) {
        form.setError("siteContactEmail", {
          type: "validate",
          message: t("settings:SETTINGS_VALIDATION_EMAIL_INVALID"),
        });
        throw new Error("FORM_VALIDATION_FAILED");
      }

      form.clearErrors([
        "siteName",
        "siteNameI18n",
        "siteSubtitle",
        "siteDescription",
        "siteDescriptionI18n",
        "siteContactEmail",
      ]);
      await patch({
        ...buildDefaultLocalePatch(nextLocale, initialValues.defaultLocale),
        site: {
          name,
          name_i18n: nameI18n,
          subtitle: normalizeOptionalString(subtitle),
          description: normalizeOptionalString(description),
          description_i18n: descriptionI18n,
          contact_email: normalizeOptionalString(contactEmail),
        },
      });
    });

  const saveBrowserDiscovery = () =>
    withSavingKey("browserDiscovery", async () => {
      try {
        const next = normalizeTitlePolicyForSave(
          form.getValues("seoTitlePolicy") ?? initialValues.seoTitlePolicy,
          t,
        );
        form.setValue("seoTitlePolicy", next, { shouldDirty: true });
        form.clearErrors("seoTitlePolicy");
        const indexingEnabled = Boolean(form.getValues("seoIndexingEnabled"));
        const sitemapEnabled = Boolean(form.getValues("seoSitemapEnabled"));
        await patch({
          seo: {
            title_policy_v1: toApiTitlePolicy(next),
            robots_directive: indexingEnabled ? "index,follow" : "noindex,nofollow",
            sitemap_enabled: sitemapEnabled,
          },
        });
      } catch (error) {
        form.setError("seoTitlePolicy", {
          type: "validate",
          message:
            error instanceof Error
              ? error.message
              : t("settings:SETTINGS_SEO_TITLE_FORMAT_VALIDATION_INVALID"),
        });
        throw error;
      }
    });

  if (props.section === "identity") {
    return (
      <SiteIdentitySettingsSection
        dirty={siteIdentityDirty}
        disabled={disabled}
        effectiveDescription={effectiveSiteDescription}
        effectiveSiteName={effectiveSiteName}
        errors={{
          contactEmail: errors.siteContactEmail,
          description: errors.siteDescription,
          name: errors.siteName,
          subtitle: errors.siteSubtitle,
        }}
        form={form}
        pending={savingKey === "siteIdentity"}
        supportedLocales={supportedLocales}
        values={values}
        projectId={props.assetProjectId}
        publicUrl={props.resolvedPublicUrl}
        onLocalizedToggle={handleLocalizedToggle}
        onReset={resetSiteIdentity}
        onSave={() => void saveSiteIdentity()}
      />
    );
  }

  return (
    <SiteDiscoverySettingsSection
      assetProjectId={props.assetProjectId}
      dirty={browserDiscoveryDirty}
      disabled={disabled}
      effectiveDescription={effectiveSiteDescription}
      effectiveSiteName={effectiveSiteName}
      form={form}
      initialValues={initialValues}
      pending={savingKey === "browserDiscovery"}
      savingKey={savingKey}
      searchPreviewTitle={searchPreviewTitle}
      titlePolicyError={errors.titlePolicy}
      values={values}
      publicUrl={props.resolvedPublicUrl}
      withSavingKey={withSavingKey}
      patch={patch}
      onReset={resetBrowserDiscovery}
      onSave={() => void saveBrowserDiscovery()}
    />
  );
}
