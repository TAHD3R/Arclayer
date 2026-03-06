import { Form, Input, Select } from "antd";

import { Accordion } from "@celestial/ui/accordion";
import { SettingAccordionItem } from "@celestial/ui/setting-accordion-item";
import { SettingPanel } from "@celestial/ui/setting-panel";
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
                  const values = await c.form.validateFields(["timezone"]);
                  await c.patchCoreMutation.mutateAsync({
                    organizationLocalization: { timezone: String(values.timezone) },
                  });
                })
              }
              onReset={
                c.isOrgTimezoneDirty
                  ? () =>
                      void c.withSavingKey("reset:organization:timezone", async () => {
                        c.form.setFieldValue("timezone", c.initialOrgTimezone);
                        await c.patchCoreMutation.mutateAsync({
                          organizationLocalization: { timezone: c.initialOrgTimezone },
                        });
                      })
                  : undefined
              }
              resetText={t("settings:SETTINGS_RESET")}
              resetLoading={c.savingKey === "reset:organization:timezone"}
            >
              <Form.Item
                name="timezone"
                rules={[
                  {
                    required: true,
                    message: t("setup:SETUP_VALIDATION_TIMEZONE_REQUIRED"),
                  },
                ]}
                style={{ marginBottom: 0 }}
              >
                <Select
                  size="large"
                  options={c.timezoneOptions}
                  showSearch
                  optionFilterProp="label"
                />
              </Form.Item>
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
                  const values = await c.form.validateFields(["dateFormat"]);
                  await c.patchCoreMutation.mutateAsync({
                    organizationLocalization: { dateFormat: String(values.dateFormat) },
                  });
                })
              }
              onReset={
                c.isOrgDateFormatDirty
                  ? () =>
                      void c.withSavingKey("reset:organization:dateFormat", async () => {
                        c.form.setFieldValue("dateFormat", c.initialOrgDateFormat);
                        await c.patchCoreMutation.mutateAsync({
                          organizationLocalization: {
                            dateFormat: c.initialOrgDateFormat,
                          },
                        });
                      })
                  : undefined
              }
              resetText={t("settings:SETTINGS_RESET")}
              resetLoading={c.savingKey === "reset:organization:dateFormat"}
            >
              <Form.Item
                name="dateFormat"
                rules={[
                  {
                    required: true,
                    message: t("setup:SETUP_VALIDATION_DATE_FORMAT_REQUIRED"),
                  },
                ]}
                style={{ marginBottom: 0 }}
              >
                <Select size="large" options={c.dateFormatOptions} />
              </Form.Item>
            </SettingAccordionItem>
          </Accordion>
        </div>
      </SettingPanel>
    </>
  );
}
