import { Form, Input, Select } from "antd";

import { Accordion } from "@celestial/ui/accordion";
import { SettingAccordionItem } from "@celestial/ui/setting-accordion-item";
import { SettingPanel } from "@celestial/ui/setting-panel";
import {
  DateTimeFormatLocalizationControl,
  TimezoneLocalizationControl,
} from "@/components/settings/date-time-localization-controls";
import { normalizeLocale } from "@/lib/i18n";

import type { OrganizationSettingsBasicsController } from "../hooks/use-organization-settings-basics-controller";
import { OrganizationSettingsLogoAccordionItem } from "./organization-settings-logo-accordion-item";

export function OrganizationSettingsBasicsCorePanels(props: {
  controller: OrganizationSettingsBasicsController;
}) {
  const c = props.controller;
  const { t } = c;

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
                  const values = await c.form.validateFields(["name"]);
                  await c.patchCoreMutation.mutateAsync({
                    organizationName: String(values.name || "").trim(),
                  });
                })
              }
              onReset={
                c.isOrgNameDirty
                  ? () =>
                      void c.withSavingKey("reset:organization:name", async () => {
                        c.form.setFieldValue("name", c.initialOrgName);
                        await c.patchCoreMutation.mutateAsync({
                          organizationName: String(c.initialOrgName || "").trim(),
                        });
                      })
                  : undefined
              }
              resetText={t("settings:SETTINGS_RESET")}
              resetLoading={c.savingKey === "reset:organization:name"}
            >
              <Form.Item
                name="name"
                rules={[
                  {
                    required: true,
                    message: t("settings:SETTINGS_ORG_NAME_REQUIRED"),
                  },
                  { max: 128, message: t("settings:SETTINGS_ORG_NAME_TOO_LONG") },
                ]}
                style={{ marginBottom: 0 }}
              >
                <Input size="large" placeholder={t("settings:SETTINGS_ORG_NAME_PLACEHOLDER")} />
              </Form.Item>
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
                  const values = await c.form.validateFields(["locale"]);
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
                        c.form.setFieldValue("locale", c.initialOrgLocale);
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
              <Form.Item
                name="locale"
                rules={[
                  {
                    required: true,
                    message: t("setup:SETUP_VALIDATION_LOCALE_REQUIRED"),
                  },
                ]}
                style={{ marginBottom: 0 }}
              >
                <Select size="large" options={c.localeOptions} />
              </Form.Item>
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
                        c.form.setFieldsValue({
                          timezone: c.initialOrgTimezone,
                          useBrowserTimeZone: c.initialOrgUseBrowserTimeZone,
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
              <Form.Item name="useBrowserTimeZone" hidden>
                <input type="hidden" />
              </Form.Item>
              <TimezoneLocalizationControl
                selectValue={String(c.orgTimezone)}
                switchChecked={c.orgUseBrowserTimeZone}
                switchLabel={t("settings:SETTINGS_LOCALIZATION_AUTO_TIMEZONE_SWITCH_TITLE")}
                switchDescription={t("settings:SETTINGS_LOCALIZATION_AUTO_TIMEZONE_SWITCH_DESC")}
                options={c.timezoneOptions}
                onSelectChange={(value) => c.form.setFieldValue("timezone", value)}
                onSwitchChange={(checked) => {
                  c.form.setFieldsValue({
                    useBrowserTimeZone: checked,
                    timezone: checked ? c.orgTimezone : c.orgTimezone,
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
                        c.form.setFieldsValue({
                          dateFormat: c.initialOrgDateFormat,
                          useRelativeDateTime: c.initialOrgUseRelativeDateTime,
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
              <Form.Item name="useRelativeDateTime" hidden>
                <input type="hidden" />
              </Form.Item>
              <DateTimeFormatLocalizationControl
                selectValue={String(c.orgDateFormat)}
                switchChecked={c.orgUseRelativeDateTime}
                switchLabel={t("settings:SETTINGS_LOCALIZATION_RELATIVE_DATETIME_SWITCH_TITLE")}
                switchDescription={t(
                  "settings:SETTINGS_LOCALIZATION_RELATIVE_DATETIME_SWITCH_DESC",
                )}
                options={c.dateFormatOptions}
                onSelectChange={(value) => c.form.setFieldValue("dateFormat", value)}
                onSwitchChange={(checked) => c.form.setFieldValue("useRelativeDateTime", checked)}
              />
            </SettingAccordionItem>
          </Accordion>
        </div>
      </SettingPanel>
    </>
  );
}
