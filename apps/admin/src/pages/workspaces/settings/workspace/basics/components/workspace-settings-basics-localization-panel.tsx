import { Form, Select } from "antd";

import { Accordion } from "@celestial/ui/accordion";
import { SettingAccordionItem } from "@celestial/ui/setting-accordion-item";
import { SettingPanel } from "@celestial/ui/setting-panel";
import {
  DateTimeFormatLocalizationControl,
  TimezoneLocalizationControl,
} from "@/components/settings/date-time-localization-controls";
import { normalizeLocale } from "@/lib/i18n";

import type { WorkspaceSettingsBasicsController } from "../hooks/use-workspace-settings-basics-controller";

export function WorkspaceSettingsBasicsLocalizationPanel(props: {
  controller: WorkspaceSettingsBasicsController;
}) {
  const c = props.controller;
  const { t } = c;

  return (
    <SettingPanel
      title={t("settings:SETTINGS_WORKSPACE_LOCALIZATION_PANEL_TITLE")}
      description={t("settings:SETTINGS_WORKSPACE_LOCALIZATION_PANEL_DESC")}
    >
      <div className="rounded-lg border border-border">
        <Accordion type="single" collapsible className="px-0">
          <SettingAccordionItem
            value="workspace_locale"
            variant="action"
            title={t("setup:SETUP_FIELD_LANGUAGE_TITLE")}
            description={t("settings:SETTINGS_WORKSPACE_LANGUAGE_DESC")}
            showSummary
            summary={c.workspaceLocaleLabel}
            placeholder={t("settings:SETTINGS_NOT_SET")}
            keepRendered
            disabled={c.disabled || !c.coreQuery.data}
            confirmText={t("settings:SETTINGS_SAVE")}
            confirmLoading={c.savingKey === "workspace:locale"}
            onConfirm={() =>
              void c.withSavingKey("workspace:locale", async () => {
                const values = await c.form.validateFields(["locale"]);
                const nextLocale = normalizeLocale(values.locale);
                await c.patchWorkspaceCoreMutation.mutateAsync({
                  workspace_localization: { locale: nextLocale },
                });
                if (c.workspaceId) {
                  await c.queryClient.invalidateQueries({
                    queryKey: ["workspace", "adminMenu", c.workspaceId],
                  });
                  c.cacheWorkspaceLocale(String(c.workspaceId), nextLocale);
                }
                if (c.localePreferenceMode === "workspace") {
                  c.setEffectiveLocale(nextLocale);
                }
              })
            }
            onReset={
              c.isWorkspaceLocaleDirty && c.coreQuery.data
                ? () =>
                    void c.withSavingKey("reset:workspace:locale", async () => {
                      c.form.setFieldValue("locale", c.initialWorkspaceLocale);
                      await c.patchWorkspaceCoreMutation.mutateAsync({
                        workspace_localization: {
                          locale: c.initialWorkspaceLocale,
                        },
                      });
                      if (c.workspaceId) {
                        await c.queryClient.invalidateQueries({
                          queryKey: ["workspace", "adminMenu", c.workspaceId],
                        });
                        c.cacheWorkspaceLocale(String(c.workspaceId), c.initialWorkspaceLocale);
                      }
                      if (c.localePreferenceMode === "workspace") {
                        c.setEffectiveLocale(c.initialWorkspaceLocale);
                      }
                    })
                : undefined
            }
            resetText={t("settings:SETTINGS_RESET")}
            resetLoading={c.savingKey === "reset:workspace:locale"}
          >
            <div className="text-label-secondary mb-4">
              {t("settings:SETTINGS_WORKSPACE_LOCALIZATION_NOTE", {
                locale: c.workspaceLocaleLabel ?? "-",
              })}
            </div>
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
            value="workspace_timezone"
            variant="action"
            title={t("setup:SETUP_FIELD_TIMEZONE_TITLE")}
            description={t("settings:SETTINGS_WORKSPACE_TIMEZONE_DESC")}
            showSummary
            summary={c.workspaceTimezoneLabel}
            placeholder={t("settings:SETTINGS_NOT_SET")}
            keepRendered
            disabled={c.disabled || !c.coreQuery.data}
            confirmText={t("settings:SETTINGS_SAVE")}
            confirmLoading={c.savingKey === "workspace:timezone"}
            onConfirm={() =>
              void c.withSavingKey("workspace:timezone", async () => {
                await c.patchWorkspaceCoreMutation.mutateAsync({
                  workspace_localization: {
                    timezone: String(c.workspaceTimezone),
                    use_browser_timezone: c.workspaceUseBrowserTimeZone,
                  },
                });
              })
            }
            onReset={
              c.isWorkspaceTimezoneDirty && c.coreQuery.data
                ? () =>
                    void c.withSavingKey("reset:workspace:timezone", async () => {
                      c.form.setFieldsValue({
                        timezone: c.initialWorkspaceTimezone,
                        useBrowserTimeZone: c.initialWorkspaceUseBrowserTimeZone,
                      });
                      await c.patchWorkspaceCoreMutation.mutateAsync({
                        workspace_localization: {
                          timezone: c.initialWorkspaceTimezone,
                          use_browser_timezone: c.initialWorkspaceUseBrowserTimeZone,
                        },
                      });
                    })
                : undefined
            }
            resetText={t("settings:SETTINGS_RESET")}
            resetLoading={c.savingKey === "reset:workspace:timezone"}
          >
            <Form.Item name="useBrowserTimeZone" hidden>
              <input type="hidden" />
            </Form.Item>
            <TimezoneLocalizationControl
              selectValue={String(c.workspaceTimezone)}
              switchChecked={c.workspaceUseBrowserTimeZone}
              switchLabel={t("settings:SETTINGS_LOCALIZATION_AUTO_TIMEZONE_SWITCH_TITLE")}
              switchDescription={t("settings:SETTINGS_LOCALIZATION_AUTO_TIMEZONE_SWITCH_DESC")}
              options={c.timezoneOptions}
              onSelectChange={(value) => c.form.setFieldValue("timezone", value)}
              onSwitchChange={(checked) => c.form.setFieldValue("useBrowserTimeZone", checked)}
            />
          </SettingAccordionItem>

          <SettingAccordionItem
            value="workspace_date_format"
            variant="action"
            title={t("setup:SETUP_FIELD_DATE_FORMAT_TITLE")}
            description={t("settings:SETTINGS_WORKSPACE_DATE_FORMAT_DESC")}
            showSummary
            summary={c.workspaceDateFormatLabel}
            placeholder={t("settings:SETTINGS_NOT_SET")}
            keepRendered
            disabled={c.disabled || !c.coreQuery.data}
            confirmText={t("settings:SETTINGS_SAVE")}
            confirmLoading={c.savingKey === "workspace:dateFormat"}
            onConfirm={() =>
              void c.withSavingKey("workspace:dateFormat", async () => {
                await c.patchWorkspaceCoreMutation.mutateAsync({
                  workspace_localization: {
                    date_format: String(c.workspaceDateFormat),
                    use_relative_datetime: c.workspaceUseRelativeDateTime,
                  },
                });
              })
            }
            onReset={
              c.isWorkspaceDateFormatDirty && c.coreQuery.data
                ? () =>
                    void c.withSavingKey("reset:workspace:dateFormat", async () => {
                      c.form.setFieldsValue({
                        dateFormat: c.initialWorkspaceDateFormat,
                        useRelativeDateTime: c.initialWorkspaceUseRelativeDateTime,
                      });
                      await c.patchWorkspaceCoreMutation.mutateAsync({
                        workspace_localization: {
                          date_format: c.initialWorkspaceDateFormat,
                          use_relative_datetime: c.initialWorkspaceUseRelativeDateTime,
                        },
                      });
                    })
                : undefined
            }
            resetText={t("settings:SETTINGS_RESET")}
            resetLoading={c.savingKey === "reset:workspace:dateFormat"}
          >
            <Form.Item name="useRelativeDateTime" hidden>
              <input type="hidden" />
            </Form.Item>
            <DateTimeFormatLocalizationControl
              selectValue={String(c.workspaceDateFormat)}
              switchChecked={c.workspaceUseRelativeDateTime}
              switchLabel={t("settings:SETTINGS_LOCALIZATION_RELATIVE_DATETIME_SWITCH_TITLE")}
              switchDescription={t("settings:SETTINGS_LOCALIZATION_RELATIVE_DATETIME_SWITCH_DESC")}
              options={c.dateFormatOptions}
              onSelectChange={(value) => c.form.setFieldValue("dateFormat", value)}
              onSwitchChange={(checked) => c.form.setFieldValue("useRelativeDateTime", checked)}
            />
          </SettingAccordionItem>
        </Accordion>
      </div>
    </SettingPanel>
  );
}
