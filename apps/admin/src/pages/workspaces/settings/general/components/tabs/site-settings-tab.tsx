import { Controller, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useMemo, useState } from "react";

import { Accordion } from "@celestial/ui/accordion";
import { Input } from "@celestial/ui/input";
import { SettingAccordionItem } from "@celestial/ui/setting-accordion-item";
import { Switch } from "@celestial/ui/switch";
import { Textarea } from "@celestial/ui/textarea";

import { resolvePublicAssetUrlPath } from "@/lib/assets/asset-urls";
import { deleteAdminAssetUsageByRef, upsertAdminAssetUsage } from "@/api/asset-usages";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import type { AssetScopeRef } from "@/lib/assets/asset-scope";

import type { GeneralSettingsTabBaseProps } from "@/types/settings-general";
import type { GeneralSettingsFormValues } from "@/types/settings-general";
import { SiteSettingsAssetField } from "./site-settings-asset-field";
import { SeoTitlePolicyField } from "./seo-title-policy-field";
import { LocalizedStringDictField } from "./localized-string-dict-field";
import {
  formatSummaryText,
  isValidEmail,
  normalizeOptionalString,
} from "@/lib/settings/general/utils";
import { getFieldErrorMessage } from "../form-helpers";

type SiteSettingsTabProps = GeneralSettingsTabBaseProps;

function FieldMessage({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="text-footnote text-destructive">{message}</div>;
}

export function SiteSettingsTab({
  form,
  initialValues,
  disabled,
  savingKey,
  withSavingKey,
  patch,
}: SiteSettingsTabProps) {
  const { t } = useTranslation();
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const assetScope = useMemo<AssetScopeRef | null>(
    () => (workspaceId ? { type: "workspace", id: String(workspaceId) } : null),
    [workspaceId],
  );
  const [logoPickerOpen, setLogoPickerOpen] = useState(false);
  const [faviconPickerOpen, setFaviconPickerOpen] = useState(false);

  const siteName = useWatch({ control: form.control, name: "siteName" }) ?? initialValues.siteName;
  const siteNameI18nEnabled =
    useWatch({ control: form.control, name: "siteNameI18nEnabled" }) ??
    initialValues.siteNameI18nEnabled;
  const siteNameI18n =
    useWatch({ control: form.control, name: "siteNameI18n" }) ?? initialValues.siteNameI18n;
  const siteSubtitle =
    useWatch({ control: form.control, name: "siteSubtitle" }) ?? initialValues.siteSubtitle;
  const siteDescription =
    useWatch({ control: form.control, name: "siteDescription" }) ?? initialValues.siteDescription;
  const siteDescriptionI18nEnabled =
    useWatch({ control: form.control, name: "siteDescriptionI18nEnabled" }) ??
    initialValues.siteDescriptionI18nEnabled;
  const siteDescriptionI18n =
    useWatch({ control: form.control, name: "siteDescriptionI18n" }) ??
    initialValues.siteDescriptionI18n;
  const siteUrl = useWatch({ control: form.control, name: "siteUrl" }) ?? initialValues.siteUrl;
  const siteLogoUrl =
    useWatch({ control: form.control, name: "siteLogoUrl" }) ?? initialValues.siteLogoUrl;
  const siteLogoAssetId =
    useWatch({ control: form.control, name: "siteLogoAssetId" }) ?? initialValues.siteLogoAssetId;
  const siteFaviconUrl =
    useWatch({ control: form.control, name: "siteFaviconUrl" }) ?? initialValues.siteFaviconUrl;
  const siteFaviconAssetId =
    useWatch({ control: form.control, name: "siteFaviconAssetId" }) ??
    initialValues.siteFaviconAssetId;
  const siteContactEmail =
    useWatch({ control: form.control, name: "siteContactEmail" }) ?? initialValues.siteContactEmail;
  const seoTitlePolicyV1 =
    useWatch({ control: form.control, name: "seoTitlePolicyV1" }) ?? initialValues.seoTitlePolicyV1;
  const supportedLocales =
    useWatch({ control: form.control, name: "supportedLocales" }) ?? initialValues.supportedLocales;
  const defaultLocale =
    useWatch({ control: form.control, name: "defaultLocale" }) ?? initialValues.defaultLocale;

  const effectiveSiteName = siteNameI18nEnabled
    ? resolveDefaultLocaleValue(siteNameI18n, defaultLocale) || siteName
    : siteName;
  const effectiveSiteDescription = siteDescriptionI18nEnabled
    ? resolveDefaultLocaleValue(siteDescriptionI18n, defaultLocale) || siteDescription
    : siteDescription;

  const isSiteNameDirty =
    (siteName || "") !== (initialValues.siteName || "") ||
    Boolean(siteNameI18nEnabled) !== Boolean(initialValues.siteNameI18nEnabled) ||
    JSON.stringify(siteNameI18n || {}) !== JSON.stringify(initialValues.siteNameI18n || {});
  const isSiteSubtitleDirty = (siteSubtitle || "") !== (initialValues.siteSubtitle || "");
  const isSiteDescriptionDirty =
    (siteDescription || "") !== (initialValues.siteDescription || "") ||
    Boolean(siteDescriptionI18nEnabled) !== Boolean(initialValues.siteDescriptionI18nEnabled) ||
    JSON.stringify(siteDescriptionI18n || {}) !==
      JSON.stringify(initialValues.siteDescriptionI18n || {});
  const isSiteUrlDirty = (siteUrl || "") !== (initialValues.siteUrl || "");
  const isSiteLogoUrlDirty =
    (siteLogoUrl || "") !== (initialValues.siteLogoUrl || "") ||
    (siteLogoAssetId || "") !== (initialValues.siteLogoAssetId || "");
  const isSiteFaviconUrlDirty =
    (siteFaviconUrl || "") !== (initialValues.siteFaviconUrl || "") ||
    (siteFaviconAssetId || "") !== (initialValues.siteFaviconAssetId || "");
  const isSiteContactEmailDirty =
    (siteContactEmail || "") !== (initialValues.siteContactEmail || "");
  const isSeoTitlePolicyDirty =
    JSON.stringify(seoTitlePolicyV1) !== JSON.stringify(initialValues.seoTitlePolicyV1);

  const isResettingSiteName = savingKey === "reset:siteName";
  const isResettingSiteSubtitle = savingKey === "reset:siteSubtitle";
  const isResettingSiteDescription = savingKey === "reset:siteDescription";
  const isResettingSiteUrl = savingKey === "reset:siteUrl";
  const isResettingSiteLogoUrl = savingKey === "reset:siteLogoUrl";
  const isResettingSiteFaviconUrl = savingKey === "reset:siteFaviconUrl";
  const isResettingSiteContactEmail = savingKey === "reset:siteContactEmail";
  const isResettingSeoTitlePolicyV1 = savingKey === "reset:seoTitlePolicyV1";

  const resetSiteName = () =>
    withSavingKey("reset:siteName", async () => {
      form.setValue("siteName", initialValues.siteName, { shouldDirty: false });
      form.setValue("siteNameI18nEnabled", initialValues.siteNameI18nEnabled, {
        shouldDirty: false,
      });
      form.setValue("siteNameI18n", initialValues.siteNameI18n, { shouldDirty: false });
      form.clearErrors(["siteName", "siteNameI18n"]);
      await patch({
        site: {
          name: initialValues.siteName,
          name_i18n: initialValues.siteNameI18nEnabled ? initialValues.siteNameI18n : null,
        },
      });
    });

  const resetSiteSubtitle = () =>
    withSavingKey("reset:siteSubtitle", async () => {
      form.setValue("siteSubtitle", initialValues.siteSubtitle, { shouldDirty: false });
      form.clearErrors("siteSubtitle");
      await patch({ site: { subtitle: normalizeOptionalString(initialValues.siteSubtitle) } });
    });

  const resetSiteDescription = () =>
    withSavingKey("reset:siteDescription", async () => {
      form.setValue("siteDescription", initialValues.siteDescription, { shouldDirty: false });
      form.setValue("siteDescriptionI18nEnabled", initialValues.siteDescriptionI18nEnabled, {
        shouldDirty: false,
      });
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
    });

  const resetSiteUrl = () =>
    withSavingKey("reset:siteUrl", async () => {
      form.setValue("siteUrl", initialValues.siteUrl, { shouldDirty: false });
      form.clearErrors("siteUrl");
      await patch({ site: { url: initialValues.siteUrl } });
    });

  const resetSiteLogoUrl = () =>
    withSavingKey("reset:siteLogoUrl", async () => {
      form.setValue("siteLogoUrl", initialValues.siteLogoUrl, {
        shouldDirty: false,
        shouldValidate: true,
      });
      form.setValue("siteLogoAssetId", initialValues.siteLogoAssetId, { shouldDirty: false });
      await patch({
        site: {
          logo_url: normalizeOptionalString(initialValues.siteLogoUrl),
          logo_asset_id: normalizeOptionalString(initialValues.siteLogoAssetId),
        },
      });

      if (initialValues.siteLogoAssetId) {
        if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
        await upsertAdminAssetUsage(String(workspaceId), {
          assetId: initialValues.siteLogoAssetId,
          purpose: "site_logo",
          entityType: "core.settings",
          entityId: "site",
          fieldKey: "site.logo",
        });
        return;
      }

      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      await deleteAdminAssetUsageByRef({
        workspaceId: String(workspaceId),
        entityType: "core.settings",
        entityId: "site",
        fieldKey: "site.logo",
      });
    });

  const resetSiteFaviconUrl = () =>
    withSavingKey("reset:siteFaviconUrl", async () => {
      form.setValue("siteFaviconUrl", initialValues.siteFaviconUrl, {
        shouldDirty: false,
        shouldValidate: true,
      });
      form.setValue("siteFaviconAssetId", initialValues.siteFaviconAssetId, {
        shouldDirty: false,
      });
      await patch({
        site: {
          favicon_url: normalizeOptionalString(initialValues.siteFaviconUrl),
          favicon_asset_id: normalizeOptionalString(initialValues.siteFaviconAssetId),
        },
      });

      if (initialValues.siteFaviconAssetId) {
        if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
        await upsertAdminAssetUsage(String(workspaceId), {
          assetId: initialValues.siteFaviconAssetId,
          purpose: "favicon",
          entityType: "core.settings",
          entityId: "site",
          fieldKey: "site.favicon",
        });
        return;
      }

      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      await deleteAdminAssetUsageByRef({
        workspaceId: String(workspaceId),
        entityType: "core.settings",
        entityId: "site",
        fieldKey: "site.favicon",
      });
    });

  const resetSiteContactEmail = () =>
    withSavingKey("reset:siteContactEmail", async () => {
      form.setValue("siteContactEmail", initialValues.siteContactEmail, { shouldDirty: false });
      form.clearErrors("siteContactEmail");
      await patch({
        site: { contact_email: normalizeOptionalString(initialValues.siteContactEmail) },
      });
    });

  const resetSeoTitlePolicyV1 = () =>
    withSavingKey("reset:seoTitlePolicyV1", async () => {
      form.setValue("seoTitlePolicyV1", initialValues.seoTitlePolicyV1, { shouldDirty: false });
      form.clearErrors("seoTitlePolicyV1");
      await patch({
        seo: { title_policy_v1: toApiTitlePolicyV1(initialValues.seoTitlePolicyV1) },
      });
    });

  const saveSiteName = () =>
    withSavingKey("siteName", async () => {
      const values = form.getValues();
      const nextDefaultLocale = String(values.defaultLocale || "").trim() || defaultLocale;
      const maybeDefaultLocalePatch =
        nextDefaultLocale && nextDefaultLocale !== initialValues.defaultLocale
          ? { site_localization: { default_locale: nextDefaultLocale, locale: nextDefaultLocale } }
          : {};

      if (!values.siteNameI18nEnabled) {
        const nextName = String(values.siteName || "").trim();
        if (!nextName) {
          form.setError("siteName", {
            type: "validate",
            message: t("setup:SETUP_VALIDATION_SITE_NAME_REQUIRED"),
          });
          throw new Error("FORM_VALIDATION_FAILED");
        }
        form.clearErrors("siteName");
        await patch(
          Object.assign({}, maybeDefaultLocalePatch, { site: { name: nextName, name_i18n: null } }),
        );
        return;
      }

      const nextMap = normalizeLocalizedStringMapForSave(values.siteNameI18n || {});
      const resolved = resolveDefaultLocaleValue(nextMap, nextDefaultLocale);
      if (!resolved) {
        form.setError("siteNameI18n", {
          type: "validate",
          message: t("settings:SETTINGS_I18N_VALIDATION_DEFAULT_REQUIRED"),
        });
        throw new Error("FORM_VALIDATION_FAILED");
      }

      form.clearErrors("siteNameI18n");
      form.setValue("siteNameI18n", nextMap, { shouldDirty: true });
      form.setValue("siteName", resolved, { shouldDirty: true });
      await patch(
        Object.assign({}, maybeDefaultLocalePatch, {
          site: { name: resolved, name_i18n: nextMap },
        }),
      );
    });

  const saveSiteSubtitle = () =>
    withSavingKey("siteSubtitle", async () => {
      const nextValue = String(form.getValues("siteSubtitle") || "");
      if (nextValue.length > 200) {
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
      const values = form.getValues();
      const nextDefaultLocale = String(values.defaultLocale || "").trim() || defaultLocale;
      const maybeDefaultLocalePatch =
        nextDefaultLocale && nextDefaultLocale !== initialValues.defaultLocale
          ? { site_localization: { default_locale: nextDefaultLocale, locale: nextDefaultLocale } }
          : {};

      if (!values.siteDescriptionI18nEnabled) {
        const nextDescription = String(values.siteDescription || "");
        if (nextDescription.length > 200) {
          form.setError("siteDescription", {
            type: "validate",
            message: t("setup:SETUP_VALIDATION_SITE_DESC_MAX"),
          });
          throw new Error("FORM_VALIDATION_FAILED");
        }
        form.clearErrors("siteDescription");
        await patch(
          Object.assign({}, maybeDefaultLocalePatch, {
            site: {
              description: normalizeOptionalString(nextDescription),
              description_i18n: null,
            },
          }),
        );
        return;
      }

      const nextMap = normalizeLocalizedStringMapForSave(values.siteDescriptionI18n || {});
      const resolved = resolveDefaultLocaleValue(nextMap, nextDefaultLocale);
      form.setValue("siteDescriptionI18n", nextMap, { shouldDirty: true });
      form.clearErrors("siteDescriptionI18n");
      await patch(
        Object.assign({}, maybeDefaultLocalePatch, {
          site: {
            description: normalizeOptionalString(resolved || values.siteDescription),
            description_i18n: nextMap,
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
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          throw new Error("invalid protocol");
        }
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

  const saveSiteLogoUrl = () =>
    withSavingKey("siteLogoUrl", async () => {
      const valid = await form.trigger("siteLogoUrl");
      if (!valid) throw new Error("FORM_VALIDATION_FAILED");
      const values = form.getValues();
      const assetId = normalizeOptionalString(values.siteLogoAssetId);
      const url = assetId ? `/assets/${assetId}` : normalizeOptionalString(values.siteLogoUrl);

      await patch({ site: { logo_asset_id: assetId, logo_url: url } });

      if (assetId) {
        if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
        await upsertAdminAssetUsage(String(workspaceId), {
          assetId,
          purpose: "site_logo",
          entityType: "core.settings",
          entityId: "site",
          fieldKey: "site.logo",
        });
        return;
      }

      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      await deleteAdminAssetUsageByRef({
        workspaceId: String(workspaceId),
        entityType: "core.settings",
        entityId: "site",
        fieldKey: "site.logo",
      });
    });

  const saveSiteFaviconUrl = () =>
    withSavingKey("siteFaviconUrl", async () => {
      const valid = await form.trigger("siteFaviconUrl");
      if (!valid) throw new Error("FORM_VALIDATION_FAILED");
      const values = form.getValues();
      const assetId = normalizeOptionalString(values.siteFaviconAssetId);
      const url = assetId ? `/assets/${assetId}` : normalizeOptionalString(values.siteFaviconUrl);

      await patch({ site: { favicon_asset_id: assetId, favicon_url: url } });

      if (assetId) {
        if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
        await upsertAdminAssetUsage(String(workspaceId), {
          assetId,
          purpose: "favicon",
          entityType: "core.settings",
          entityId: "site",
          fieldKey: "site.favicon",
        });
        return;
      }

      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      await deleteAdminAssetUsageByRef({
        workspaceId: String(workspaceId),
        entityType: "core.settings",
        entityId: "site",
        fieldKey: "site.favicon",
      });
    });

  const siteLogoPreviewUrl = useMemo(() => {
    if (siteLogoAssetId) return resolvePublicAssetUrlPath(`/assets/${siteLogoAssetId}`);
    if (siteLogoUrl) return resolvePublicAssetUrlPath(siteLogoUrl) || siteLogoUrl;
    return undefined;
  }, [siteLogoAssetId, siteLogoUrl]);

  const siteFaviconPreviewUrl = useMemo(() => {
    if (siteFaviconAssetId) return resolvePublicAssetUrlPath(`/assets/${siteFaviconAssetId}`);
    if (siteFaviconUrl) return resolvePublicAssetUrlPath(siteFaviconUrl) || siteFaviconUrl;
    return undefined;
  }, [siteFaviconAssetId, siteFaviconUrl]);

  const saveSiteContactEmail = () =>
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

  const saveSeoTitlePolicyV1 = () =>
    withSavingKey("seoTitlePolicyV1", async () => {
      try {
        const nextRaw = form.getValues("seoTitlePolicyV1") ?? initialValues.seoTitlePolicyV1;
        const next = normalizeTitlePolicyV1ForSave(nextRaw, t);
        form.clearErrors("seoTitlePolicyV1");
        form.setValue("seoTitlePolicyV1", next, { shouldDirty: true });
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

  const siteNameError = getFieldErrorMessage(
    form,
    siteNameI18nEnabled ? "siteNameI18n" : "siteName",
  );
  const siteSubtitleError = getFieldErrorMessage(form, "siteSubtitle");
  const siteDescriptionError = getFieldErrorMessage(
    form,
    siteDescriptionI18nEnabled ? "siteDescriptionI18n" : "siteDescription",
  );
  const siteUrlError = getFieldErrorMessage(form, "siteUrl");
  const seoTitlePolicyError = getFieldErrorMessage(form, "seoTitlePolicyV1");
  const siteContactEmailError = getFieldErrorMessage(form, "siteContactEmail");

  const siteNameInput = form.register("siteName");
  const siteSubtitleInput = form.register("siteSubtitle");
  const siteDescriptionInput = form.register("siteDescription");
  const siteUrlInput = form.register("siteUrl");
  const siteContactEmailInput = form.register("siteContactEmail");

  return (
    <Accordion type="single" collapsible className="px-0">
      <SettingAccordionItem
        value="siteName"
        title={t("setup:SETUP_FIELD_SITE_NAME_LABEL")}
        description={t("settings:SETTINGS_SITE_NAME_DESC")}
        showSummary
        summary={formatSummaryText(effectiveSiteName)}
        confirmText={t("settings:SETTINGS_SAVE")}
        onConfirm={saveSiteName}
        confirmLoading={savingKey === "siteName"}
        onReset={isSiteNameDirty || isResettingSiteName ? resetSiteName : undefined}
        resetText={t("settings:SETTINGS_RESET")}
        resetLoading={isResettingSiteName}
        disabled={disabled}
        keepRendered
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <span className="text-footnote text-label-secondary">
            {t("settings:SETTINGS_I18N_ENABLE_LABEL")}
          </span>
          <Switch
            checked={Boolean(siteNameI18nEnabled)}
            onCheckedChange={(checked) => {
              form.setValue("siteNameI18nEnabled", checked, { shouldDirty: true });
              if (checked) {
                const nextDefaultLocale =
                  String(form.getValues("defaultLocale") || "").trim() || defaultLocale;
                const currentMap = form.getValues("siteNameI18n") || {};
                const normalized = normalizeLocalizedStringMapForSave(currentMap);
                if (!Object.keys(normalized).length) {
                  form.setValue(
                    "siteNameI18n",
                    { [nextDefaultLocale]: siteName },
                    { shouldDirty: true },
                  );
                }
                return;
              }
              form.setValue("siteNameI18n", {}, { shouldDirty: true });
            }}
          />
        </div>

        {siteNameI18nEnabled ? (
          <Controller
            control={form.control}
            name="siteNameI18n"
            render={({ field }) => (
              <div className="space-y-2">
                <LocalizedStringDictField
                  supportedLocales={supportedLocales?.length ? supportedLocales : [defaultLocale]}
                  defaultLocale={defaultLocale}
                  value={field.value ?? {}}
                  onChange={field.onChange}
                  onDefaultLocaleChange={(locale) =>
                    form.setValue("defaultLocale", String(locale), { shouldDirty: true })
                  }
                  placeholder={t("setup:SETUP_FIELD_SITE_NAME_PLACEHOLDER")}
                />
                <FieldMessage message={siteNameError} />
              </div>
            )}
          />
        ) : (
          <div className="space-y-2">
            <Input {...siteNameInput} placeholder={t("setup:SETUP_FIELD_SITE_NAME_PLACEHOLDER")} />
            <FieldMessage message={siteNameError} />
          </div>
        )}
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
        onReset={isSiteSubtitleDirty || isResettingSiteSubtitle ? resetSiteSubtitle : undefined}
        resetText={t("settings:SETTINGS_RESET")}
        resetLoading={isResettingSiteSubtitle}
        disabled={disabled}
      >
        <div className="space-y-2">
          <Input
            {...siteSubtitleInput}
            placeholder={t("settings:SETTINGS_SITE_SUBTITLE_PLACEHOLDER")}
          />
          <FieldMessage message={siteSubtitleError} />
        </div>
      </SettingAccordionItem>

      <SettingAccordionItem
        value="siteDescription"
        title={t("settings:SETTINGS_SITE_DESCRIPTION_LABEL")}
        description={t("settings:SETTINGS_SITE_DESCRIPTION_DESC")}
        showSummary
        summary={formatSummaryText(effectiveSiteDescription)}
        confirmText={t("settings:SETTINGS_SAVE")}
        onConfirm={saveSiteDescription}
        confirmLoading={savingKey === "siteDescription"}
        onReset={
          isSiteDescriptionDirty || isResettingSiteDescription ? resetSiteDescription : undefined
        }
        resetText={t("settings:SETTINGS_RESET")}
        resetLoading={isResettingSiteDescription}
        disabled={disabled}
        keepRendered
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <span className="text-footnote text-label-secondary">
            {t("settings:SETTINGS_I18N_ENABLE_LABEL")}
          </span>
          <Switch
            checked={Boolean(siteDescriptionI18nEnabled)}
            onCheckedChange={(checked) => {
              form.setValue("siteDescriptionI18nEnabled", checked, { shouldDirty: true });
              if (checked) {
                const nextDefaultLocale =
                  String(form.getValues("defaultLocale") || "").trim() || defaultLocale;
                const currentMap = form.getValues("siteDescriptionI18n") || {};
                const normalized = normalizeLocalizedStringMapForSave(currentMap);
                if (!Object.keys(normalized).length) {
                  form.setValue(
                    "siteDescriptionI18n",
                    { [nextDefaultLocale]: siteDescription },
                    { shouldDirty: true },
                  );
                }
                return;
              }
              form.setValue("siteDescriptionI18n", {}, { shouldDirty: true });
            }}
          />
        </div>

        {siteDescriptionI18nEnabled ? (
          <Controller
            control={form.control}
            name="siteDescriptionI18n"
            render={({ field }) => (
              <div className="space-y-2">
                <LocalizedStringDictField
                  supportedLocales={supportedLocales?.length ? supportedLocales : [defaultLocale]}
                  defaultLocale={defaultLocale}
                  value={field.value ?? {}}
                  onChange={field.onChange}
                  onDefaultLocaleChange={(locale) =>
                    form.setValue("defaultLocale", String(locale), { shouldDirty: true })
                  }
                  placeholder={t("settings:SETTINGS_SITE_DESCRIPTION_PLACEHOLDER")}
                  multiline
                />
                <FieldMessage message={siteDescriptionError} />
              </div>
            )}
          />
        ) : (
          <div className="space-y-2">
            <Textarea
              {...siteDescriptionInput}
              rows={4}
              maxLength={200}
              placeholder={t("settings:SETTINGS_SITE_DESCRIPTION_PLACEHOLDER")}
            />
            <div className="flex items-center justify-between gap-3 text-caption text-label-secondary">
              <FieldMessage message={siteDescriptionError} />
              <span>{String(siteDescription || "").length}/200</span>
            </div>
          </div>
        )}
      </SettingAccordionItem>

      <SettingAccordionItem
        value="seoTitlePolicyV1"
        title={t("settings:SETTINGS_SEO_TITLE_FORMAT_TITLE")}
        description={t("settings:SETTINGS_SEO_TITLE_FORMAT_DESC")}
        showSummary
        summary={formatTitlePolicySummary(seoTitlePolicyV1)}
        confirmText={t("settings:SETTINGS_SAVE")}
        onConfirm={saveSeoTitlePolicyV1}
        confirmLoading={savingKey === "seoTitlePolicyV1"}
        onReset={
          isSeoTitlePolicyDirty || isResettingSeoTitlePolicyV1 ? resetSeoTitlePolicyV1 : undefined
        }
        resetText={t("settings:SETTINGS_RESET")}
        resetLoading={isResettingSeoTitlePolicyV1}
        disabled={disabled}
        keepRendered
      >
        <Controller
          control={form.control}
          name="seoTitlePolicyV1"
          render={({ field }) => (
            <div className="space-y-2">
              <SeoTitlePolicyField
                value={field.value}
                onChange={(next) => field.onChange(next)}
                siteName={effectiveSiteName}
                siteSubtitle={siteSubtitle}
              />
              <FieldMessage message={seoTitlePolicyError} />
            </div>
          )}
        />
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
        resetText={t("settings:SETTINGS_RESET")}
        resetLoading={isResettingSiteUrl}
        disabled={disabled}
      >
        <div className="space-y-2">
          <Input {...siteUrlInput} placeholder={t("setup:SETUP_FIELD_SITE_URL_PLACEHOLDER")} />
          <FieldMessage message={siteUrlError} />
        </div>
      </SettingAccordionItem>

      <SettingAccordionItem
        value="siteLogoUrl"
        title={t("settings:SETTINGS_SITE_LOGO_LABEL")}
        description={t("settings:SETTINGS_SITE_LOGO_DESC")}
        confirmText={t("settings:SETTINGS_SAVE")}
        onConfirm={saveSiteLogoUrl}
        confirmLoading={savingKey === "siteLogoUrl"}
        onReset={isSiteLogoUrlDirty || isResettingSiteLogoUrl ? resetSiteLogoUrl : undefined}
        resetText={t("settings:SETTINGS_RESET")}
        resetLoading={isResettingSiteLogoUrl}
        disabled={disabled}
        keepRendered
      >
        <SiteSettingsAssetField
          form={form}
          scope={assetScope}
          assetFieldName="siteLogoAssetId"
          urlFieldName="siteLogoUrl"
          previewUrl={siteLogoPreviewUrl}
          assetId={siteLogoAssetId}
          url={siteLogoUrl}
          pickerOpen={logoPickerOpen}
          onPickerOpenChange={setLogoPickerOpen}
          uploadPurpose="site_logo"
          pickerTitle={t("settings:SETTINGS_SITE_LOGO_PICKER_TITLE")}
          pickerDescription={t("settings:SETTINGS_SITE_LOGO_PICKER_DESC")}
          inputPlaceholder={t("settings:SETTINGS_SITE_LOGO_PLACEHOLDER")}
        />
      </SettingAccordionItem>

      <SettingAccordionItem
        value="siteFaviconUrl"
        title={t("settings:SETTINGS_SITE_FAVICON_LABEL")}
        description={t("settings:SETTINGS_SITE_FAVICON_DESC")}
        confirmText={t("settings:SETTINGS_SAVE")}
        onConfirm={saveSiteFaviconUrl}
        confirmLoading={savingKey === "siteFaviconUrl"}
        onReset={
          isSiteFaviconUrlDirty || isResettingSiteFaviconUrl ? resetSiteFaviconUrl : undefined
        }
        resetText={t("settings:SETTINGS_RESET")}
        resetLoading={isResettingSiteFaviconUrl}
        disabled={disabled}
        keepRendered
      >
        <SiteSettingsAssetField
          form={form}
          scope={assetScope}
          assetFieldName="siteFaviconAssetId"
          urlFieldName="siteFaviconUrl"
          previewUrl={siteFaviconPreviewUrl}
          assetId={siteFaviconAssetId}
          url={siteFaviconUrl}
          pickerOpen={faviconPickerOpen}
          onPickerOpenChange={setFaviconPickerOpen}
          uploadPurpose="favicon"
          pickerTitle={t("settings:SETTINGS_SITE_FAVICON_PICKER_TITLE")}
          pickerDescription={t("settings:SETTINGS_SITE_FAVICON_PICKER_DESC")}
          inputPlaceholder={t("settings:SETTINGS_SITE_FAVICON_PLACEHOLDER")}
        />
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
          isSiteContactEmailDirty || isResettingSiteContactEmail ? resetSiteContactEmail : undefined
        }
        resetText={t("settings:SETTINGS_RESET")}
        resetLoading={isResettingSiteContactEmail}
        disabled={disabled}
      >
        <div className="space-y-2">
          <Input
            {...siteContactEmailInput}
            placeholder={t("settings:SETTINGS_SITE_CONTACT_EMAIL_PLACEHOLDER")}
          />
          <FieldMessage message={siteContactEmailError} />
        </div>
      </SettingAccordionItem>
    </Accordion>
  );
}

function toApiTitlePolicyV1(
  input: GeneralSettingsFormValues["seoTitlePolicyV1"],
): Record<string, unknown> {
  const homeMode = input.homeMode ?? "siteOnly";
  return {
    parts: input.parts,
    home_mode: homeMode,
    dedupe: input.dedupe !== false,
  };
}

function normalizeTitlePolicyV1ForSave(
  input: GeneralSettingsFormValues["seoTitlePolicyV1"],
  t: (key: string, options?: Record<string, unknown>) => string,
): GeneralSettingsFormValues["seoTitlePolicyV1"] {
  const raw = input as unknown as {
    parts?: unknown;
    homeMode?: unknown;
    home_mode?: unknown;
    dedupe?: unknown;
  };

  const partsUnknown = raw?.parts;
  if (!Array.isArray(partsUnknown)) {
    throw new Error(t("settings:SETTINGS_SEO_TITLE_FORMAT_VALIDATION_INVALID"));
  }
  if (partsUnknown.length === 0) {
    throw new Error(t("settings:SETTINGS_SEO_TITLE_FORMAT_VALIDATION_EMPTY"));
  }
  if (partsUnknown.length > 32) {
    throw new Error(t("settings:SETTINGS_SEO_TITLE_FORMAT_VALIDATION_TOO_MANY_PARTS", { max: 32 }));
  }

  const allowedTokens = new Set(["pageTitle", "siteName", "siteSubtitle"]);
  const parts: Array<
    | { kind: "token"; value: "pageTitle" | "siteName" | "siteSubtitle" }
    | { kind: "literal"; value: string }
  > = [];

  for (const partUnknown of partsUnknown) {
    if (!partUnknown || typeof partUnknown !== "object" || Array.isArray(partUnknown)) {
      throw new Error(t("settings:SETTINGS_SEO_TITLE_FORMAT_VALIDATION_INVALID_PART"));
    }
    const partRecord = partUnknown as Record<string, unknown>;
    const kind = typeof partRecord.kind === "string" ? partRecord.kind.trim() : "";
    const valueRaw = partRecord.value;

    if (kind === "token") {
      const token = typeof valueRaw === "string" ? valueRaw.trim() : String(valueRaw ?? "").trim();
      if (!allowedTokens.has(token)) {
        throw new Error(
          t("settings:SETTINGS_SEO_TITLE_FORMAT_VALIDATION_INVALID_TOKEN", { token }),
        );
      }
      parts.push({ kind: "token", value: token as "pageTitle" | "siteName" | "siteSubtitle" });
      continue;
    }

    if (kind === "literal") {
      const literal = typeof valueRaw === "string" ? valueRaw : String(valueRaw ?? "");
      if (literal.length > 64) {
        throw new Error(
          t("settings:SETTINGS_SEO_TITLE_FORMAT_VALIDATION_LITERAL_TOO_LONG", { max: 64 }),
        );
      }
      parts.push({ kind: "literal", value: literal });
      continue;
    }

    throw new Error(t("settings:SETTINGS_SEO_TITLE_FORMAT_VALIDATION_INVALID_PART"));
  }

  if (!parts.some((part) => part.kind === "token")) {
    throw new Error(t("settings:SETTINGS_SEO_TITLE_FORMAT_VALIDATION_REQUIRE_TOKEN"));
  }

  const homeModeRaw = (
    typeof raw.homeMode === "string"
      ? raw.homeMode
      : typeof raw.home_mode === "string"
        ? raw.home_mode
        : ""
  ).trim();
  const homeMode =
    homeModeRaw === "policy" || homeModeRaw === "siteOnly" ? homeModeRaw : "siteOnly";
  const dedupe = typeof raw.dedupe === "boolean" ? raw.dedupe : true;

  return { parts, homeMode, dedupe };
}

function formatTitlePolicySummary(input: GeneralSettingsFormValues["seoTitlePolicyV1"]): string {
  const parts = input.parts ?? [];
  if (!parts.length) return "-";
  const tokens = parts
    .map((part) => (part.kind === "token" ? part.value : null))
    .filter((value): value is NonNullable<typeof value> => Boolean(value));
  const literalCount = parts.filter((part) => part.kind === "literal").length;
  return `${tokens.join(" + ")}${literalCount ? ` (${literalCount} literals)` : ""}`;
}

function normalizeLocalizedStringMapForSave(input: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [keyRaw, valueRaw] of Object.entries(input || {})) {
    const key = String(keyRaw || "").trim();
    const value = String(valueRaw || "").trim();
    if (!key || !value) continue;
    out[key] = value;
  }
  return out;
}

function resolveDefaultLocaleValue(map: Record<string, string>, defaultLocale: string): string {
  const nextDefaultLocale = (defaultLocale || "").trim();
  if (
    nextDefaultLocale &&
    typeof map?.[nextDefaultLocale] === "string" &&
    map[nextDefaultLocale]?.trim()
  ) {
    return map[nextDefaultLocale]!.trim();
  }
  const firstValue = Object.values(map || {}).find(
    (value) => typeof value === "string" && value.trim(),
  );
  return (firstValue || "").trim();
}
