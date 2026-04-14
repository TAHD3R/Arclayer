import { Controller, useWatch } from "react-hook-form";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { Accordion } from "@arclayer/ui/accordion";
import { SettingAccordionItem } from "@arclayer/ui/setting-accordion-item";
import { SettingActionGroup } from "@arclayer/ui/setting-action-group";
import { SettingPanel } from "@arclayer/ui/setting-panel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";

import {
  DateTimeFormatLocalizationControl,
  TimezoneLocalizationControl,
} from "@/components/settings/date-time-localization-controls";
import { StringTagsField } from "@arclayer/ui/string-tags-field";
import { getLocaleMetadata } from "@/lib/i18n";
import {
  resolveLocalizationDateFormatSummary,
  resolveLocalizationTimeZoneSummary,
} from "@/lib/settings/general/datetime-localization";
import {
  buildDateFormatOptions,
  buildTimezoneOptions,
} from "@/lib/settings/general/localization-options";
import type { GeneralSettingsTabBaseProps } from "@/types/settings-general";
import { getFieldErrorMessage, validateFormFields } from "../form-helpers";

type LocalizationSettingsTabProps = GeneralSettingsTabBaseProps;

function getBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function LocalizationSettingsTab({
  form,
  initialValues,
  disabled,
  savingKey,
  withSavingKey,
  patch,
}: LocalizationSettingsTabProps) {
  const { t } = useTranslation();

  const supportedLocales =
    useWatch({ control: form.control, name: "supportedLocales" }) ?? initialValues.supportedLocales;
  const defaultLocale =
    useWatch({ control: form.control, name: "defaultLocale" }) ?? initialValues.defaultLocale;
  const fallbackLocale =
    useWatch({ control: form.control, name: "fallbackLocale" }) ?? initialValues.fallbackLocale;
  const timezone = useWatch({ control: form.control, name: "timezone" }) ?? initialValues.timezone;
  const useBrowserTimeZone =
    useWatch({ control: form.control, name: "useBrowserTimeZone" }) ??
    initialValues.useBrowserTimeZone;
  const dateFormat =
    useWatch({ control: form.control, name: "dateFormat" }) ?? initialValues.dateFormat;
  const useRelativeDateTime =
    useWatch({ control: form.control, name: "useRelativeDateTime" }) ??
    initialValues.useRelativeDateTime;

  const browserTimeZone = useMemo(() => getBrowserTimeZone(), []);
  const localeOptions = supportedLocales
    .map((loc) => normalizeLocaleTag(loc))
    .filter((value): value is string => Boolean(value))
    .map((value) => ({
      value,
      label: getLocaleMetadata(value, t).label,
    }));
  const timezoneOptions = buildTimezoneOptions(timezone);
  const dateFormatOptions = buildDateFormatOptions();

  const localeLabel = defaultLocale ? getLocaleMetadata(defaultLocale, t).label : defaultLocale;
  const fallbackLocaleLabel = fallbackLocale
    ? getLocaleMetadata(fallbackLocale, t).label
    : fallbackLocale;
  const timezoneLabel = resolveLocalizationTimeZoneSummary({
    autoLabel: t("settings:SETTINGS_TIMEZONE_AUTO_SHORT"),
    browserTimeZone,
    timeZone: timezone,
    useBrowserTimeZone,
  });
  const dateFormatLabel = resolveLocalizationDateFormatSummary({
    dateFormat,
    relativeLabel: t("settings:SETTINGS_DATETIME_RELATIVE_SHORT"),
    useRelativeDateTime,
  });

  const isSupportedLocalesDirty =
    JSON.stringify(supportedLocales || []) !== JSON.stringify(initialValues.supportedLocales || []);
  const isDefaultLocaleDirty = (defaultLocale || "") !== (initialValues.defaultLocale || "");
  const isFallbackLocaleDirty = (fallbackLocale || "") !== (initialValues.fallbackLocale || "");
  const isTimezoneDirty =
    (timezone || "") !== (initialValues.timezone || "") ||
    useBrowserTimeZone !== initialValues.useBrowserTimeZone;
  const isDateFormatDirty =
    (dateFormat || "") !== (initialValues.dateFormat || "") ||
    useRelativeDateTime !== initialValues.useRelativeDateTime;

  const isResettingSupportedLocales = savingKey === "reset:supportedLocales";
  const isResettingDefaultLocale = savingKey === "reset:defaultLocale";
  const isResettingFallbackLocale = savingKey === "reset:fallbackLocale";
  const isResettingTimezone = savingKey === "reset:timezone";
  const isResettingDateFormat = savingKey === "reset:dateFormat";

  const resetSupportedLocales = () =>
    withSavingKey("reset:supportedLocales", async () => {
      form.setValue("supportedLocales", initialValues.supportedLocales, { shouldDirty: false });
      await patch({ site_localization: { supported_locales: initialValues.supportedLocales } });
    });

  const resetDefaultLocale = () =>
    withSavingKey("reset:defaultLocale", async () => {
      form.setValue("defaultLocale", initialValues.defaultLocale, { shouldDirty: false });
      await patch({
        site_localization: {
          default_locale: initialValues.defaultLocale,
          locale: initialValues.defaultLocale,
        },
      });
    });

  const resetFallbackLocale = () =>
    withSavingKey("reset:fallbackLocale", async () => {
      form.setValue("fallbackLocale", initialValues.fallbackLocale, { shouldDirty: false });
      await patch({ site_localization: { fallback_locale: initialValues.fallbackLocale } });
    });

  const resetTimezone = () =>
    withSavingKey("reset:timezone", async () => {
      form.setValue("timezone", initialValues.timezone, { shouldDirty: false });
      form.setValue("useBrowserTimeZone", initialValues.useBrowserTimeZone, { shouldDirty: false });
      form.clearErrors("timezone");
      await patch({
        site_localization: {
          timezone: initialValues.timezone,
          use_browser_timezone: initialValues.useBrowserTimeZone,
        },
      });
    });

  const resetDateFormat = () =>
    withSavingKey("reset:dateFormat", async () => {
      form.setValue("dateFormat", initialValues.dateFormat, { shouldDirty: false });
      form.setValue("useRelativeDateTime", initialValues.useRelativeDateTime, {
        shouldDirty: false,
      });
      form.clearErrors("dateFormat");
      await patch({
        site_localization: {
          date_format: initialValues.dateFormat,
          use_relative_datetime: initialValues.useRelativeDateTime,
        },
      });
    });

  const saveSupportedLocales = () =>
    withSavingKey("supportedLocales", async () => {
      const values = await validateFormFields(form, ["supportedLocales"]);
      const normalized = uniqLocales(values.supportedLocales ?? []);
      const merged = uniqLocales([defaultLocale, fallbackLocale, ...normalized]);
      form.setValue("supportedLocales", merged, { shouldDirty: true, shouldValidate: true });
      await patch({ site_localization: { supported_locales: merged } });
    });

  const saveDefaultLocale = () =>
    withSavingKey("defaultLocale", async () => {
      const values = await validateFormFields(form, ["defaultLocale"]);
      const normalized = normalizeLocaleTag(values.defaultLocale) ?? initialValues.defaultLocale;
      form.setValue("defaultLocale", normalized, { shouldDirty: true, shouldValidate: true });
      await patch({ site_localization: { default_locale: normalized, locale: normalized } });
    });

  const saveFallbackLocale = () =>
    withSavingKey("fallbackLocale", async () => {
      const values = await validateFormFields(form, ["fallbackLocale"]);
      const normalized = normalizeLocaleTag(values.fallbackLocale) ?? initialValues.fallbackLocale;
      form.setValue("fallbackLocale", normalized, { shouldDirty: true, shouldValidate: true });
      await patch({ site_localization: { fallback_locale: normalized } });
    });

  const saveTimezone = () =>
    withSavingKey("timezone", async () => {
      const nextTimezone = String(form.getValues("timezone") || "").trim();
      if (!nextTimezone) {
        form.setError("timezone", {
          type: "validate",
          message: t("setup:SETUP_VALIDATION_TIMEZONE_REQUIRED"),
        });
        throw new Error("FORM_VALIDATION_FAILED");
      }
      form.clearErrors("timezone");
      await patch({
        site_localization: {
          timezone: nextTimezone,
          use_browser_timezone: useBrowserTimeZone,
        },
      });
    });

  const saveDateFormat = () =>
    withSavingKey("dateFormat", async () => {
      const nextDateFormat = String(form.getValues("dateFormat") || "").trim();
      if (!nextDateFormat) {
        form.setError("dateFormat", {
          type: "validate",
          message: t("setup:SETUP_VALIDATION_DATE_FORMAT_REQUIRED"),
        });
        throw new Error("FORM_VALIDATION_FAILED");
      }
      form.clearErrors("dateFormat");
      await patch({
        site_localization: {
          date_format: nextDateFormat,
          use_relative_datetime: useRelativeDateTime,
        },
      });
    });

  const supportedLocalesError = getFieldErrorMessage(form, "supportedLocales");
  const defaultLocaleError = getFieldErrorMessage(form, "defaultLocale");
  const fallbackLocaleError = getFieldErrorMessage(form, "fallbackLocale");
  const timezoneError = getFieldErrorMessage(form, "timezone");
  const dateFormatError = getFieldErrorMessage(form, "dateFormat");

  return (
    <SettingPanel
      title={t("settings:SETTINGS_SITE_LOCALIZATION_PANEL_TITLE")}
      description={t("settings:SETTINGS_SITE_LOCALIZATION_PANEL_DESC")}
      bordered={false}
    >
      <SettingActionGroup>
        <Accordion type="single" collapsible className="px-0">
          <SettingAccordionItem
            value="supportedLocales"
            variant="action"
            title={t("settings:SITE_LOCALIZATION_SUPPORTED_LOCALES_LABEL")}
            description={t("settings:SITE_LOCALIZATION_SUPPORTED_LOCALES_DESC")}
            showSummary
            summary={(supportedLocales || []).join(", ") || "-"}
            placeholder={t("settings:SETTINGS_NOT_SET")}
            keepRendered
            contentLayout="inline"
            confirmText={t("settings:SETTINGS_SAVE")}
            onConfirm={saveSupportedLocales}
            confirmLoading={savingKey === "supportedLocales"}
            onReset={
              isSupportedLocalesDirty || isResettingSupportedLocales
                ? resetSupportedLocales
                : undefined
            }
            resetText={t("settings:SETTINGS_RESET")}
            resetLoading={isResettingSupportedLocales}
            disabled={disabled}
          >
            <Controller
              control={form.control}
              name="supportedLocales"
              rules={{
                validate: (value) => {
                  if (!Array.isArray(value) || value.length === 0) {
                    return t("setup:SETUP_VALIDATION_LOCALE_REQUIRED");
                  }
                  const invalid = value
                    .map((item) => (typeof item === "string" ? item.trim() : ""))
                    .filter(Boolean)
                    .find((item) => normalizeLocaleTag(item) === null);
                  if (!invalid) return true;
                  return t("settings:SITE_LOCALIZATION_INVALID_LOCALE_TAG", { tag: invalid });
                },
              }}
              render={({ field }) => (
                <div className="space-y-2">
                  <StringTagsField
                    value={field.value ?? []}
                    onChange={(next) => field.onChange(uniqLocales(next))}
                    placeholder="e.g. zh-CN, en-US, fr-FR"
                    disabled={disabled}
                    normalizeValue={(item) => String(item || "").trim()}
                  />
                  {supportedLocalesError ? (
                    <div className="text-footnote text-destructive">{supportedLocalesError}</div>
                  ) : null}
                </div>
              )}
            />
          </SettingAccordionItem>

          <SettingAccordionItem
            value="defaultLocale"
            variant="action"
            title={t("settings:SITE_LOCALIZATION_DEFAULT_LOCALE_LABEL")}
            description={t("settings:SITE_LOCALIZATION_DEFAULT_LOCALE_DESC")}
            showSummary
            summary={localeLabel}
            placeholder={t("settings:SETTINGS_NOT_SET")}
            keepRendered
            contentLayout="inline"
            confirmText={t("settings:SETTINGS_SAVE")}
            onConfirm={saveDefaultLocale}
            confirmLoading={savingKey === "defaultLocale"}
            onReset={
              isDefaultLocaleDirty || isResettingDefaultLocale ? resetDefaultLocale : undefined
            }
            resetText={t("settings:SETTINGS_RESET")}
            resetLoading={isResettingDefaultLocale}
            disabled={disabled}
          >
            <Controller
              control={form.control}
              name="defaultLocale"
              rules={{ required: t("setup:SETUP_VALIDATION_LOCALE_REQUIRED") }}
              render={({ field }) => (
                <div className="space-y-2">
                  <Select
                    value={field.value || undefined}
                    onValueChange={field.onChange}
                    disabled={disabled}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t("common:SELECT")} />
                    </SelectTrigger>
                    <SelectContent position="popper" align="start">
                      {localeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {defaultLocaleError ? (
                    <div className="text-footnote text-destructive">{defaultLocaleError}</div>
                  ) : null}
                </div>
              )}
            />
          </SettingAccordionItem>

          <SettingAccordionItem
            value="fallbackLocale"
            variant="action"
            title={t("settings:SITE_LOCALIZATION_FALLBACK_LOCALE_LABEL")}
            description={t("settings:SITE_LOCALIZATION_FALLBACK_LOCALE_DESC")}
            showSummary
            summary={fallbackLocaleLabel}
            placeholder={t("settings:SETTINGS_NOT_SET")}
            keepRendered
            contentLayout="inline"
            confirmText={t("settings:SETTINGS_SAVE")}
            onConfirm={saveFallbackLocale}
            confirmLoading={savingKey === "fallbackLocale"}
            onReset={
              isFallbackLocaleDirty || isResettingFallbackLocale ? resetFallbackLocale : undefined
            }
            resetText={t("settings:SETTINGS_RESET")}
            resetLoading={isResettingFallbackLocale}
            disabled={disabled}
          >
            <Controller
              control={form.control}
              name="fallbackLocale"
              rules={{ required: t("setup:SETUP_VALIDATION_LOCALE_REQUIRED") }}
              render={({ field }) => (
                <div className="space-y-2">
                  <Select
                    value={field.value || undefined}
                    onValueChange={field.onChange}
                    disabled={disabled}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t("common:SELECT")} />
                    </SelectTrigger>
                    <SelectContent position="popper" align="start">
                      {localeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fallbackLocaleError ? (
                    <div className="text-footnote text-destructive">{fallbackLocaleError}</div>
                  ) : null}
                </div>
              )}
            />
          </SettingAccordionItem>

          <SettingAccordionItem
            value="timezone"
            variant="action"
            title={t("setup:SETUP_FIELD_TIMEZONE_TITLE")}
            description={t("settings:SETTINGS_SITE_TIMEZONE_DESC")}
            showSummary
            summary={timezoneLabel}
            placeholder={t("settings:SETTINGS_NOT_SET")}
            keepRendered
            confirmText={t("settings:SETTINGS_SAVE")}
            onConfirm={saveTimezone}
            confirmLoading={savingKey === "timezone"}
            onReset={isTimezoneDirty || isResettingTimezone ? resetTimezone : undefined}
            resetText={t("settings:SETTINGS_RESET")}
            resetLoading={isResettingTimezone}
            disabled={disabled}
          >
            <div className="space-y-2">
              <TimezoneLocalizationControl
                selectValue={String(timezone || "")}
                switchChecked={useBrowserTimeZone}
                switchLabel={t("settings:SETTINGS_LOCALIZATION_AUTO_TIMEZONE_SWITCH_TITLE")}
                switchDescription={t("settings:SETTINGS_LOCALIZATION_AUTO_TIMEZONE_SWITCH_DESC")}
                options={timezoneOptions}
                onSelectChange={(value) => {
                  form.setValue("timezone", value, { shouldDirty: true });
                  form.clearErrors("timezone");
                }}
                onSwitchChange={(checked) => {
                  form.setValue("useBrowserTimeZone", checked, { shouldDirty: true });
                }}
              />
              {timezoneError ? (
                <div className="text-footnote text-destructive">{timezoneError}</div>
              ) : null}
            </div>
          </SettingAccordionItem>

          <SettingAccordionItem
            value="dateFormat"
            variant="action"
            title={t("setup:SETUP_FIELD_DATE_FORMAT_TITLE")}
            description={t("settings:SETTINGS_SITE_DATE_FORMAT_DESC")}
            showSummary
            summary={dateFormatLabel}
            placeholder={t("settings:SETTINGS_NOT_SET")}
            keepRendered
            confirmText={t("settings:SETTINGS_SAVE")}
            onConfirm={saveDateFormat}
            confirmLoading={savingKey === "dateFormat"}
            onReset={isDateFormatDirty || isResettingDateFormat ? resetDateFormat : undefined}
            resetText={t("settings:SETTINGS_RESET")}
            resetLoading={isResettingDateFormat}
            disabled={disabled}
          >
            <div className="space-y-2">
              <DateTimeFormatLocalizationControl
                selectValue={String(dateFormat || "")}
                switchChecked={useRelativeDateTime}
                switchLabel={t("settings:SETTINGS_LOCALIZATION_RELATIVE_DATETIME_SWITCH_TITLE")}
                switchDescription={t(
                  "settings:SETTINGS_LOCALIZATION_RELATIVE_DATETIME_SWITCH_DESC",
                )}
                options={dateFormatOptions}
                onSelectChange={(value) => {
                  form.setValue("dateFormat", value, { shouldDirty: true });
                  form.clearErrors("dateFormat");
                }}
                onSwitchChange={(checked) => {
                  form.setValue("useRelativeDateTime", checked, { shouldDirty: true });
                }}
              />
              {dateFormatError ? (
                <div className="text-footnote text-destructive">{dateFormatError}</div>
              ) : null}
            </div>
          </SettingAccordionItem>
        </Accordion>
      </SettingActionGroup>
    </SettingPanel>
  );
}

function normalizeLocaleTag(input: unknown): string | null {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return null;
  const looksLikeLocale = /^[A-Za-z]{2,3}(?:[_-][A-Za-z0-9]{2,8})*$/.test(raw);
  if (!looksLikeLocale) return null;

  const parts = raw.replaceAll("_", "-").split("-").filter(Boolean);
  if (!parts.length) return null;
  parts[0] = parts[0].toLowerCase();
  if (parts.length >= 2 && parts[1].length === 2) {
    parts[1] = parts[1].toUpperCase();
  }
  return parts.join("-");
}

function uniqLocales(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = normalizeLocaleTag(value);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}
