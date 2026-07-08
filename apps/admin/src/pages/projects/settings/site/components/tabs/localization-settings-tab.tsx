import { useMemo, useState, type ReactNode } from "react";
import { Controller, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@arclayer/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { StringTagsField } from "@arclayer/ui/string-tags-field";

import {
  DateTimeFormatLocalizationControl,
  TimezoneLocalizationControl,
} from "@/components/settings/date-time-localization-controls";
import { getLocaleMetadata } from "@/lib/i18n";
import {
  resolveLocalizationDateFormatSummary,
  resolveLocalizationTimeZoneSummary,
} from "@/lib/settings/general/datetime-localization";
import {
  buildDateFormatOptions,
  buildTimezoneOptions,
} from "@/lib/settings/general/localization-options";
import {
  SystemSettingItem,
  SystemSettingRow,
  SystemSettingStack,
} from "@/pages/system/components/system-setting-item";
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

function FieldMessage(props: { message: string | null }) {
  if (!props.message) return null;
  return <FieldError>{props.message}</FieldError>;
}

function SettingEditRow(props: {
  title: ReactNode;
  description?: ReactNode;
  summary: ReactNode;
  disabled?: boolean;
  onEdit: () => void;
}) {
  const { t } = useTranslation(["settings"]);
  return (
    <SystemSettingRow
      title={props.title}
      description={props.description}
      control={
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={props.disabled}
          onClick={props.onEdit}
        >
          {t("settings:SETTINGS_EDIT")}
        </Button>
      }
    >
      <div className="break-words text-callout text-label-secondary">{props.summary}</div>
    </SystemSettingRow>
  );
}

function SaveDialog(props: {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  pending?: boolean;
  resetPending?: boolean;
  showReset?: boolean;
  children: ReactNode;
  onOpenChange: (open: boolean) => void;
  onReset?: () => void;
  onSave: () => void;
}) {
  const { t } = useTranslation(["settings"]);
  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={props.title}
      description={props.description}
      footer={
        <>
          {props.showReset && props.onReset ? (
            <Button
              type="button"
              variant="outline"
              loading={props.resetPending}
              disabled={props.disabled || props.pending || props.resetPending}
              onClick={props.onReset}
            >
              {t("settings:SETTINGS_RESET")}
            </Button>
          ) : null}
          <Button
            type="button"
            loading={props.pending}
            disabled={props.disabled || props.pending || props.resetPending}
            onClick={props.onSave}
          >
            {t("settings:SETTINGS_SAVE")}
          </Button>
        </>
      }
    >
      {props.children}
    </SettingDialog>
  );
}

export function LocalizationSettingsTab({
  form,
  initialValues,
  disabled,
  savingKey,
  withSavingKey,
  patch,
}: LocalizationSettingsTabProps) {
  const { t } = useTranslation(["settings", "setup", "common"]);
  const [dialog, setDialog] = useState<string | null>(null);

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
  const dateFormatOptions = buildDateFormatOptions(t);

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
    translate: t,
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

  const supportedLocalesError = getFieldErrorMessage(form, "supportedLocales");
  const defaultLocaleError = getFieldErrorMessage(form, "defaultLocale");
  const fallbackLocaleError = getFieldErrorMessage(form, "fallbackLocale");
  const timezoneError = getFieldErrorMessage(form, "timezone");
  const dateFormatError = getFieldErrorMessage(form, "dateFormat");

  const closeDialog = () => setDialog(null);

  const resetSupportedLocales = () =>
    withSavingKey("reset:supportedLocales", async () => {
      form.setValue("supportedLocales", initialValues.supportedLocales, { shouldDirty: false });
      await patch({ site_localization: { supported_locales: initialValues.supportedLocales } });
      closeDialog();
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
      closeDialog();
    });

  const resetFallbackLocale = () =>
    withSavingKey("reset:fallbackLocale", async () => {
      form.setValue("fallbackLocale", initialValues.fallbackLocale, { shouldDirty: false });
      await patch({ site_localization: { fallback_locale: initialValues.fallbackLocale } });
      closeDialog();
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
      closeDialog();
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
      closeDialog();
    });

  const saveSupportedLocales = () =>
    withSavingKey("supportedLocales", async () => {
      const values = await validateFormFields(form, ["supportedLocales"]);
      const normalized = uniqLocales(values.supportedLocales ?? []);
      const merged = uniqLocales([defaultLocale, fallbackLocale, ...normalized]);
      form.setValue("supportedLocales", merged, { shouldDirty: true, shouldValidate: true });
      await patch({ site_localization: { supported_locales: merged } });
      closeDialog();
    });

  const saveDefaultLocale = () =>
    withSavingKey("defaultLocale", async () => {
      const values = await validateFormFields(form, ["defaultLocale"]);
      const normalized = normalizeLocaleTag(values.defaultLocale) ?? initialValues.defaultLocale;
      form.setValue("defaultLocale", normalized, { shouldDirty: true, shouldValidate: true });
      await patch({ site_localization: { default_locale: normalized, locale: normalized } });
      closeDialog();
    });

  const saveFallbackLocale = () =>
    withSavingKey("fallbackLocale", async () => {
      const values = await validateFormFields(form, ["fallbackLocale"]);
      const normalized = normalizeLocaleTag(values.fallbackLocale) ?? initialValues.fallbackLocale;
      form.setValue("fallbackLocale", normalized, { shouldDirty: true, shouldValidate: true });
      await patch({ site_localization: { fallback_locale: normalized } });
      closeDialog();
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
      closeDialog();
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
      closeDialog();
    });

  return (
    <>
      <SystemSettingStack>
        <SystemSettingItem
          id="website-localization"
          title={t("settings:SETTINGS_SITE_LOCALIZATION_PANEL_TITLE")}
          description={t("settings:SETTINGS_SITE_LOCALIZATION_PANEL_DESC")}
        >
          <div className="flex flex-col divide-y divide-border">
            <SettingEditRow
              title={t("settings:SITE_LOCALIZATION_SUPPORTED_LOCALES_LABEL")}
              description={t("settings:SITE_LOCALIZATION_SUPPORTED_LOCALES_DESC")}
              summary={(supportedLocales || []).join(", ") || t("settings:SETTINGS_NOT_SET")}
              disabled={disabled}
              onEdit={() => setDialog("supportedLocales")}
            />
            <SettingEditRow
              title={t("settings:SITE_LOCALIZATION_DEFAULT_LOCALE_LABEL")}
              description={t("settings:SITE_LOCALIZATION_DEFAULT_LOCALE_DESC")}
              summary={localeLabel || t("settings:SETTINGS_NOT_SET")}
              disabled={disabled}
              onEdit={() => setDialog("defaultLocale")}
            />
            <SettingEditRow
              title={t("settings:SITE_LOCALIZATION_FALLBACK_LOCALE_LABEL")}
              description={t("settings:SITE_LOCALIZATION_FALLBACK_LOCALE_DESC")}
              summary={fallbackLocaleLabel || t("settings:SETTINGS_NOT_SET")}
              disabled={disabled}
              onEdit={() => setDialog("fallbackLocale")}
            />
            <SettingEditRow
              title={t("setup:SETUP_FIELD_TIMEZONE_TITLE")}
              description={t("settings:SETTINGS_SITE_TIMEZONE_DESC")}
              summary={timezoneLabel}
              disabled={disabled}
              onEdit={() => setDialog("timezone")}
            />
            <SettingEditRow
              title={t("setup:SETUP_FIELD_DATE_FORMAT_TITLE")}
              description={t("settings:SETTINGS_SITE_DATE_FORMAT_DESC")}
              summary={dateFormatLabel}
              disabled={disabled}
              onEdit={() => setDialog("dateFormat")}
            />
          </div>
        </SystemSettingItem>
      </SystemSettingStack>

      <SaveDialog
        open={dialog === "supportedLocales"}
        onOpenChange={(open) => setDialog(open ? "supportedLocales" : null)}
        title={t("settings:SITE_LOCALIZATION_SUPPORTED_LOCALES_LABEL")}
        description={t("settings:SITE_LOCALIZATION_SUPPORTED_LOCALES_DESC")}
        disabled={disabled}
        pending={savingKey === "supportedLocales"}
        resetPending={savingKey === "reset:supportedLocales"}
        showReset={isSupportedLocalesDirty}
        onReset={() => void resetSupportedLocales()}
        onSave={() => void saveSupportedLocales()}
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
            <FieldGroup>
              <Field data-invalid={Boolean(supportedLocalesError)}>
                <FieldLabel>{t("settings:SITE_LOCALIZATION_SUPPORTED_LOCALES_LABEL")}</FieldLabel>
                <StringTagsField
                  value={field.value ?? []}
                  onChange={(next) => field.onChange(uniqLocales(next))}
                  placeholder="e.g. zh-CN, en-US, fr-FR"
                  disabled={disabled}
                  normalizeValue={(item) => String(item || "").trim()}
                />
                <FieldMessage message={supportedLocalesError} />
              </Field>
            </FieldGroup>
          )}
        />
      </SaveDialog>

      <SaveDialog
        open={dialog === "defaultLocale"}
        onOpenChange={(open) => setDialog(open ? "defaultLocale" : null)}
        title={t("settings:SITE_LOCALIZATION_DEFAULT_LOCALE_LABEL")}
        description={t("settings:SITE_LOCALIZATION_DEFAULT_LOCALE_DESC")}
        disabled={disabled}
        pending={savingKey === "defaultLocale"}
        resetPending={savingKey === "reset:defaultLocale"}
        showReset={isDefaultLocaleDirty}
        onReset={() => void resetDefaultLocale()}
        onSave={() => void saveDefaultLocale()}
      >
        <Controller
          control={form.control}
          name="defaultLocale"
          rules={{ required: t("setup:SETUP_VALIDATION_LOCALE_REQUIRED") }}
          render={({ field }) => (
            <FieldGroup>
              <Field data-invalid={Boolean(defaultLocaleError)}>
                <FieldLabel>{t("settings:SITE_LOCALIZATION_DEFAULT_LOCALE_LABEL")}</FieldLabel>
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
                <FieldMessage message={defaultLocaleError} />
              </Field>
            </FieldGroup>
          )}
        />
      </SaveDialog>

      <SaveDialog
        open={dialog === "fallbackLocale"}
        onOpenChange={(open) => setDialog(open ? "fallbackLocale" : null)}
        title={t("settings:SITE_LOCALIZATION_FALLBACK_LOCALE_LABEL")}
        description={t("settings:SITE_LOCALIZATION_FALLBACK_LOCALE_DESC")}
        disabled={disabled}
        pending={savingKey === "fallbackLocale"}
        resetPending={savingKey === "reset:fallbackLocale"}
        showReset={isFallbackLocaleDirty}
        onReset={() => void resetFallbackLocale()}
        onSave={() => void saveFallbackLocale()}
      >
        <Controller
          control={form.control}
          name="fallbackLocale"
          rules={{ required: t("setup:SETUP_VALIDATION_LOCALE_REQUIRED") }}
          render={({ field }) => (
            <FieldGroup>
              <Field data-invalid={Boolean(fallbackLocaleError)}>
                <FieldLabel>{t("settings:SITE_LOCALIZATION_FALLBACK_LOCALE_LABEL")}</FieldLabel>
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
                <FieldMessage message={fallbackLocaleError} />
              </Field>
            </FieldGroup>
          )}
        />
      </SaveDialog>

      <SaveDialog
        open={dialog === "timezone"}
        onOpenChange={(open) => setDialog(open ? "timezone" : null)}
        title={t("setup:SETUP_FIELD_TIMEZONE_TITLE")}
        description={t("settings:SETTINGS_SITE_TIMEZONE_DESC")}
        disabled={disabled}
        pending={savingKey === "timezone"}
        resetPending={savingKey === "reset:timezone"}
        showReset={isTimezoneDirty}
        onReset={() => void resetTimezone()}
        onSave={() => void saveTimezone()}
      >
        <FieldGroup>
          <Field data-invalid={Boolean(timezoneError)}>
            <FieldLabel>{t("setup:SETUP_FIELD_TIMEZONE_TITLE")}</FieldLabel>
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
            <FieldMessage message={timezoneError} />
          </Field>
        </FieldGroup>
      </SaveDialog>

      <SaveDialog
        open={dialog === "dateFormat"}
        onOpenChange={(open) => setDialog(open ? "dateFormat" : null)}
        title={t("setup:SETUP_FIELD_DATE_FORMAT_TITLE")}
        description={t("settings:SETTINGS_SITE_DATE_FORMAT_DESC")}
        disabled={disabled}
        pending={savingKey === "dateFormat"}
        resetPending={savingKey === "reset:dateFormat"}
        showReset={isDateFormatDirty}
        onReset={() => void resetDateFormat()}
        onSave={() => void saveDateFormat()}
      >
        <FieldGroup>
          <Field data-invalid={Boolean(dateFormatError)}>
            <FieldLabel>{t("setup:SETUP_FIELD_DATE_FORMAT_TITLE")}</FieldLabel>
            <DateTimeFormatLocalizationControl
              selectValue={String(dateFormat || "")}
              switchChecked={useRelativeDateTime}
              switchLabel={t("settings:SETTINGS_LOCALIZATION_RELATIVE_DATETIME_SWITCH_TITLE")}
              switchDescription={t("settings:SETTINGS_LOCALIZATION_RELATIVE_DATETIME_SWITCH_DESC")}
              options={dateFormatOptions}
              onSelectChange={(value) => {
                form.setValue("dateFormat", value, { shouldDirty: true });
                form.clearErrors("dateFormat");
              }}
              onSwitchChange={(checked) => {
                form.setValue("useRelativeDateTime", checked, { shouldDirty: true });
              }}
            />
            <FieldMessage message={dateFormatError} />
          </Field>
        </FieldGroup>
      </SaveDialog>
    </>
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
