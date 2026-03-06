import { Form, Input } from "antd";

import { Accordion } from "@celestial/ui/accordion";
import { SettingAccordionItem } from "@celestial/ui/setting-accordion-item";
import { SettingPanel } from "@celestial/ui/setting-panel";

import type { WorkspaceSettingsBasicsController } from "../hooks/use-workspace-settings-basics-controller";
import { WorkspaceSettingsIconAccordionItem } from "./workspace-settings-icon-accordion-item";
import { WorkspaceSettingsBasicsLocalizationPanel } from "./workspace-settings-basics-localization-panel";

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
              resetText={t("settings:SETTINGS_RESET")}
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

            <WorkspaceSettingsIconAccordionItem controller={c} />

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
              resetText={t("settings:SETTINGS_RESET")}
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

      <WorkspaceSettingsBasicsLocalizationPanel controller={c} />
    </>
  );
}
