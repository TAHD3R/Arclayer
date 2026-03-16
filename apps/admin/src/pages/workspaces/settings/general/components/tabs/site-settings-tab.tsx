import { useMemo } from "react";
import { Controller, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { Accordion } from "@celestial/ui/accordion";
import { Input } from "@celestial/ui/input";
import { SettingAccordionItem } from "@celestial/ui/setting-accordion-item";
import { SettingPanel } from "@celestial/ui/setting-panel";
import { Textarea } from "@celestial/ui/textarea";

import { SettingSwitchBlock } from "@/components/settings/setting-switch-block";
import { isValidEmail } from "@/lib/settings/general/utils";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import type {
  GeneralSettingsFormValues,
  GeneralSettingsTabBaseProps,
} from "@/types/settings-general";
import { getFieldErrorMessage } from "../form-helpers";
import { LocalizedStringDictField } from "./localized-string-dict-field";
import { SiteBrandAssetAccordionItem } from "./site-brand-asset-accordion-item";
import {
  formatSummaryText,
  formatTitlePolicySummary,
  normalizeLocalizedStringMapForSave,
  normalizeOptionalString,
  normalizeTitlePolicyV1ForSave,
  resolveDefaultLocaleValue,
  toApiTitlePolicyV1,
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

function FieldMessage({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="text-footnote text-destructive">{message}</div>;
}

function LocalizedFieldEditor(props: LocalizedFieldProps) {
  return (
    <div className="space-y-3">
      <SettingSwitchBlock
        checked={props.enabled}
        disabled={props.disabled}
        label={props.enabledLabel}
        description={props.enabledDescription}
        onCheckedChange={props.onToggle}
      />

      {props.enabled ? (
        <Controller
          control={props.form.control}
          name={props.dictName}
          render={({ field }) => (
            <div className="space-y-2">
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
            </div>
          )}
        />
      ) : props.multiline ? (
        <div className="space-y-2">
          <Textarea
            {...props.form.register(props.inputName)}
            rows={4}
            maxLength={DESCRIPTION_MAX_LENGTH}
            placeholder={props.placeholder}
          />
          <div className="flex items-center justify-between gap-3 text-caption text-label-secondary">
            <FieldMessage message={props.error} />
            <span>
              {props.rawValue.length}/{DESCRIPTION_MAX_LENGTH}
            </span>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Input {...props.form.register(props.inputName)} placeholder={props.placeholder} />
          <FieldMessage message={props.error} />
        </div>
      )}
    </div>
  );
}

function buildDefaultLocalePatch(nextLocale: string, initialLocale: string) {
  if (!nextLocale || nextLocale === initialLocale) return {};
  return { site_localization: { default_locale: nextLocale, locale: nextLocale } };
}

export function SiteSettingsTab(props: GeneralSettingsTabBaseProps) {
  const { disabled, form, initialValues, patch, savingKey, withSavingKey } = props;
  const { t } = useTranslation();
  const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
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
  const titlePolicyError = getFieldErrorMessage(form, "seoTitlePolicyV1");

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
    JSON.stringify(values.seoTitlePolicyV1) !== JSON.stringify(initialValues.seoTitlePolicyV1);

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

  const saveSiteName = () =>
    withSavingKey("siteName", async () => {
      const nextLocale = String(form.getValues("defaultLocale") || values.defaultLocale).trim();
      if (!form.getValues("siteNameI18nEnabled")) {
        const nextName = String(form.getValues("siteName") || "").trim();
        if (!nextName) {
          form.setError("siteName", {
            type: "validate",
            message: t("setup:SETUP_VALIDATION_SITE_NAME_REQUIRED"),
          });
          throw new Error("FORM_VALIDATION_FAILED");
        }
        form.clearErrors(["siteName", "siteNameI18n"]);
        await patch(
          Object.assign({}, buildDefaultLocalePatch(nextLocale, initialValues.defaultLocale), {
            site: { name: nextName, name_i18n: null },
          }),
        );
        return;
      }

      const nextMap = normalizeLocalizedStringMapForSave(form.getValues("siteNameI18n") || {});
      const resolvedName = resolveDefaultLocaleValue(nextMap, nextLocale);
      if (!resolvedName) {
        form.setError("siteNameI18n", {
          type: "validate",
          message: t("settings:SETTINGS_I18N_VALIDATION_DEFAULT_REQUIRED"),
        });
        throw new Error("FORM_VALIDATION_FAILED");
      }
      form.setValue("siteNameI18n", nextMap, { shouldDirty: true });
      form.setValue("siteName", resolvedName, { shouldDirty: true });
      form.clearErrors(["siteName", "siteNameI18n"]);
      await patch(
        Object.assign({}, buildDefaultLocalePatch(nextLocale, initialValues.defaultLocale), {
          site: { name: resolvedName, name_i18n: nextMap },
        }),
      );
    });

  const saveSiteSubtitle = () =>
    withSavingKey("siteSubtitle", async () => {
      const nextValue = String(form.getValues("siteSubtitle") || "");
      if (nextValue.length > TAGLINE_MAX_LENGTH) {
        form.setError("siteSubtitle", {
          type: "validate",
          message: t("setup:SETUP_VALIDATION_SITE_DESC_MAX"),
        });
        throw new Error("FORM_VALIDATION_FAILED");
      }
      form.clearErrors("siteSubtitle");
      await patch({ site: { subtitle: normalizeOptionalString(nextValue) } });
    });

  const saveSiteDescription = () =>
    withSavingKey("siteDescription", async () => {
      const nextLocale = String(form.getValues("defaultLocale") || values.defaultLocale).trim();
      if (!form.getValues("siteDescriptionI18nEnabled")) {
        const nextValue = String(form.getValues("siteDescription") || "");
        if (nextValue.length > DESCRIPTION_MAX_LENGTH) {
          form.setError("siteDescription", {
            type: "validate",
            message: t("setup:SETUP_VALIDATION_SITE_DESC_MAX"),
          });
          throw new Error("FORM_VALIDATION_FAILED");
        }
        form.clearErrors(["siteDescription", "siteDescriptionI18n"]);
        await patch(
          Object.assign({}, buildDefaultLocalePatch(nextLocale, initialValues.defaultLocale), {
            site: {
              description: normalizeOptionalString(nextValue),
              description_i18n: null,
            },
          }),
        );
        return;
      }

      const nextMap = normalizeLocalizedStringMapForSave(
        form.getValues("siteDescriptionI18n") || {},
      );
      const resolved = resolveDefaultLocaleValue(nextMap, nextLocale);
      form.setValue("siteDescriptionI18n", nextMap, { shouldDirty: true });
      form.clearErrors(["siteDescription", "siteDescriptionI18n"]);
      await patch(
        Object.assign({}, buildDefaultLocalePatch(nextLocale, initialValues.defaultLocale), {
          site: {
            description: normalizeOptionalString(resolved || form.getValues("siteDescription")),
            description_i18n: Object.keys(nextMap).length ? nextMap : null,
          },
        }),
      );
    });

  const saveSiteUrl = () =>
    withSavingKey("siteUrl", async () => {
      const nextValue = String(form.getValues("siteUrl") || "").trim();
      if (!nextValue) {
        form.setError("siteUrl", {
          type: "validate",
          message: t("setup:SETUP_VALIDATION_SITE_URL_REQUIRED"),
        });
        throw new Error("FORM_VALIDATION_FAILED");
      }
      try {
        const url = new URL(nextValue);
        if (url.protocol !== "http:" && url.protocol !== "https:")
          throw new Error("INVALID_PROTOCOL");
      } catch {
        form.setError("siteUrl", {
          type: "validate",
          message: t("setup:SETUP_VALIDATION_SITE_URL_INVALID"),
        });
        throw new Error("FORM_VALIDATION_FAILED");
      }
      form.clearErrors("siteUrl");
      await patch({ site: { url: nextValue } });
    });

  const saveSupportInbox = () =>
    withSavingKey("siteContactEmail", async () => {
      const nextValue = String(form.getValues("siteContactEmail") || "").trim();
      if (!isValidEmail(nextValue)) {
        form.setError("siteContactEmail", {
          type: "validate",
          message: t("settings:SETTINGS_VALIDATION_EMAIL_INVALID"),
        });
        throw new Error("FORM_VALIDATION_FAILED");
      }
      form.clearErrors("siteContactEmail");
      await patch({ site: { contact_email: normalizeOptionalString(nextValue) } });
    });

  const saveTitlePattern = () =>
    withSavingKey("seoTitlePolicyV1", async () => {
      try {
        const next = normalizeTitlePolicyV1ForSave(
          form.getValues("seoTitlePolicyV1") ?? initialValues.seoTitlePolicyV1,
          t,
        );
        form.setValue("seoTitlePolicyV1", next, { shouldDirty: true });
        form.clearErrors("seoTitlePolicyV1");
        await patch({ seo: { title_policy_v1: toApiTitlePolicyV1(next) } });
      } catch (error) {
        form.setError("seoTitlePolicyV1", {
          type: "validate",
          message:
            error instanceof Error
              ? error.message
              : t("settings:SETTINGS_SEO_TITLE_FORMAT_VALIDATION_INVALID"),
        });
        throw error;
      }
    });

  const siteIdentitySummary = useMemo(
    () => formatSummaryText(effectiveSiteName),
    [effectiveSiteName],
  );

  return (
    <div className="space-y-8">
      <SettingPanel
        title={t("settings:SETTINGS_SITE_BASICS_IDENTITY_PANEL_TITLE")}
        description={t("settings:SETTINGS_SITE_BASICS_IDENTITY_PANEL_DESC")}
      >
        <div className="rounded-lg border border-border">
          <Accordion type="single" collapsible className="px-0">
            <SettingAccordionItem
              value="site_name"
              variant="action"
              title={t("settings:SETTINGS_SITE_NAME_LABEL")}
              description={t("settings:SETTINGS_SITE_NAME_DESC")}
              showSummary
              summary={siteIdentitySummary}
              placeholder={t("settings:SETTINGS_NOT_SET")}
              keepRendered
              disabled={disabled}
              confirmText={t("settings:SETTINGS_SAVE")}
              confirmLoading={savingKey === "siteName"}
              onConfirm={saveSiteName}
              onReset={
                isSiteNameDirty
                  ? () =>
                      withSavingKey("reset:siteName", async () => {
                        form.setValue("siteName", initialValues.siteName, { shouldDirty: false });
                        form.setValue("siteNameI18nEnabled", initialValues.siteNameI18nEnabled, {
                          shouldDirty: false,
                        });
                        form.setValue("siteNameI18n", initialValues.siteNameI18n, {
                          shouldDirty: false,
                        });
                        form.clearErrors(["siteName", "siteNameI18n"]);
                        await patch({
                          site: {
                            name: initialValues.siteName,
                            name_i18n: initialValues.siteNameI18nEnabled
                              ? initialValues.siteNameI18n
                              : null,
                          },
                        });
                      })
                  : undefined
              }
              resetText={t("settings:SETTINGS_RESET")}
              resetLoading={savingKey === "reset:siteName"}
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
            </SettingAccordionItem>

            <SettingAccordionItem
              value="site_tagline"
              variant="action"
              title={t("settings:SETTINGS_SITE_SUBTITLE_LABEL")}
              description={t("settings:SETTINGS_SITE_SUBTITLE_DESC")}
              showSummary
              summary={formatSummaryText(values.siteSubtitle)}
              placeholder={t("settings:SETTINGS_NOT_SET")}
              disabled={disabled}
              contentLayout="inline"
              confirmText={t("settings:SETTINGS_SAVE")}
              confirmLoading={savingKey === "siteSubtitle"}
              onConfirm={saveSiteSubtitle}
              onReset={
                isSiteSubtitleDirty
                  ? () =>
                      withSavingKey("reset:siteSubtitle", async () => {
                        form.setValue("siteSubtitle", initialValues.siteSubtitle, {
                          shouldDirty: false,
                        });
                        form.clearErrors("siteSubtitle");
                        await patch({
                          site: { subtitle: normalizeOptionalString(initialValues.siteSubtitle) },
                        });
                      })
                  : undefined
              }
              resetText={t("settings:SETTINGS_RESET")}
              resetLoading={savingKey === "reset:siteSubtitle"}
            >
              <div className="space-y-2">
                <Input
                  {...form.register("siteSubtitle")}
                  placeholder={t("settings:SETTINGS_SITE_SUBTITLE_PLACEHOLDER")}
                />
                <FieldMessage message={siteSubtitleError} />
              </div>
            </SettingAccordionItem>

            <SettingAccordionItem
              value="site_description"
              variant="action"
              title={t("settings:SETTINGS_SITE_DESCRIPTION_LABEL")}
              description={t("settings:SETTINGS_SITE_DESCRIPTION_DESC")}
              showSummary
              summary={formatSummaryText(effectiveSiteDescription)}
              placeholder={t("settings:SETTINGS_NOT_SET")}
              keepRendered
              disabled={disabled}
              confirmText={t("settings:SETTINGS_SAVE")}
              confirmLoading={savingKey === "siteDescription"}
              onConfirm={saveSiteDescription}
              onReset={
                isSiteDescriptionDirty
                  ? () =>
                      withSavingKey("reset:siteDescription", async () => {
                        form.setValue("siteDescription", initialValues.siteDescription, {
                          shouldDirty: false,
                        });
                        form.setValue(
                          "siteDescriptionI18nEnabled",
                          initialValues.siteDescriptionI18nEnabled,
                          { shouldDirty: false },
                        );
                        form.setValue("siteDescriptionI18n", initialValues.siteDescriptionI18n, {
                          shouldDirty: false,
                        });
                        form.clearErrors(["siteDescription", "siteDescriptionI18n"]);
                        await patch({
                          site: {
                            description: normalizeOptionalString(initialValues.siteDescription),
                            description_i18n: initialValues.siteDescriptionI18nEnabled
                              ? initialValues.siteDescriptionI18n
                              : null,
                          },
                        });
                      })
                  : undefined
              }
              resetText={t("settings:SETTINGS_RESET")}
              resetLoading={savingKey === "reset:siteDescription"}
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
            </SettingAccordionItem>

            <SettingAccordionItem
              value="site_url"
              variant="action"
              title={t("settings:SETTINGS_SITE_PUBLIC_URL_LABEL")}
              description={t("settings:SETTINGS_SITE_PUBLIC_URL_DESC")}
              showSummary
              summary={formatSummaryText(values.siteUrl)}
              placeholder={t("settings:SETTINGS_NOT_SET")}
              disabled={disabled}
              contentLayout="inline"
              confirmText={t("settings:SETTINGS_SAVE")}
              confirmLoading={savingKey === "siteUrl"}
              onConfirm={saveSiteUrl}
              onReset={
                isSiteUrlDirty
                  ? () =>
                      withSavingKey("reset:siteUrl", async () => {
                        form.setValue("siteUrl", initialValues.siteUrl, { shouldDirty: false });
                        form.clearErrors("siteUrl");
                        await patch({ site: { url: initialValues.siteUrl } });
                      })
                  : undefined
              }
              resetText={t("settings:SETTINGS_RESET")}
              resetLoading={savingKey === "reset:siteUrl"}
            >
              <div className="space-y-2">
                <Input
                  {...form.register("siteUrl")}
                  placeholder={t("settings:SETTINGS_SITE_PUBLIC_URL_PLACEHOLDER")}
                />
                <FieldMessage message={siteUrlError} />
              </div>
            </SettingAccordionItem>

            <SettingAccordionItem
              value="site_support_inbox"
              variant="action"
              title={t("settings:SETTINGS_SITE_CONTACT_EMAIL_LABEL")}
              description={t("settings:SETTINGS_SITE_CONTACT_EMAIL_DESC")}
              showSummary
              summary={formatSummaryText(values.siteContactEmail)}
              placeholder={t("settings:SETTINGS_NOT_SET")}
              disabled={disabled}
              contentLayout="inline"
              confirmText={t("settings:SETTINGS_SAVE")}
              confirmLoading={savingKey === "siteContactEmail"}
              onConfirm={saveSupportInbox}
              onReset={
                isSupportInboxDirty
                  ? () =>
                      withSavingKey("reset:siteContactEmail", async () => {
                        form.setValue("siteContactEmail", initialValues.siteContactEmail, {
                          shouldDirty: false,
                        });
                        form.clearErrors("siteContactEmail");
                        await patch({
                          site: {
                            contact_email: normalizeOptionalString(initialValues.siteContactEmail),
                          },
                        });
                      })
                  : undefined
              }
              resetText={t("settings:SETTINGS_RESET")}
              resetLoading={savingKey === "reset:siteContactEmail"}
            >
              <div className="space-y-2">
                <Input
                  {...form.register("siteContactEmail")}
                  placeholder={t("settings:SETTINGS_SITE_CONTACT_EMAIL_PLACEHOLDER")}
                />
                <FieldMessage message={siteContactEmailError} />
              </div>
            </SettingAccordionItem>
          </Accordion>
        </div>
      </SettingPanel>

      <SettingPanel
        title={t("settings:SETTINGS_SITE_BASICS_BROWSER_PANEL_TITLE")}
        description={t("settings:SETTINGS_SITE_BASICS_BROWSER_PANEL_DESC")}
      >
        <div className="rounded-lg border border-border">
          <Accordion type="single" collapsible className="px-0">
            <SiteBrandAssetAccordionItem
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
              workspaceId={workspaceId}
              urlField="siteLogoUrl"
            />

            <SiteBrandAssetAccordionItem
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
              workspaceId={workspaceId}
              urlField="siteFaviconUrl"
            />

            <SettingAccordionItem
              value="site_title_pattern"
              variant="action"
              title={t("settings:SETTINGS_SEO_TITLE_FORMAT_TITLE")}
              description={t("settings:SETTINGS_SEO_TITLE_FORMAT_DESC")}
              showSummary
              summary={formatTitlePolicySummary(values.seoTitlePolicyV1)}
              placeholder={t("settings:SETTINGS_NOT_SET")}
              keepRendered
              disabled={disabled}
              confirmText={t("settings:SETTINGS_SAVE")}
              confirmLoading={savingKey === "seoTitlePolicyV1"}
              onConfirm={saveTitlePattern}
              onReset={
                isTitlePolicyDirty
                  ? () =>
                      withSavingKey("reset:seoTitlePolicyV1", async () => {
                        form.setValue("seoTitlePolicyV1", initialValues.seoTitlePolicyV1, {
                          shouldDirty: false,
                        });
                        form.clearErrors("seoTitlePolicyV1");
                        await patch({
                          seo: {
                            title_policy_v1: toApiTitlePolicyV1(initialValues.seoTitlePolicyV1),
                          },
                        });
                      })
                  : undefined
              }
              resetText={t("settings:SETTINGS_RESET")}
              resetLoading={savingKey === "reset:seoTitlePolicyV1"}
            >
              <Controller
                control={form.control}
                name="seoTitlePolicyV1"
                render={({ field }) => (
                  <div className="space-y-2">
                    <SiteTitlePatternField
                      value={field.value}
                      onChange={field.onChange}
                      siteName={effectiveSiteName}
                      siteSubtitle={values.siteSubtitle}
                    />
                    <FieldMessage message={titlePolicyError} />
                  </div>
                )}
              />
            </SettingAccordionItem>
          </Accordion>
        </div>
      </SettingPanel>
    </div>
  );
}
