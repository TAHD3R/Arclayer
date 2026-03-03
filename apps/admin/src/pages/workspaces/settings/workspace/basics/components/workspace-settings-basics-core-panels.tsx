import { Form, Input, Select } from "antd";

import { Accordion } from "@celestial/ui/accordion";
import { SettingAccordionItem } from "@/components/settings-primitives/setting-accordion-item";
import { SettingPanel } from "@/components/settings-primitives/setting-panel";
import { normalizeLocale } from "@/lib/i18n";

import type { WorkspaceSettingsBasicsController } from "../hooks/use-workspace-settings-basics-controller";

export function WorkspaceSettingsBasicsCorePanels(props: {
  controller: WorkspaceSettingsBasicsController;
}) {
  const c = props.controller;
  const { t } = c;

  return (
    <>
      <SettingPanel
        title={t("settings:SETTINGS_WORKSPACE_BASICS_PANEL_TITLE")}
        description={t("settings:SETTINGS_WORKSPACE_BASICS_PANEL_DESC")}
      >
        <div className="rounded-lg border border-border">
          <Accordion type="single" collapsible className="px-0">
            <SettingAccordionItem
              value="workspace_name"
              variant="action"
              title={t("settings:SETTINGS_WORKSPACE_NAME_LABEL")}
              description={t("settings:SETTINGS_WORKSPACE_NAME_ITEM_DESC")}
              showSummary
              summary={c.currentWorkspaceName}
              placeholder={t("settings:SETTINGS_NOT_SET")}
              keepRendered
              disabled={c.disabled || !c.detailQuery.data}
              confirmText={t("settings:SETTINGS_SAVE")}
              confirmLoading={c.savingKey === "workspace:name"}
              onConfirm={() =>
                void c.withSavingKey("workspace:name", async () => {
                  const values = await c.form.validateFields(["name"]);
                  await c.patchWorkspaceMutation.mutateAsync({
                    name: String(values.name || "").trim(),
                  });
                })
              }
              onReset={
                c.isWorkspaceNameDirty && c.detailQuery.data
                  ? () =>
                      void c.withSavingKey("reset:workspace:name", async () => {
                        c.form.setFieldValue("name", c.initialWorkspaceName);
                        await c.patchWorkspaceMutation.mutateAsync({
                          name: String(c.initialWorkspaceName || "").trim(),
                        });
                      })
                  : undefined
              }
              resetLoading={c.savingKey === "reset:workspace:name"}
            >
              <Form.Item
                name="name"
                rules={[
                  {
                    required: true,
                    message: t("settings:SETTINGS_WORKSPACE_NAME_REQUIRED"),
                  },
                  { max: 128, message: t("settings:SETTINGS_WORKSPACE_NAME_TOO_LONG") },
                ]}
                style={{ marginBottom: 0 }}
              >
                <Input
                  size="large"
                  placeholder={t("settings:SETTINGS_WORKSPACE_NAME_PLACEHOLDER")}
                />
              </Form.Item>
            </SettingAccordionItem>

            <SettingAccordionItem
              value="workspace_slug"
              variant="action"
              title={t("settings:SETTINGS_WORKSPACE_SLUG_LABEL")}
              description={t("settings:SETTINGS_WORKSPACE_SLUG_DESC")}
              showSummary
              summary={c.currentWorkspaceSlug}
              placeholder={t("settings:SETTINGS_NOT_SET")}
              keepRendered
              disabled={c.disabled || !c.detailQuery.data}
              confirmText={t("settings:SETTINGS_SAVE")}
              confirmLoading={c.savingKey === "workspace:slug"}
              onConfirm={() =>
                void c.withSavingKey("workspace:slug", async () => {
                  const values = await c.form.validateFields(["slug"]);
                  await c.patchWorkspaceMutation.mutateAsync({
                    slug: String(values.slug || "").trim(),
                  });
                })
              }
              onReset={
                c.isWorkspaceSlugDirty && c.detailQuery.data
                  ? () =>
                      void c.withSavingKey("reset:workspace:slug", async () => {
                        c.form.setFieldValue("slug", c.initialWorkspaceSlug);
                        await c.patchWorkspaceMutation.mutateAsync({
                          slug: String(c.persistedWorkspaceSlug || "").trim(),
                        });
                      })
                  : undefined
              }
              resetLoading={c.savingKey === "reset:workspace:slug"}
            >
              <div className="space-y-2">
                <Form.Item
                  name="slug"
                  rules={[
                    {
                      required: true,
                      message: t("settings:SETTINGS_WORKSPACE_SLUG_REQUIRED"),
                    },
                    { max: 64, message: t("settings:SETTINGS_WORKSPACE_SLUG_TOO_LONG") },
                  ]}
                  style={{ marginBottom: 0 }}
                >
                  <Input
                    size="large"
                    placeholder={t("settings:SETTINGS_WORKSPACE_SLUG_PLACEHOLDER")}
                  />
                </Form.Item>

                <div className="text-label-secondary">
                  {t("settings:SETTINGS_WORKSPACE_SLUG_PORTAL_HINT", {
                    url: c.portalUrl,
                  })}
                </div>
              </div>
            </SettingAccordionItem>
          </Accordion>
        </div>
      </SettingPanel>

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
                  const values = await c.form.validateFields(["timezone"]);
                  await c.patchWorkspaceCoreMutation.mutateAsync({
                    workspace_localization: { timezone: String(values.timezone) },
                  });
                })
              }
              onReset={
                c.isWorkspaceTimezoneDirty && c.coreQuery.data
                  ? () =>
                      void c.withSavingKey("reset:workspace:timezone", async () => {
                        c.form.setFieldValue("timezone", c.initialWorkspaceTimezone);
                        await c.patchWorkspaceCoreMutation.mutateAsync({
                          workspace_localization: {
                            timezone: c.initialWorkspaceTimezone,
                          },
                        });
                      })
                  : undefined
              }
              resetLoading={c.savingKey === "reset:workspace:timezone"}
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
                  const values = await c.form.validateFields(["dateFormat"]);
                  await c.patchWorkspaceCoreMutation.mutateAsync({
                    workspace_localization: { date_format: String(values.dateFormat) },
                  });
                })
              }
              onReset={
                c.isWorkspaceDateFormatDirty && c.coreQuery.data
                  ? () =>
                      void c.withSavingKey("reset:workspace:dateFormat", async () => {
                        c.form.setFieldValue("dateFormat", c.initialWorkspaceDateFormat);
                        await c.patchWorkspaceCoreMutation.mutateAsync({
                          workspace_localization: {
                            date_format: c.initialWorkspaceDateFormat,
                          },
                        });
                      })
                  : undefined
              }
              resetLoading={c.savingKey === "reset:workspace:dateFormat"}
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
