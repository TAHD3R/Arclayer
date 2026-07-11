import { Controller, useWatch } from "react-hook-form";
import { Globe2, Search, Share2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { JsonValueInput } from "@arclayer/openapi/admin-types";
import { Field, FieldError, FieldGroup, FieldLabel } from "@arclayer/ui/field";
import { Input } from "@arclayer/ui/input";
import { Textarea } from "@arclayer/ui/textarea";

import { SettingSwitchBlock } from "@/components/settings/setting-switch-block";
import { isValidEmail } from "@/lib/settings/general/utils";
import {
  SystemSettingField,
  SystemSettingFooterActions,
} from "@/pages/system/components/system-setting-item";
import type {
  GeneralSettingsFormValues,
  GeneralSettingsTabBaseProps,
} from "@/types/settings-general";
import type { TitlePolicy, TitlePolicyToken } from "@/types/site-seo";
import { getFieldErrorMessage } from "../form-helpers";
import { LocalizedStringDictField } from "./localized-string-dict-field";
import { SiteBrandAssetSettingRow } from "./site-brand-asset-accordion-item";
import {
  normalizeLocalizedStringMapForSave,
  normalizeOptionalString,
  normalizeTitlePolicyForSave,
  resolveDefaultLocaleValue,
  toApiTitlePolicy,
} from "./site-settings-tab-helpers";
import { SiteTitlePatternField } from "./site-title-pattern-field";

const DESCRIPTION_MAX_LENGTH = 200;
const TAGLINE_MAX_LENGTH = 200;

type LocalizedFieldProps = {
  defaultLocale: string;
  dictName: "siteNameI18n" | "siteDescriptionI18n";
  disabled: boolean;
  enabled: boolean;
  enabledDescription: string;
  enabledLabel: string;
  error: string | null;
  form: GeneralSettingsTabBaseProps["form"];
  inputName: "siteName" | "siteDescription";
  multiline?: boolean;
  placeholder: string;
  rawValue: string;
  supportedLocales: string[];
  onToggle: (checked: boolean) => void;
};

type SiteSettingsTabProps = GeneralSettingsTabBaseProps & {
  assetProjectId: string | null;
  section: "identity" | "discovery";
};

function FieldMessage({ message }: { message: string | null }) {
  if (!message) return null;
  return <FieldError>{message}</FieldError>;
}

function LocalizedFieldEditor(props: LocalizedFieldProps) {
  return (
    <FieldGroup>
      <Field>
        <SettingSwitchBlock
          checked={props.enabled}
          disabled={props.disabled}
          label={props.enabledLabel}
          description={props.enabledDescription}
          onCheckedChange={props.onToggle}
        />
      </Field>

      {props.enabled ? (
        <Controller
          control={props.form.control}
          name={props.dictName}
          render={({ field }) => (
            <Field data-invalid={Boolean(props.error)}>
              <FieldLabel>{props.enabledLabel}</FieldLabel>
              <LocalizedStringDictField
                supportedLocales={props.supportedLocales}
                defaultLocale={props.defaultLocale}
                value={field.value ?? {}}
                onChange={field.onChange}
                onDefaultLocaleChange={(locale) =>
                  props.form.setValue("defaultLocale", String(locale), { shouldDirty: true })
                }
                placeholder={props.placeholder}
                multiline={props.multiline}
              />
              <FieldMessage message={props.error} />
            </Field>
          )}
        />
      ) : props.multiline ? (
        <Field data-invalid={Boolean(props.error)}>
          <FieldLabel>{props.placeholder}</FieldLabel>
          <Textarea
            {...props.form.register(props.inputName)}
            rows={4}
            maxLength={DESCRIPTION_MAX_LENGTH}
            placeholder={props.placeholder}
            aria-invalid={Boolean(props.error)}
          />
          <div className="flex items-center justify-between gap-3 text-caption text-label-secondary">
            <FieldMessage message={props.error} />
            <span>
              {props.rawValue.length}/{DESCRIPTION_MAX_LENGTH}
            </span>
          </div>
        </Field>
      ) : (
        <Field data-invalid={Boolean(props.error)}>
          <FieldLabel>{props.placeholder}</FieldLabel>
          <Input
            {...props.form.register(props.inputName)}
            placeholder={props.placeholder}
            aria-invalid={Boolean(props.error)}
            autoComplete="off"
          />
          <FieldMessage message={props.error} />
        </Field>
      )}
    </FieldGroup>
  );
}

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
    .map((part) => part.trim())
    .filter(Boolean)
    .join("");
  return title || input.siteName || input.pageTitle;
}

function SearchResultMockup(props: {
  description: string;
  faviconUrl: string;
  indexingAllowed: boolean;
  publicUrl: string;
  title: string;
}) {
  const { t } = useTranslation(["settings"]);
  const host = (() => {
    try {
      return new URL(props.publicUrl).hostname;
    } catch {
      return props.publicUrl || "example.com";
    }
  })();
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-caption text-label-secondary">
        <Search aria-hidden="true" className="size-4" />
        <span>{t("settings:SETTINGS_SITE_DISCOVERY_SEARCH_LABEL")}</span>
      </div>
      <div className="mt-4 flex items-start gap-3">
        <div className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-muted">
          {props.faviconUrl ? (
            <img
              src={props.faviconUrl}
              alt=""
              width={32}
              height={32}
              className="size-full object-cover"
            />
          ) : (
            <Globe2 aria-hidden="true" className="size-4 text-label-secondary" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-footnote text-label-secondary">{host}</div>
          <div className="mt-1 line-clamp-2 text-title3 font-medium text-primary">
            {props.title}
          </div>
          <div className="mt-1 line-clamp-3 text-callout text-label-secondary">
            {props.indexingAllowed
              ? props.description || t("settings:SETTINGS_SITE_DISCOVERY_EMPTY_DESCRIPTION")
              : t("settings:SETTINGS_SITE_DISCOVERY_NOINDEX")}
          </div>
        </div>
      </div>
    </div>
  );
}

function SocialPreviewMockup(props: {
  description: string;
  imageUrl: string;
  publicUrl: string;
  title: string;
}) {
  const { t } = useTranslation(["settings"]);
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="grid aspect-[1.91/1] place-items-center bg-muted">
        {props.imageUrl ? (
          <img
            src={props.imageUrl}
            alt=""
            width={720}
            height={377}
            className="size-full object-cover"
          />
        ) : (
          <Share2 aria-hidden="true" className="size-8 text-label-secondary" />
        )}
      </div>
      <div className="flex flex-col gap-1 p-4">
        <div className="truncate text-caption uppercase text-label-tertiary">
          {props.publicUrl || t("settings:SETTINGS_NOT_SET")}
        </div>
        <div className="line-clamp-2 text-headline font-semibold text-label-primary">
          {props.title}
        </div>
        <div className="line-clamp-2 text-callout text-label-secondary">
          {props.description || t("settings:SETTINGS_SITE_DISCOVERY_EMPTY_DESCRIPTION")}
        </div>
      </div>
    </div>
  );
}

function BrowserDiscoveryMockup(props: {
  description: string;
  faviconUrl: string;
  indexingAllowed: boolean;
  publicUrl: string;
  siteName: string;
  socialImageUrl: string;
  title: string;
}) {
  const { t } = useTranslation(["settings"]);
  return (
    <div className="flex flex-col gap-4">
      <div className="min-w-0">
        <div className="text-headline font-semibold text-label-primary">
          {t("settings:SETTINGS_SITE_DISCOVERY_PREVIEW_TITLE")}
        </div>
        <div className="mt-1 text-callout text-label-secondary">
          {props.indexingAllowed
            ? t("settings:SETTINGS_SITE_SEARCH_DISCOVERY_INDEXING_ALLOWED")
            : t("settings:SETTINGS_SITE_SEARCH_DISCOVERY_INDEXING_BLOCKED")}
        </div>
      </div>
      <div className="grid gap-4">
        <SearchResultMockup
          title={props.title}
          description={props.description}
          publicUrl={props.publicUrl}
          faviconUrl={props.faviconUrl}
          indexingAllowed={props.indexingAllowed}
        />
        <SocialPreviewMockup
          title={props.siteName}
          description={props.description}
          publicUrl={props.publicUrl}
          imageUrl={props.socialImageUrl}
        />
      </div>
    </div>
  );
}

export function SiteSettingsTab(props: SiteSettingsTabProps) {
  const { disabled, form, initialValues, patch, savingKey, withSavingKey } = props;
  const { t } = useTranslation(["settings", "setup", "common"]);
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

  const siteNameError = getFieldErrorMessage(
    form,
    values.siteNameI18nEnabled ? "siteNameI18n" : "siteName",
  );
  const siteDescriptionError = getFieldErrorMessage(
    form,
    values.siteDescriptionI18nEnabled ? "siteDescriptionI18n" : "siteDescription",
  );
  const siteSubtitleError = getFieldErrorMessage(form, "siteSubtitle");
  const siteUrlError = getFieldErrorMessage(form, "siteUrl");
  const siteContactEmailError = getFieldErrorMessage(form, "siteContactEmail");
  const titlePolicyError = getFieldErrorMessage(form, "seoTitlePolicy");

  const isSiteNameDirty =
    values.siteName !== initialValues.siteName ||
    values.siteNameI18nEnabled !== initialValues.siteNameI18nEnabled ||
    JSON.stringify(values.siteNameI18n) !== JSON.stringify(initialValues.siteNameI18n);
  const isSiteSubtitleDirty = values.siteSubtitle !== initialValues.siteSubtitle;
  const isSiteDescriptionDirty =
    values.siteDescription !== initialValues.siteDescription ||
    values.siteDescriptionI18nEnabled !== initialValues.siteDescriptionI18nEnabled ||
    JSON.stringify(values.siteDescriptionI18n) !==
      JSON.stringify(initialValues.siteDescriptionI18n);
  const isSiteUrlDirty = values.siteUrl !== initialValues.siteUrl;
  const isSupportInboxDirty = values.siteContactEmail !== initialValues.siteContactEmail;
  const isTitlePolicyDirty =
    JSON.stringify(values.seoTitlePolicy) !== JSON.stringify(initialValues.seoTitlePolicy);
  const isSearchDiscoveryDirty =
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

  const siteIdentityDirty =
    isSiteNameDirty ||
    isSiteSubtitleDirty ||
    isSiteDescriptionDirty ||
    isSiteUrlDirty ||
    isSupportInboxDirty;
  const browserDiscoveryDirty = isTitlePolicyDirty || isSearchDiscoveryDirty;

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
    form.setValue("siteUrl", initialValues.siteUrl, { shouldDirty: false });
    form.setValue("siteContactEmail", initialValues.siteContactEmail, { shouldDirty: false });
    form.clearErrors([
      "siteName",
      "siteNameI18n",
      "siteSubtitle",
      "siteDescription",
      "siteDescriptionI18n",
      "siteUrl",
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
      const url = String(form.getValues("siteUrl") || "").trim();
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
      if (!url) {
        form.setError("siteUrl", {
          type: "validate",
          message: t("setup:SETUP_VALIDATION_SITE_URL_REQUIRED"),
        });
        throw new Error("FORM_VALIDATION_FAILED");
      }
      try {
        const parsedUrl = new URL(url);
        if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
          throw new Error("INVALID_PROTOCOL");
        }
      } catch {
        form.setError("siteUrl", {
          type: "validate",
          message: t("setup:SETUP_VALIDATION_SITE_URL_INVALID"),
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
        "siteUrl",
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
          url,
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
      <section id="website-identity" className="grid gap-6">
        <header>
          <h2 className="text-title2 font-semibold text-label-primary">
            {t("settings:SETTINGS_SITE_BASICS_IDENTITY_PANEL_TITLE")}
          </h2>
          <p className="mt-1 max-w-2xl text-body text-label-secondary">
            {t("settings:SETTINGS_SITE_BASICS_IDENTITY_PANEL_DESC")}
          </p>
        </header>
        <div className="grid gap-5">
          <SystemSettingField
            label={t("settings:SETTINGS_SITE_NAME_LABEL")}
            description={t("settings:SETTINGS_SITE_NAME_DESC")}
            labelControls={false}
          >
            <LocalizedFieldEditor
              defaultLocale={values.defaultLocale}
              dictName="siteNameI18n"
              disabled={disabled}
              enabled={values.siteNameI18nEnabled}
              enabledLabel={t("settings:SETTINGS_SITE_NAME_LOCALIZED_TITLE")}
              enabledDescription={t("settings:SETTINGS_SITE_NAME_LOCALIZED_DESC")}
              error={siteNameError}
              form={form}
              inputName="siteName"
              placeholder={t("settings:SETTINGS_SITE_NAME_PLACEHOLDER")}
              rawValue={values.siteName}
              supportedLocales={supportedLocales}
              onToggle={(checked) =>
                handleLocalizedToggle("siteNameI18nEnabled", "siteNameI18n", "siteName", checked)
              }
            />
          </SystemSettingField>

          <SystemSettingField
            label={t("settings:SETTINGS_SITE_SUBTITLE_LABEL")}
            description={t("settings:SETTINGS_SITE_SUBTITLE_DESC")}
            message={
              <div className="flex items-center justify-between gap-3 text-caption text-label-secondary">
                <FieldMessage message={siteSubtitleError} />
                <span>
                  {values.siteSubtitle.length}/{TAGLINE_MAX_LENGTH}
                </span>
              </div>
            }
          >
            <Input
              id="site-subtitle-input"
              {...form.register("siteSubtitle")}
              maxLength={TAGLINE_MAX_LENGTH}
              placeholder={t("settings:SETTINGS_SITE_SUBTITLE_PLACEHOLDER")}
              aria-invalid={Boolean(siteSubtitleError)}
              autoComplete="off"
              disabled={disabled}
            />
          </SystemSettingField>

          <SystemSettingField
            label={t("settings:SETTINGS_SITE_DESCRIPTION_LABEL")}
            description={t("settings:SETTINGS_SITE_DESCRIPTION_DESC")}
            labelControls={false}
          >
            <LocalizedFieldEditor
              defaultLocale={values.defaultLocale}
              dictName="siteDescriptionI18n"
              disabled={disabled}
              enabled={values.siteDescriptionI18nEnabled}
              enabledLabel={t("settings:SETTINGS_SITE_DESCRIPTION_LOCALIZED_TITLE")}
              enabledDescription={t("settings:SETTINGS_SITE_DESCRIPTION_LOCALIZED_DESC")}
              error={siteDescriptionError}
              form={form}
              inputName="siteDescription"
              multiline
              placeholder={t("settings:SETTINGS_SITE_DESCRIPTION_PLACEHOLDER")}
              rawValue={values.siteDescription}
              supportedLocales={supportedLocales}
              onToggle={(checked) =>
                handleLocalizedToggle(
                  "siteDescriptionI18nEnabled",
                  "siteDescriptionI18n",
                  "siteDescription",
                  checked,
                )
              }
            />
          </SystemSettingField>

          <SystemSettingField
            label={t("settings:SETTINGS_SITE_PUBLIC_URL_LABEL")}
            description={t("settings:SETTINGS_SITE_PUBLIC_URL_DESC")}
            message={<FieldMessage message={siteUrlError} />}
          >
            <Input
              id="site-url-input"
              {...form.register("siteUrl")}
              type="url"
              inputMode="url"
              placeholder={t("settings:SETTINGS_SITE_PUBLIC_URL_PLACEHOLDER")}
              aria-invalid={Boolean(siteUrlError)}
              autoComplete="off"
              disabled={disabled}
            />
          </SystemSettingField>

          <SystemSettingField
            label={t("settings:SETTINGS_SITE_CONTACT_EMAIL_LABEL")}
            description={t("settings:SETTINGS_SITE_CONTACT_EMAIL_DESC")}
            message={<FieldMessage message={siteContactEmailError} />}
          >
            <Input
              id="site-contact-email-input"
              {...form.register("siteContactEmail")}
              type="email"
              inputMode="email"
              spellCheck={false}
              placeholder={t("settings:SETTINGS_SITE_CONTACT_EMAIL_PLACEHOLDER")}
              aria-invalid={Boolean(siteContactEmailError)}
              autoComplete="off"
              disabled={disabled}
            />
          </SystemSettingField>
        </div>
        <div className="border-t border-border pt-4">
          <SystemSettingFooterActions
            dirty={siteIdentityDirty}
            pending={savingKey === "siteIdentity"}
            onReset={resetSiteIdentity}
            onSave={() => void saveSiteIdentity()}
          />
        </div>
      </section>
    );
  }

  return (
    <section id="website-browser" className="grid gap-6">
      <header>
        <h2 className="text-title2 font-semibold text-label-primary">
          {t("settings:SETTINGS_SITE_BASICS_BROWSER_PANEL_TITLE")}
        </h2>
        <p className="mt-1 max-w-2xl text-body text-label-secondary">
          {t("settings:SETTINGS_SITE_BASICS_BROWSER_PANEL_DESC")}
        </p>
      </header>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
        <div className="flex min-w-0 flex-col divide-y divide-border">
          <SiteBrandAssetSettingRow
            assetField="siteLogoAssetId"
            currentAssetId={values.siteLogoAssetId}
            currentUrl={values.siteLogoUrl}
            description={t("settings:SETTINGS_SITE_LOGO_DESC")}
            disabled={disabled}
            fieldKey="site_logo"
            form={form}
            initialAssetId={initialValues.siteLogoAssetId}
            initialUrl={initialValues.siteLogoUrl}
            patch={patch}
            patchField="logo"
            removeAriaLabel={t("settings:SETTINGS_ASSET_PICKER_CLEAR")}
            resetKey="reset:siteLogoUrl"
            saveKey="siteLogoUrl"
            savingKey={savingKey}
            title={t("settings:SETTINGS_SITE_LOGO_LABEL")}
            uploadAriaLabel={t("settings:SETTINGS_ASSET_PICKER_SELECT")}
            uploadPurpose="site_logo"
            withSavingKey={withSavingKey}
            assetProjectId={props.assetProjectId}
            urlField="siteLogoUrl"
          />
          <SiteBrandAssetSettingRow
            assetField="siteFaviconAssetId"
            currentAssetId={values.siteFaviconAssetId}
            currentUrl={values.siteFaviconUrl}
            description={t("settings:SETTINGS_SITE_FAVICON_DESC")}
            disabled={disabled}
            fieldKey="site_favicon"
            form={form}
            initialAssetId={initialValues.siteFaviconAssetId}
            initialUrl={initialValues.siteFaviconUrl}
            patch={patch}
            patchField="favicon"
            removeAriaLabel={t("settings:SETTINGS_ASSET_PICKER_CLEAR")}
            resetKey="reset:siteFaviconUrl"
            saveKey="siteFaviconUrl"
            savingKey={savingKey}
            title={t("settings:SETTINGS_SITE_FAVICON_LABEL")}
            uploadAriaLabel={t("settings:SETTINGS_ASSET_PICKER_SELECT")}
            uploadPurpose="favicon"
            withSavingKey={withSavingKey}
            assetProjectId={props.assetProjectId}
            urlField="siteFaviconUrl"
          />
          <SiteBrandAssetSettingRow
            assetField="seoOgImageAssetId"
            currentAssetId={values.seoOgImageAssetId}
            currentUrl={values.seoOgImageUrl}
            description={t("settings:SETTINGS_SITE_OG_IMAGE_DESC")}
            disabled={disabled}
            fieldKey="seo_og_image"
            form={form}
            initialAssetId={initialValues.seoOgImageAssetId}
            initialUrl={initialValues.seoOgImageUrl}
            patch={patch}
            patchField="og_image"
            patchSection="seo"
            removeAriaLabel={t("settings:SETTINGS_ASSET_PICKER_CLEAR")}
            resetKey="reset:seoOgImageUrl"
            saveKey="seoOgImageUrl"
            savingKey={savingKey}
            title={t("settings:SETTINGS_SITE_OG_IMAGE_LABEL")}
            uploadAriaLabel={t("settings:SETTINGS_ASSET_PICKER_SELECT")}
            uploadPurpose="site_logo"
            withSavingKey={withSavingKey}
            assetProjectId={props.assetProjectId}
            urlField="seoOgImageUrl"
          />
          <div className="grid gap-4 py-4">
            <Controller
              control={form.control}
              name="seoTitlePolicy"
              render={({ field }) => (
                <SystemSettingField
                  label={t("settings:SETTINGS_SEO_TITLE_FORMAT_TITLE")}
                  description={t("settings:SETTINGS_SEO_TITLE_FORMAT_DESC")}
                  message={<FieldMessage message={titlePolicyError} />}
                  labelControls={false}
                >
                  <SiteTitlePatternField
                    value={field.value}
                    onChange={field.onChange}
                    siteName={effectiveSiteName}
                    siteSubtitle={values.siteSubtitle}
                  />
                </SystemSettingField>
              )}
            />
            <FieldGroup>
              <Controller
                control={form.control}
                name="seoIndexingEnabled"
                render={({ field }) => (
                  <Field>
                    <SettingSwitchBlock
                      checked={Boolean(field.value)}
                      disabled={disabled}
                      label={t("settings:SETTINGS_SITE_SEARCH_INDEXING_LABEL")}
                      description={t("settings:SETTINGS_SITE_SEARCH_INDEXING_DESC")}
                      onCheckedChange={field.onChange}
                    />
                  </Field>
                )}
              />
              <Controller
                control={form.control}
                name="seoSitemapEnabled"
                render={({ field }) => (
                  <Field>
                    <SettingSwitchBlock
                      checked={Boolean(field.value)}
                      disabled={disabled}
                      label={t("settings:SETTINGS_SITE_SITEMAP_LABEL")}
                      description={t("settings:SETTINGS_SITE_SITEMAP_DESC")}
                      onCheckedChange={field.onChange}
                    />
                  </Field>
                )}
              />
            </FieldGroup>
          </div>
        </div>
        <BrowserDiscoveryMockup
          title={searchPreviewTitle}
          description={effectiveSiteDescription}
          publicUrl={values.siteUrl}
          faviconUrl={values.siteFaviconUrl}
          socialImageUrl={values.seoOgImageUrl}
          siteName={effectiveSiteName}
          indexingAllowed={values.seoIndexingEnabled}
        />
      </div>
      <div className="border-t border-border pt-4">
        <SystemSettingFooterActions
          dirty={browserDiscoveryDirty}
          pending={savingKey === "browserDiscovery"}
          onReset={resetBrowserDiscovery}
          onSave={() => void saveBrowserDiscovery()}
        />
      </div>
    </section>
  );
}
