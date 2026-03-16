import { Controller } from "react-hook-form";

import { Accordion } from "@arclayer/ui/accordion";
import { Input } from "@arclayer/ui/input";
import { NativeSelect, NativeSelectOption } from "@arclayer/ui/native-select";
import { SettingAccordionItem } from "@arclayer/ui/setting-accordion-item";
import { SettingPanel } from "@arclayer/ui/setting-panel";
import {
  DateTimeFormatLocalizationControl,
  TimezoneLocalizationControl,
} from "@/components/settings/date-time-localization-controls";
import { getFieldErrorMessage, validateFormFields } from "@/lib/forms/rhf-form-helpers";
import { normalizeLocale } from "@/lib/i18n";

import type { OrganizationSettingsBasicsController } from "../hooks/use-organization-settings-basics-controller";
import { OrganizationSettingsLogoAccordionItem } from "./organization-settings-logo-accordion-item";

function FieldMessage({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="text-footnote text-destructive">{message}</div>;
}

export function OrganizationSettingsBasicsCorePanels(props: {
  controller: OrganizationSettingsBasicsController;
}) {
  const c = props.controller;
  const { t } = c;
  const nameField = c.form.register("name", {
    required: t("settings:SETTINGS_ORG_NAME_REQUIRED"),
    maxLength: { value: 128, message: t("settings:SETTINGS_ORG_NAME_TOO_LONG") },
  });

  return (
    <>
      <SettingPanel
        title={t("settings:SETTINGS_ORG_BASICS_PANEL_TITLE")}
        description={t("settings:SETTINGS_ORG_BASICS_PANEL_DESC")}
      >
        <div className="rounded-lg border border-border">
          <Accordion type="single" collapsible className="px-0">
            <SettingAccordionItem
              value="organization_name"
              variant="action"
              title={t("settings:SETTINGS_ORG_NAME_LABEL")}
              description={t("settings:SETTINGS_ORG_NAME_ITEM_DESC")}
              showSummary
              summary={c.currentOrgName}
              placeholder={t("settings:SETTINGS_NOT_SET")}
              keepRendered
              disabled={c.disabled || !c.myOrgQuery.data}
              confirmText={t("settings:SETTINGS_SAVE")}
              confirmLoading={c.savingKey === "organization:name"}
              onConfirm={() =>
                void c.withSavingKey("organization:name", async () => {
                  const values = await validateFormFields(c.form, ["name"]);
                  await c.patchCoreMutation.mutateAsync({
                    organizationName: String(values.name || "").trim(),
                  });
                })
              }
              onReset={
                c.isOrgNameDirty
                  ? () =>
                      void c.withSavingKey("reset:organization:name", async () => {
                        c.form.setValue("name", c.initialOrgName, { shouldDirty: false });
                        c.form.clearErrors("name");
                        await c.patchCoreMutation.mutateAsync({
                          organizationName: String(c.initialOrgName || "").trim(),
                        });
                      })
                  : undefined
              }
              resetText={t("settings:SETTINGS_RESET")}
              resetLoading={c.savingKey === "reset:organization:name"}
            >
              <div className="space-y-2">
                <Input {...nameField} placeholder={t("settings:SETTINGS_ORG_NAME_PLACEHOLDER")} />
                <FieldMessage message={getFieldErrorMessage(c.form, "name")} />
              </div>
            </SettingAccordionItem>
            <OrganizationSettingsLogoAccordionItem controller={c} />
          </Accordion>
        </div>
      </SettingPanel>

      <SettingPanel
        title={t("settings:SETTINGS_ORG_LOCALIZATION_PANEL_TITLE")}
        description={t("settings:SETTINGS_ORG_LOCALIZATION_PANEL_DESC")}
      >
        <div className="rounded-lg border border-border">
          <Accordion type="single" collapsible className="px-0">
            <SettingAccordionItem
              value="organization_locale"
              variant="action"
              title={t("setup:SETUP_FIELD_LANGUAGE_TITLE")}
              description={t("settings:SETTINGS_ORG_LANGUAGE_DESC")}
              showSummary
              summary={c.orgLocaleLabel}
              placeholder={t("settings:SETTINGS_NOT_SET")}
              keepRendered
              disabled={c.disabled || !c.coreQuery.data}
              confirmText={t("settings:SETTINGS_SAVE")}
              confirmLoading={c.savingKey === "organization:locale"}
              onConfirm={() =>
                void c.withSavingKey("organization:locale", async () => {
                  const values = await validateFormFields(c.form, ["locale"]);
                  const nextLocale = normalizeLocale(values.locale);
                  await c.patchCoreMutation.mutateAsync({
                    organizationLocalization: { locale: nextLocale },
                  });
                  if (c.localePreferenceMode === "workspace") {
                    c.setEffectiveLocale(nextLocale);
                  }
                })
              }
              onReset={
                c.isOrgLocaleDirty
                  ? () =>
                      void c.withSavingKey("reset:organization:locale", async () => {
                        c.form.setValue("locale", c.initialOrgLocale, { shouldDirty: false });
                        c.form.clearErrors("locale");
                        await c.patchCoreMutation.mutateAsync({
                          organizationLocalization: { locale: c.initialOrgLocale },
                        });
                        if (c.localePreferenceMode === "workspace") {
                          c.setEffectiveLocale(c.initialOrgLocale);
                        }
                      })
                  : undefined
              }
              resetText={t("settings:SETTINGS_RESET")}
              resetLoading={c.savingKey === "reset:organization:locale"}
            >
              <div className="space-y-2">
                <Controller
                  control={c.form.control}
                  name="locale"
                  rules={{ required: t("setup:SETUP_VALIDATION_LOCALE_REQUIRED") }}
                  render={({ field }) => (
                    <NativeSelect
                      value={field.value || ""}
                      onChange={(event) => field.onChange(event.target.value)}
                      className="w-full"
                      aria-invalid={getFieldErrorMessage(c.form, "locale") ? true : undefined}
                    >
                      <NativeSelectOption value="">{t("common:SELECT")}</NativeSelectOption>
                      {c.localeOptions.map((option) => (
                        <NativeSelectOption key={option.value} value={option.value}>
                          {option.label}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  )}
                />
                <FieldMessage message={getFieldErrorMessage(c.form, "locale")} />
              </div>
            </SettingAccordionItem>

            <SettingAccordionItem
              value="organization_timezone"
              variant="action"
              title={t("setup:SETUP_FIELD_TIMEZONE_TITLE")}
              description={t("settings:SETTINGS_ORG_TIMEZONE_DESC")}
              showSummary
              summary={c.orgTimezoneLabel}
              placeholder={t("settings:SETTINGS_NOT_SET")}
              keepRendered
              disabled={c.disabled || !c.coreQuery.data}
              confirmText={t("settings:SETTINGS_SAVE")}
              confirmLoading={c.savingKey === "organization:timezone"}
              onConfirm={() =>
                void c.withSavingKey("organization:timezone", async () => {
                  await c.patchCoreMutation.mutateAsync({
                    organizationLocalization: {
                      timezone: String(c.orgTimezone),
                      useBrowserTimeZone: c.orgUseBrowserTimeZone,
                    },
                  });
                })
              }
              onReset={
                c.isOrgTimezoneDirty
                  ? () =>
                      void c.withSavingKey("reset:organization:timezone", async () => {
                        c.form.setValue("timezone", c.initialOrgTimezone, { shouldDirty: false });
                        c.form.setValue("useBrowserTimeZone", c.initialOrgUseBrowserTimeZone, {
                          shouldDirty: false,
                        });
                        await c.patchCoreMutation.mutateAsync({
                          organizationLocalization: {
                            timezone: c.initialOrgTimezone,
                            useBrowserTimeZone: c.initialOrgUseBrowserTimeZone,
                          },
                        });
                      })
                  : undefined
              }
              resetText={t("settings:SETTINGS_RESET")}
              resetLoading={c.savingKey === "reset:organization:timezone"}
            >
              <TimezoneLocalizationControl
                selectValue={String(c.orgTimezone)}
                switchChecked={c.orgUseBrowserTimeZone}
                switchLabel={t("settings:SETTINGS_LOCALIZATION_AUTO_TIMEZONE_SWITCH_TITLE")}
                switchDescription={t("settings:SETTINGS_LOCALIZATION_AUTO_TIMEZONE_SWITCH_DESC")}
                options={c.timezoneOptions}
                onSelectChange={(value) =>
                  c.form.setValue("timezone", value, { shouldDirty: true, shouldTouch: true })
                }
                onSwitchChange={(checked) => {
                  c.form.setValue("useBrowserTimeZone", checked, {
                    shouldDirty: true,
                    shouldTouch: true,
                  });
                }}
              />
            </SettingAccordionItem>

            <SettingAccordionItem
              value="organization_date_format"
              variant="action"
              title={t("setup:SETUP_FIELD_DATE_FORMAT_TITLE")}
              description={t("settings:SETTINGS_ORG_DATE_FORMAT_DESC")}
              showSummary
              summary={c.orgDateFormatLabel}
              placeholder={t("settings:SETTINGS_NOT_SET")}
              keepRendered
              disabled={c.disabled || !c.coreQuery.data}
              confirmText={t("settings:SETTINGS_SAVE")}
              confirmLoading={c.savingKey === "organization:dateFormat"}
              onConfirm={() =>
                void c.withSavingKey("organization:dateFormat", async () => {
                  await c.patchCoreMutation.mutateAsync({
                    organizationLocalization: {
                      dateFormat: String(c.orgDateFormat),
                      useRelativeDateTime: c.orgUseRelativeDateTime,
                    },
                  });
                })
              }
              onReset={
                c.isOrgDateFormatDirty
                  ? () =>
                      void c.withSavingKey("reset:organization:dateFormat", async () => {
                        c.form.setValue("dateFormat", c.initialOrgDateFormat, {
                          shouldDirty: false,
                        });
                        c.form.setValue("useRelativeDateTime", c.initialOrgUseRelativeDateTime, {
                          shouldDirty: false,
                        });
                        await c.patchCoreMutation.mutateAsync({
                          organizationLocalization: {
                            dateFormat: c.initialOrgDateFormat,
                            useRelativeDateTime: c.initialOrgUseRelativeDateTime,
                          },
                        });
                      })
                  : undefined
              }
              resetText={t("settings:SETTINGS_RESET")}
              resetLoading={c.savingKey === "reset:organization:dateFormat"}
            >
              <DateTimeFormatLocalizationControl
                selectValue={String(c.orgDateFormat)}
                switchChecked={c.orgUseRelativeDateTime}
                switchLabel={t("settings:SETTINGS_LOCALIZATION_RELATIVE_DATETIME_SWITCH_TITLE")}
                switchDescription={t(
                  "settings:SETTINGS_LOCALIZATION_RELATIVE_DATETIME_SWITCH_DESC",
                )}
                options={c.dateFormatOptions}
                onSelectChange={(value) =>
                  c.form.setValue("dateFormat", value, { shouldDirty: true, shouldTouch: true })
                }
                onSwitchChange={(checked) =>
                  c.form.setValue("useRelativeDateTime", checked, {
                    shouldDirty: true,
                    shouldTouch: true,
                  })
                }
              />
            </SettingAccordionItem>
          </Accordion>
        </div>
      </SettingPanel>
    </>
  );
}
